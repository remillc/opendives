// SPDX-License-Identifier: GPL-2.0
// Pont JNI entre le plugin Kotlin et la façade C++.
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
	// libgit2 et le cœur cherchent leur configuration sous $HOME.
	setenv("HOME", to_string(env, home).c_str(), 1);
	if (opendives::init())
		throw_core_error(env, "Initialisation de libgit2 impossible");
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
		throw_core_error(env, "Autorités de certification refusées par libgit2");
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
