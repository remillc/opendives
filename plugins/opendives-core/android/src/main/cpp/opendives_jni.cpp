// SPDX-License-Identifier: GPL-2.0
// JNI bridge between the Kotlin plugin and the C++ façade.
#include "core/libopendives/opendives.h"
#include "core/compat/bt_transport.h"

#include <android/log.h>
#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>

static std::string to_string(JNIEnv *env, jstring s)
{
	const char *chars = env->GetStringUTFChars(s, nullptr);
	std::string result(chars);
	env->ReleaseStringUTFChars(s, chars);
	return result;
}

static void throw_core_error(JNIEnv *env, const std::string &message)
{
	jclass cls = env->FindClass("java/lang/IllegalStateException");
	if (cls)
		env->ThrowNew(cls, message.c_str());
}

// --- Bluetooth transport for the download (core/compat/bt_transport.h) ------
//
// Each primitive calls the Kotlin BluetoothTransport, which blocks until the
// Android Bluetooth stack answers or the timeout expires. Every call happens
// during NativeCore.downloadDives(), on its thread: the JNIEnv of that call
// is used throughout. Local references are freed at once: a download makes
// thousands of calls.
namespace {

class JniBtTransport : public opendives_compat::BtTransport {
public:
	JniBtTransport(JNIEnv *env, jobject transport) : env(env), obj(transport)
	{
		jclass cls = env->GetObjectClass(transport);
		m_ble_connect = env->GetMethodID(cls, "bleConnect", "(Ljava/lang/String;ZI)Z");
		m_ble_discover = env->GetMethodID(cls, "bleDiscover", "(I)Ljava/lang/String;");
		m_ble_write_descriptor = env->GetMethodID(
			cls, "bleWriteDescriptor", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;[BI)Z");
		m_ble_write = env->GetMethodID(cls, "bleWrite", "(Ljava/lang/String;Ljava/lang/String;[BZI)Z");
		m_ble_read = env->GetMethodID(cls, "bleRead", "(Ljava/lang/String;Ljava/lang/String;I)[B");
		m_ble_receive = env->GetMethodID(cls, "bleReceive", "(I)[B");
		m_ble_close = env->GetMethodID(cls, "bleClose", "()V");
		m_rfcomm_connect = env->GetMethodID(cls, "rfcommConnect", "(Ljava/lang/String;I)Z");
		m_rfcomm_read = env->GetMethodID(cls, "rfcommRead", "(II)[B");
		m_rfcomm_write = env->GetMethodID(cls, "rfcommWrite", "([B)I");
		m_rfcomm_available = env->GetMethodID(cls, "rfcommAvailable", "()I");
		m_rfcomm_close = env->GetMethodID(cls, "rfcommClose", "()V");
		m_last_error = env->GetMethodID(cls, "lastError", "()Ljava/lang/String;");
		env->DeleteLocalRef(cls);
	}

	bool ble_connect(const std::string &address, bool random_address, int timeout_ms) override
	{
		jstring a = env->NewStringUTF(address.c_str());
		jboolean r = env->CallBooleanMethod(obj, m_ble_connect, a, random_address ? JNI_TRUE : JNI_FALSE, timeout_ms);
		env->DeleteLocalRef(a);
		return !failed() && r;
	}

	// The Kotlin side writes one line per item: "S <uuid>", "C <uuid> <properties>", "D <uuid>".
	bool ble_discover(std::vector<opendives_compat::BleService> &services, int timeout_ms) override
	{
		auto s = static_cast<jstring>(env->CallObjectMethod(obj, m_ble_discover, timeout_ms));
		if (failed() || !s)
			return false;
		std::istringstream lines(to_string(env, s));
		env->DeleteLocalRef(s);
		std::string kind, uuid;
		while (lines >> kind >> uuid) {
			if (kind == "S") {
				services.push_back({ uuid, {} });
			} else if (kind == "C" && !services.empty()) {
				unsigned props = 0;
				lines >> props;
				services.back().characteristics.push_back({ uuid, props, {} });
			} else if (kind == "D" && !services.empty() && !services.back().characteristics.empty()) {
				services.back().characteristics.back().descriptors.push_back(uuid);
			}
		}
		return true;
	}

	bool ble_write_descriptor(const std::string &service, const std::string &characteristic,
				  const std::string &descriptor, const opendives_compat::Bytes &value, int timeout_ms) override
	{
		jstring s = env->NewStringUTF(service.c_str()), c = env->NewStringUTF(characteristic.c_str()),
			d = env->NewStringUTF(descriptor.c_str());
		jbyteArray v = bytes(value.data(), value.size());
		jboolean r = env->CallBooleanMethod(obj, m_ble_write_descriptor, s, c, d, v, timeout_ms);
		env->DeleteLocalRef(s);
		env->DeleteLocalRef(c);
		env->DeleteLocalRef(d);
		env->DeleteLocalRef(v);
		return !failed() && r;
	}

	bool ble_write(const std::string &service, const std::string &characteristic, const opendives_compat::Bytes &data,
		       bool with_response, int timeout_ms) override
	{
		jstring s = env->NewStringUTF(service.c_str()), c = env->NewStringUTF(characteristic.c_str());
		jbyteArray v = bytes(data.data(), data.size());
		jboolean r = env->CallBooleanMethod(obj, m_ble_write, s, c, v, with_response ? JNI_TRUE : JNI_FALSE, timeout_ms);
		env->DeleteLocalRef(s);
		env->DeleteLocalRef(c);
		env->DeleteLocalRef(v);
		return !failed() && r;
	}

	bool ble_read(const std::string &service, const std::string &characteristic, opendives_compat::Bytes &value,
		      int timeout_ms) override
	{
		jstring s = env->NewStringUTF(service.c_str()), c = env->NewStringUTF(characteristic.c_str());
		auto v = static_cast<jbyteArray>(env->CallObjectMethod(obj, m_ble_read, s, c, timeout_ms));
		env->DeleteLocalRef(s);
		env->DeleteLocalRef(c);
		if (failed() || !v)
			return false;
		value = to_bytes(v);
		env->DeleteLocalRef(v);
		return true;
	}

	// Kotlin's bleReceive: null when disconnected or cancelled, empty after
	// the timeout, else the characteristic's UUID (36 bytes) then the data.
	int ble_receive(std::string &characteristic, opendives_compat::Bytes &data, int timeout_ms) override
	{
		auto v = static_cast<jbyteArray>(env->CallObjectMethod(obj, m_ble_receive, timeout_ms));
		if (failed() || !v)
			return -1;
		opendives_compat::Bytes all = to_bytes(v);
		env->DeleteLocalRef(v);
		if (all.empty())
			return 0;
		if (all.size() < 36)
			return -1;
		characteristic.assign(all.begin(), all.begin() + 36);
		data.assign(all.begin() + 36, all.end());
		return 1;
	}

	void ble_close() override
	{
		env->CallVoidMethod(obj, m_ble_close);
		failed();
	}

	bool rfcomm_connect(const std::string &address, int timeout_ms) override
	{
		jstring a = env->NewStringUTF(address.c_str());
		jboolean r = env->CallBooleanMethod(obj, m_rfcomm_connect, a, timeout_ms);
		env->DeleteLocalRef(a);
		return !failed() && r;
	}

	int rfcomm_read(unsigned char *data, size_t size, int timeout_ms) override
	{
		auto v = static_cast<jbyteArray>(env->CallObjectMethod(obj, m_rfcomm_read, static_cast<jint>(size), timeout_ms));
		if (failed() || !v)
			return -1;
		jsize n = env->GetArrayLength(v);
		if (static_cast<size_t>(n) > size)
			n = static_cast<jsize>(size);
		env->GetByteArrayRegion(v, 0, n, reinterpret_cast<jbyte *>(data));
		env->DeleteLocalRef(v);
		return n;
	}

	int rfcomm_write(const unsigned char *data, size_t size) override
	{
		jbyteArray v = bytes(data, size);
		jint r = env->CallIntMethod(obj, m_rfcomm_write, v);
		env->DeleteLocalRef(v);
		return failed() ? -1 : r;
	}

	size_t rfcomm_available() override
	{
		jint r = env->CallIntMethod(obj, m_rfcomm_available);
		return failed() || r < 0 ? 0 : static_cast<size_t>(r);
	}

	void rfcomm_close() override
	{
		env->CallVoidMethod(obj, m_rfcomm_close);
		failed();
	}

	std::string last_error() override
	{
		auto s = static_cast<jstring>(env->CallObjectMethod(obj, m_last_error));
		if (failed() || !s)
			return std::string();
		std::string r = to_string(env, s);
		env->DeleteLocalRef(s);
		return r;
	}

private:
	// A Kotlin exception: logged and cleared, and the call fails.
	bool failed()
	{
		if (!env->ExceptionCheck())
			return false;
		env->ExceptionDescribe();
		env->ExceptionClear();
		__android_log_print(ANDROID_LOG_ERROR, "OpenDives", "Bluetooth transport: exception in Kotlin");
		return true;
	}
	jbyteArray bytes(const unsigned char *data, size_t size)
	{
		jbyteArray v = env->NewByteArray(static_cast<jsize>(size));
		if (size)
			env->SetByteArrayRegion(v, 0, static_cast<jsize>(size), reinterpret_cast<const jbyte *>(data));
		return v;
	}
	opendives_compat::Bytes to_bytes(jbyteArray v)
	{
		jsize n = env->GetArrayLength(v);
		opendives_compat::Bytes out(n);
		if (n)
			env->GetByteArrayRegion(v, 0, n, reinterpret_cast<jbyte *>(out.data()));
		return out;
	}

	JNIEnv *env;
	jobject obj;
	jmethodID m_ble_connect, m_ble_discover, m_ble_write_descriptor, m_ble_write, m_ble_read, m_ble_receive, m_ble_close;
	jmethodID m_rfcomm_connect, m_rfcomm_read, m_rfcomm_write, m_rfcomm_available, m_rfcomm_close, m_last_error;
};

struct ProgressTarget {
	JNIEnv *env;
	jobject listener;
	jmethodID on_progress;
};

void send_progress(const std::string &json, void *userdata)
{
	auto *target = static_cast<ProgressTarget *>(userdata);
	jstring s = target->env->NewStringUTF(json.c_str());
	target->env->CallVoidMethod(target->listener, target->on_progress, s);
	target->env->DeleteLocalRef(s);
	if (target->env->ExceptionCheck()) {
		target->env->ExceptionDescribe();
		target->env->ExceptionClear();
	}
}

} // namespace

extern "C" {

JNIEXPORT void JNICALL
Java_org_opendives_core_NativeCore_init(JNIEnv *env, jobject, jstring home)
{
	// libgit2 and the core look for their configuration under $HOME.
	setenv("HOME", to_string(env, home).c_str(), 1);
	if (opendives::init())
		throw_core_error(env, "Cannot initialize libgit2");
}

JNIEXPORT jboolean JNICALL
Java_org_opendives_core_NativeCore_logExists(JNIEnv *env, jobject, jstring repo)
{
	return opendives::log_exists(to_string(env, repo)) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_org_opendives_core_NativeCore_importFile(JNIEnv *env, jobject, jstring source, jstring repo)
{
	std::string error;
	int count = opendives::import_file(to_string(env, source), to_string(env, repo), error);
	if (count < 0)
		throw_core_error(env, error);
	return count;
}

JNIEXPORT void JNICALL
Java_org_opendives_core_NativeCore_setCaFile(JNIEnv *env, jobject, jstring path)
{
	if (opendives::set_ca_file(to_string(env, path)))
		throw_core_error(env, "Certificate authorities rejected by libgit2");
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_cloudListDives(JNIEnv *env, jobject, jstring email, jstring password)
{
	std::string json, error;
	if (opendives::cloud_list_dives(to_string(env, email), to_string(env, password), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_org_opendives_core_NativeCore_cloudConfigure(JNIEnv *env, jobject, jstring email, jstring password)
{
	std::string url;
	if (opendives::cloud_configure(to_string(env, email), to_string(env, password), url))
		throw_core_error(env, "Incomplete cloud credentials");
}

// Empty string: no local cache yet.
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_cloudListCachedDives(JNIEnv *env, jobject)
{
	std::string json, error;
	if (opendives::cloud_list_cached_dives(json, error) < 0) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_org_opendives_core_NativeCore_cloudSignOut(JNIEnv *env, jobject, jboolean deleteCopy)
{
	std::string error;
	if (opendives::cloud_sign_out(deleteCopy, error))
		throw_core_error(env, error);
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_cloudDeleteAccount(JNIEnv *env, jobject, jstring password, jstring keepDivesIn)
{
	std::string json, error;
	if (opendives::cloud_delete_account(to_string(env, password), to_string(env, keepDivesIn), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// New account and divelogs.de (account.cpp). Credentials are only passed
// through: never kept or logged here.
static jstring json_or_throw(JNIEnv *env, int ret, const std::string &json, const std::string &error)
{
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_cloudCreateAccount(JNIEnv *env, jobject, jstring email, jstring password)
{
	std::string json, error;
	int ret = opendives::cloud_create_account(to_string(env, email), to_string(env, password), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_cloudVerifyPin(JNIEnv *env, jobject, jstring email, jstring password, jstring pin)
{
	std::string json, error;
	int ret = opendives::cloud_verify_pin(to_string(env, email), to_string(env, password), to_string(env, pin), json,
					      error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_cloudCreateLog(JNIEnv *env, jobject, jstring importPath)
{
	std::string json, error;
	int ret = opendives::cloud_create_log(to_string(env, importPath), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_importCount(JNIEnv *env, jobject, jstring path)
{
	std::string json, error;
	int ret = opendives::import_count(to_string(env, path), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_divelogsCheck(JNIEnv *env, jobject, jstring user, jstring password)
{
	std::string json, error;
	int ret = opendives::divelogs_check(to_string(env, user), to_string(env, password), json, error);
	return json_or_throw(env, ret, json, error);
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_divelogsDownload(JNIEnv *env, jobject, jstring user, jstring password, jstring outPath)
{
	std::string json, error;
	int ret = opendives::divelogs_download(to_string(env, user), to_string(env, password), to_string(env, outPath), json,
					       error);
	return json_or_throw(env, ret, json, error);
}

// Editing (edit.cpp). Each returns {"dive":…, "undo":…, "redo":…} or throws the error code.
static jstring edit_result(JNIEnv *env, const std::string &dive_json)
{
	auto quoted = [](const std::string &text) {
		std::string out;
		for (char c: text) {
			if (c == '"' || c == '\\')
				out += '\\';
			out += c;
		}
		return out;
	};
	// A trip step gives the trip ({"tripId":...}), a dive step the dive.
	const char *key = dive_json.rfind("{\"tripId\"", 0) == 0 ? "trip"
			: dive_json.rfind("{\"uuid\"", 0) == 0 ? "site"
			: dive_json.rfind("{\"types\"", 0) == 0 ? "cylinderTypes"
			: dive_json.rfind("{\"listChange\"", 0) == 0 ? "list"
			: dive_json.rfind("{\"presetList\"", 0) == 0 ? "presets" : "dive";
	std::string json = std::string("{\"") + key + "\":" + dive_json + ",\"undo\":\"" + quoted(opendives::undo_text());
	json += "\",\"redo\":\"" + quoted(opendives::redo_text()) + "\"}";
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_editDive(JNIEnv *env, jobject, jint id, jstring changes)
{
	std::string json, error;
	if (opendives::edit_dive(id, to_string(env, changes), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_getTrip(JNIEnv *env, jobject, jint id)
{
	std::string json, error;
	opendives::trip_json(id, json, error);
	return env->NewStringUTF(json.c_str());
}

// One trip change: action is location, notes, remove, split, merge, add or ungroup.
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_tripAction(JNIEnv *env, jobject, jstring actionIn, jint tripId, jint diveId,
					      jint otherId, jintArray diveIds, jstring valueIn)
{
	std::string action = to_string(env, actionIn), value = to_string(env, valueIn), json, error;
	std::vector<int> ids;
	if (diveIds) {
		jsize n = env->GetArrayLength(diveIds);
		ids.resize(n);
		if (n)
			env->GetIntArrayRegion(diveIds, 0, n, ids.data());
	}
	int ret;
	if (action == "location" || action == "notes")
		ret = opendives::edit_trip(tripId, action, value, json, error);
	else if (action == "remove")
		ret = opendives::trip_remove_dive(diveId, json, error);
	else if (action == "split")
		ret = opendives::trip_split_at(diveId, json, error);
	else if (action == "merge")
		ret = opendives::trips_merge(tripId, otherId, json, error);
	else if (action == "add")
		ret = opendives::trip_add_dives(tripId, ids, json, error);
	else if (action == "ungroup")
		ret = opendives::trip_ungroup(tripId, json, error);
	else if (action == "autogroup")
		ret = opendives::trips_autogroup(value == "on", json, error);
	else {
		ret = -1;
		error = "BAD_REQUEST: unknown action " + action;
	}
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Read-only site queries: list, site, nearby, duplicates, without (dives without
// a site), place (country, region and city at a position, in the language `text`).
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_siteQuery(JNIEnv *env, jobject, jstring kindIn, jlong uuid, jint lat, jint lon,
					     jint a, jint b, jstring textIn)
{
	std::string kind = to_string(env, kindIn), json, error;
	if (kind == "list")
		opendives::sites_json(json);
	else if (kind == "site")
		opendives::site_json(static_cast<uint32_t>(uuid), json, error);
	else if (kind == "nearby")
		opendives::site_nearby(lat, lon, a, json);
	else if (kind == "duplicates")
		opendives::sites_duplicates(a, b, json);
	else if (kind == "without")
		opendives::dives_without_site(json);
	else if (kind == "place")
		opendives::place_at(lat, lon, to_string(env, textIn), json);
	else
		json = "null";
	return env->NewStringUTF(json.c_str());
}

// Read-only free filter: "options" (values present in the log) or "dives"
// (identifiers of the matching dives). `rules` holds five strings per rule:
// type, string mode, range mode, negate ("1" or "0"), data (opendives.h).
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_filterQuery(JNIEnv *env, jobject, jstring kindIn, jstring fulltextIn,
					       jstring modeIn, jobjectArray rulesIn)
{
	std::string kind = to_string(env, kindIn), json, error;
	if (kind == "options") {
		opendives::filter_options(json);
		return env->NewStringUTF(json.c_str());
	}
	std::vector<std::string> flat;
	jsize n = rulesIn ? env->GetArrayLength(rulesIn) : 0;
	for (jsize i = 0; i < n; i++) {
		auto s = static_cast<jstring>(env->GetObjectArrayElement(rulesIn, i));
		flat.push_back(s ? to_string(env, s) : std::string());
		if (s)
			env->DeleteLocalRef(s);
	}
	std::vector<opendives::filter_rule> rules;
	for (size_t i = 0; i + 4 < flat.size(); i += 5)
		rules.push_back({ flat[i], flat[i + 1], flat[i + 2], flat[i + 4], flat[i + 3] == "1" });
	if (opendives::filter_dives(to_string(env, fulltextIn), to_string(env, modeIn), rules, json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// Logs a dive by hand: one undoable step (create_dive).
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_createDive(JNIEnv *env, jobject, jstring fields)
{
	std::string json, error;
	if (opendives::create_dive(to_string(env, fields), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Deletes a dive: one undoable step (delete_dive).
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_deleteDive(JNIEnv *env, jobject, jint id)
{
	std::string json, error;
	if (opendives::delete_dive(id, json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Renumbers dives (all of them if ids is empty): one undoable step (renumber_dives).
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_renumberDives(JNIEnv *env, jobject, jintArray diveIds, jint start)
{
	std::vector<int> ids;
	if (diveIds) {
		jsize n = env->GetArrayLength(diveIds);
		ids.resize(n);
		if (n)
			env->GetIntArrayRegion(diveIds, 0, n, ids.data());
	}
	std::string json, error;
	if (opendives::renumber_dives(ids, start, json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Imports a file into the log: one undoable step (import_dives).
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_importDives(JNIEnv *env, jobject, jstring file, jstring source)
{
	std::string json, error;
	if (opendives::import_dives(to_string(env, file), to_string(env, source), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Filter presets: action "list" (read-only), "save" (rules: five strings per
// rule, as filterQuery) or "delete" (index); save and delete are undoable steps.
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_filterPresets(JNIEnv *env, jobject, jstring actionIn, jstring name,
						 jstring fulltext, jstring mode, jobjectArray rulesIn, jint index)
{
	std::string action = to_string(env, actionIn), json, error;
	if (action == "list") {
		opendives::filter_presets_json(json);
		return env->NewStringUTF(json.c_str());
	}
	int ret;
	if (action == "delete") {
		ret = opendives::filter_preset_delete(index, json, error);
	} else {
		std::vector<std::string> flat;
		jsize n = rulesIn ? env->GetArrayLength(rulesIn) : 0;
		for (jsize i = 0; i < n; i++) {
			auto s = static_cast<jstring>(env->GetObjectArrayElement(rulesIn, i));
			flat.push_back(s ? to_string(env, s) : std::string());
			if (s)
				env->DeleteLocalRef(s);
		}
		std::vector<opendives::filter_rule> rules;
		for (size_t i = 0; i + 4 < flat.size(); i += 5)
			rules.push_back({ flat[i], flat[i + 1], flat[i + 2], flat[i + 4], flat[i + 3] == "1" });
		ret = opendives::filter_preset_save(to_string(env, name), to_string(env, fulltext), to_string(env, mode), rules,
						    json, error);
	}
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Sync conflict: the read (sync_conflicts), or the choice of a side (resolve_conflicts).
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_syncConflicts(JNIEnv *env, jobject)
{
	std::string json, error;
	if (opendives::sync_conflicts(json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_org_opendives_core_NativeCore_resolveConflicts(JNIEnv *env, jobject, jstring choices)
{
	std::string error;
	if (opendives::resolve_conflicts(to_string(env, choices), error))
		throw_core_error(env, error);
}

// One undoable site change: create, edit, geocode, merge, delete.
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_siteAction(JNIEnv *env, jobject, jstring actionIn, jlong uuid, jlong other,
					      jlongArray uuidsIn, jstring fieldIn, jstring valueIn, jint lat, jint lon)
{
	std::string action = to_string(env, actionIn), field = to_string(env, fieldIn), value = to_string(env, valueIn);
	std::vector<uint32_t> uuids;
	if (uuidsIn) {
		jsize n = env->GetArrayLength(uuidsIn);
		std::vector<jlong> raw(n);
		if (n)
			env->GetLongArrayRegion(uuidsIn, 0, n, raw.data());
		for (jlong v: raw)
			uuids.push_back(static_cast<uint32_t>(v));
	}
	std::string json, error;
	int ret;
	if (action == "create")
		ret = opendives::site_create(value, lat, lon, json, error);
	else if (action == "edit")
		ret = opendives::site_edit(static_cast<uint32_t>(uuid), field, value, lat, lon, json, error);
	else if (action == "geocode")
		ret = opendives::site_geocode(static_cast<uint32_t>(uuid), value, json, error);
	else if (action == "merge")
		ret = opendives::sites_merge(static_cast<uint32_t>(uuid), static_cast<uint32_t>(other), json, error);
	else if (action == "delete")
		ret = opendives::sites_delete_unused(uuids, json, error);
	else if (action == "deleteSite")
		ret = opendives::site_delete(static_cast<uint32_t>(uuid), json, error);
	else {
		ret = -1;
		error = "BAD_REQUEST: unknown action " + action;
	}
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Read-only tools (tools.cpp): gas (calculator: o2, he in per mille, pO2 in
// mbar, planned depth in mm), cylinders (cylinder types), desaturation (tissues
// now, after the logbook dives).
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_toolQuery(JNIEnv *env, jobject, jstring kindIn, jint o2, jint he, jint po2,
					     jint depth)
{
	std::string kind = to_string(env, kindIn), json, error;
	if (kind == "gas") {
		if (opendives::gas_calculator(o2, he, po2, depth, json, error)) {
			throw_core_error(env, error);
			return nullptr;
		}
	} else if (kind == "cylinders") {
		opendives::gas_cylinder_types(json);
	} else if (kind == "desaturation") {
		opendives::desaturation(0, json);
	} else {
		json = "null";
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_org_opendives_core_NativeCore_setRegionsFile(JNIEnv *env, jobject, jstring path)
{
	opendives::set_regions_file(to_string(env, path));
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_undo(JNIEnv *env, jobject, jboolean redo)
{
	std::string json, error;
	if (redo ? opendives::redo(json, error) : opendives::undo(json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_sync(JNIEnv *env, jobject)
{
	std::string json, error;
	if (opendives::sync(json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_listLoadedDives(JNIEnv *env, jobject)
{
	std::string json;
	opendives::list_loaded_dives(json);
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT void JNICALL
Java_org_opendives_core_NativeCore_saveLocal(JNIEnv *env, jobject)
{
	std::string error;
	if (opendives::save_local(error))
		throw_core_error(env, error);
}

JNIEXPORT void JNICALL
Java_org_opendives_core_NativeCore_setCloudTestEmail(JNIEnv *env, jobject, jstring email)
{
	opendives::set_cloud_test_email(to_string(env, email));
}

// Local commits of the cloud log not yet on the server, as a JSON array.
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_pendingChanges(JNIEnv *env, jobject)
{
	std::string json;
	opendives::pending_changes(json);
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_cloudProbe(JNIEnv *env, jobject)
{
	std::string json, error;
	if (opendives::cloud_probe(json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_getDive(JNIEnv *env, jobject, jint id)
{
	std::string json, error;
	if (opendives::get_dive(id, json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_getPrefs(JNIEnv *env, jobject)
{
	std::string json;
	opendives::get_prefs(json);
	return env->NewStringUTF(json.c_str());
}

// Settings: sets core preferences from a flat JSON object (settings.cpp).
JNIEXPORT void JNICALL
Java_org_opendives_core_NativeCore_setPrefs(JNIEnv *env, jobject, jstring changes)
{
	std::string error;
	if (opendives::set_prefs(to_string(env, changes), error))
		throw_core_error(env, error);
}

// Cylinder types: list, library (set the device's library from `value`), add,
// size, remove, rename (to `value`, one undoable step). Each returns
// {"cylinderTypes":…, "undo":…, "redo":…}.
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_cylinderTypes(JNIEnv *env, jobject, jstring actionIn, jstring nameIn,
						 jstring valueIn, jint ml, jint mbar)
{
	std::string action = to_string(env, actionIn), name = to_string(env, nameIn), value = to_string(env, valueIn);
	std::string json, error;
	int ret;
	if (action == "list")
		ret = opendives::cylinder_types(json);
	else if (action == "library")
		ret = opendives::set_cylinder_library(value, error) ? -1 : opendives::cylinder_types(json);
	else if (action == "standard") {
		opendives::reset_cylinder_library();
		ret = opendives::cylinder_types(json);
	}
	else if (action == "rename")
		ret = opendives::cylinder_type_rename(name, value, json, error);
	else
		ret = opendives::cylinder_type_action(action, name, ml, mbar, json, error);
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return edit_result(env, json);
}

// Dive planner (plan.cpp): read only, nothing is added to the logbook.
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_plannerSetup(JNIEnv *env, jobject)
{
	std::string json;
	opendives::planner_setup(json);
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_planDive(JNIEnv *env, jobject, jstring request)
{
	std::string json, error;
	if (opendives::plan_dive(to_string(env, request), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_listDives(JNIEnv *env, jobject, jstring repo)
{
	std::string json, error;
	if (opendives::list_dives(to_string(env, repo), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// Read-only statistics: "stats" with the criteria as JSON in `text`, or
// "values" with a field name in `text` (opendives.h).
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_statsQuery(JNIEnv *env, jobject, jstring kindIn, jstring textIn)
{
	std::string kind = to_string(env, kindIn), text = to_string(env, textIn), json, error;
	int rc = kind == "values" ? opendives::stats_values(text, json, error) : opendives::stats(text, json, error);
	if (rc) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// Download from a dive computer (download.cpp). The name lookups are
// reentrant: the Bluetooth scan calls them from its own thread.
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_dcFromBluetoothName(JNIEnv *env, jobject, jstring name)
{
	return env->NewStringUTF(opendives::dc_from_bluetooth_name(to_string(env, name)).c_str());
}

JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_dcBluetoothModels(JNIEnv *env, jobject)
{
	return env->NewStringUTF(opendives::dc_bluetooth_models().c_str());
}

// Blocks for the whole download, on the core's thread; `transport` is the
// Kotlin BluetoothTransport, `listener` gets the progress (onProgress).
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_downloadDives(JNIEnv *env, jobject, jstring request, jobject transport,
						 jobject listener)
{
	JniBtTransport bt(env, transport);
	jclass cls = env->GetObjectClass(listener);
	ProgressTarget target { env, listener, env->GetMethodID(cls, "onProgress", "(Ljava/lang/String;)V") };
	env->DeleteLocalRef(cls);
	opendives_compat::set_bt_transport(&bt);
	std::string json, error;
	int ret = opendives::download_dives(to_string(env, request), send_progress, &target, json, error);
	opendives_compat::set_bt_transport(nullptr);
	if (ret) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// The dives received before a failed or cancelled download: count, keep, discard.
JNIEXPORT jstring JNICALL
Java_org_opendives_core_NativeCore_downloadPartial(JNIEnv *env, jobject, jstring action)
{
	std::string json, error;
	if (opendives::download_partial(to_string(env, action), json, error)) {
		throw_core_error(env, error);
		return nullptr;
	}
	return env->NewStringUTF(json.c_str());
}

// Off the core's thread, while downloadDives() runs.
JNIEXPORT void JNICALL
Java_org_opendives_core_NativeCore_downloadCancel(JNIEnv *, jobject)
{
	opendives::download_cancel();
}

} // extern "C"
