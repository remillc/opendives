// SPDX-License-Identifier: GPL-2.0
// JNI bridge between the Kotlin plugin and the C++ façade.
#include "core/libopendives/opendives.h"

#include <jni.h>
#include <cstdlib>
#include <string>

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
	std::string json = "{\"dive\":" + dive_json + ",\"undo\":\"" + quoted(opendives::undo_text());
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

} // extern "C"
