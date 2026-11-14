// SPDX-License-Identifier: GPL-2.0
#import "OpenDivesNative.h"

#include "BluetoothTransport.h"
#include "core/compat/bt_transport.h"
#include "core/libopendives/opendives.h"

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

static NSString *const OpenDivesErrorDomain = @"org.opendives.core";

static std::string str(NSString *s)
{
	return std::string(s.UTF8String ?: "");
}

static NSString *ns(const std::string &s)
{
	return [NSString stringWithUTF8String:s.c_str()] ?: @"";
}

static void fail(NSError **out, const std::string &message)
{
	if (out)
		*out = [NSError errorWithDomain:OpenDivesErrorDomain
					   code:1
				       userInfo:@{ NSLocalizedDescriptionKey: ns(message) }];
}

// The facade's usual end: 0 gives the JSON, anything else the error.
static NSString *json_or_fail(int ret, const std::string &json, const std::string &message, NSError **out)
{
	if (ret) {
		fail(out, message);
		return nil;
	}
	return ns(json);
}

static BOOL ok_or_fail(int ret, const std::string &message, NSError **out)
{
	if (ret) {
		fail(out, message);
		return NO;
	}
	return YES;
}

static std::vector<int> ints(NSArray<NSNumber *> *array)
{
	std::vector<int> out;
	for (NSNumber *n in array)
		out.push_back(n.intValue);
	return out;
}

static std::vector<opendives::filter_rule> filter_rules(NSArray<NSString *> *flat)
{
	std::vector<opendives::filter_rule> rules;
	for (NSUInteger i = 0; i + 4 < flat.count; i += 5)
		rules.push_back({ str(flat[i]), str(flat[i + 1]), str(flat[i + 2]), str(flat[i + 4]), str(flat[i + 3]) == "1" });
	return rules;
}

// {"dive"|"trip"|"site"|"cylinderTypes"|"list"|"presets": <result>, "undo": ..., "redo": ...}
// as opendives_jni.cpp's edit_result() writes it.
static std::string quoted(const std::string &text)
{
	std::string out;
	for (unsigned char c : text) {
		if (c == '"' || c == '\\') {
			out += '\\';
			out += (char)c;
		} else if (c < 0x20) {
			char buffer[8];
			snprintf(buffer, sizeof buffer, "\\u%04x", c);
			out += buffer;
		} else {
			out += (char)c;
		}
	}
	return out;
}

static NSString *edit_result(const std::string &result_json)
{
	const char *key = result_json.rfind("{\"tripId\"", 0) == 0 ? "trip"
			: result_json.rfind("{\"uuid\"", 0) == 0 ? "site"
			: result_json.rfind("{\"types\"", 0) == 0 ? "cylinderTypes"
			: result_json.rfind("{\"listChange\"", 0) == 0 ? "list"
			: result_json.rfind("{\"presetList\"", 0) == 0 ? "presets" : "dive";
	std::string json = std::string("{\"") + key + "\":" + result_json + ",\"undo\":\"" + quoted(opendives::undo_text());
	json += "\",\"redo\":\"" + quoted(opendives::redo_text()) + "\"}";
	return ns(json);
}

static NSString *edit_or_fail(int ret, const std::string &json, const std::string &message, NSError **out)
{
	if (ret) {
		fail(out, message);
		return nil;
	}
	return edit_result(json);
}

// One transport for the app's life: CoreBluetooth objects stay.
static opendives_compat::IosBluetoothTransport &transport()
{
	static opendives_compat::IosBluetoothTransport instance;
	return instance;
}

static void send_progress(const std::string &json, void *userdata)
{
	auto handler = (__bridge void (^)(NSString *))userdata;
	handler(ns(json));
}

static void (^sync_handler)(NSString *) = nil;

static void send_sync_progress(const char *message)
{
	void (^handler)(NSString *) = sync_handler;
	if (handler && message)
		handler(ns(message));
}

@implementation OpenDivesNative

+ (BOOL)initializeWithHome:(NSString *)home error:(NSError **)error
{
	// libgit2 and the core look for their configuration under $HOME.
	setenv("HOME", home.fileSystemRepresentation, 1);
	if (opendives::init()) {
		fail(error, "Cannot initialize libgit2");
		return NO;
	}
	return YES;
}

+ (BOOL)setCaFile:(NSString *)path
{
	return opendives::set_ca_file(str(path)) == 0;
}

+ (void)setXsltDir:(NSString *)dir
{
	opendives::set_xslt_dir(str(dir));
}

+ (void)setSyncProgress:(void (^)(NSString *))handler
{
	opendives::set_sync_progress(nullptr);
	sync_handler = [handler copy];
	if (handler)
		opendives::set_sync_progress(send_sync_progress);
}

+ (void)setCloudTestEmail:(NSString *)email
{
	opendives::set_cloud_test_email(str(email));
}

+ (BOOL)logExists:(NSString *)repo
{
	return opendives::log_exists(str(repo));
}

+ (NSNumber *)countDives:(NSString *)log error:(NSError **)error
{
	std::string message;
	int count = opendives::count_dives(str(log), message);
	if (count < 0) {
		fail(error, message);
		return nil;
	}
	return @(count);
}

+ (NSInteger)importFile:(NSString *)source repo:(NSString *)repo error:(NSError **)error
{
	std::string message;
	int count = opendives::import_file(str(source), str(repo), message);
	if (count < 0)
		fail(error, message);
	return count;
}

+ (NSString *)listDives:(NSString *)repo error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::list_dives(str(repo), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)getDive:(NSInteger)identifier error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::get_dive((int)identifier, json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)getPrefs
{
	std::string json;
	opendives::get_prefs(json);
	return ns(json);
}

+ (BOOL)setPrefs:(NSString *)changes error:(NSError **)error
{
	std::string message;
	return ok_or_fail(opendives::set_prefs(str(changes), message), message, error);
}

// Each returns {"cylinderTypes":..., "undo":..., "redo":...}.
+ (NSString *)cylinderTypes:(NSString *)actionIn
			name:(NSString *)nameIn
		       value:(NSString *)valueIn
			  ml:(NSInteger)ml
			mbar:(NSInteger)mbar
		       error:(NSError **)error
{
	std::string action = str(actionIn), name = str(nameIn), value = str(valueIn);
	std::string json, message;
	int ret;
	if (action == "list") {
		ret = opendives::cylinder_types(json);
	} else if (action == "library") {
		ret = opendives::set_cylinder_library(value, message) ? -1 : opendives::cylinder_types(json);
	} else if (action == "standard") {
		opendives::reset_cylinder_library();
		ret = opendives::cylinder_types(json);
	} else if (action == "rename") {
		ret = opendives::cylinder_type_rename(name, value, json, message);
	} else {
		ret = opendives::cylinder_type_action(action, name, (int)ml, (int)mbar, json, message);
	}
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)plannerSetup
{
	std::string json;
	opendives::planner_setup(json);
	return ns(json);
}

+ (NSString *)planDive:(NSString *)request error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::plan_dive(str(request), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)listPlans
{
	std::string json;
	opendives::list_plans(json);
	return ns(json);
}

+ (NSString *)savePlan:(NSString *)request replaceId:(NSInteger)replaceId title:(NSString *)title error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::save_plan(str(request), (int)replaceId, json, message, str(title));
	return edit_or_fail(ret, json, message, error);
}

// --- Cloud account, own git repository, divelogs.de -------------------------

+ (BOOL)cloudConfigure:(NSString *)email password:(NSString *)password error:(NSError **)error
{
	std::string url;
	if (opendives::cloud_configure(str(email), str(password), url)) {
		fail(error, "Incomplete cloud credentials");
		return NO;
	}
	return YES;
}

+ (NSString *)cloudListDives:(NSString *)email password:(NSString *)password error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::cloud_list_dives(str(email), str(password), json, message);
	return json_or_fail(ret, json, message, error);
}

// Empty string: no local cache yet (the facade returns 1).
+ (NSString *)cloudListCachedDivesWithError:(NSError **)error
{
	std::string json, message;
	int ret = opendives::cloud_list_cached_dives(json, message);
	if (ret < 0) {
		fail(error, message);
		return nil;
	}
	return ns(json);
}

+ (NSString *)pendingChanges
{
	std::string json;
	opendives::pending_changes(json);
	return ns(json);
}

+ (BOOL)cloudSignOut:(BOOL)deleteCopy error:(NSError **)error
{
	std::string message;
	return ok_or_fail(opendives::cloud_sign_out(deleteCopy, message), message, error);
}

+ (NSString *)cloudDeleteAccount:(NSString *)password keepDivesIn:(NSString *)keepDivesIn error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::cloud_delete_account(str(password), str(keepDivesIn), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)cloudCreateAccount:(NSString *)email password:(NSString *)password error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::cloud_create_account(str(email), str(password), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)cloudVerifyPin:(NSString *)email password:(NSString *)password pin:(NSString *)pin error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::cloud_verify_pin(str(email), str(password), str(pin), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)cloudCreateLog:(NSString *)importPath error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::cloud_create_log(str(importPath), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)importCount:(NSString *)path error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::import_count(str(path), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)divelogsCheck:(NSString *)user password:(NSString *)password error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::divelogs_check(str(user), str(password), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)divelogsDownload:(NSString *)user
		      password:(NSString *)password
		       outPath:(NSString *)outPath
			 error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::divelogs_download(str(user), str(password), str(outPath), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)gitCheck:(NSString *)url username:(NSString *)username token:(NSString *)token error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::git_check(str(url), str(username), str(token), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (BOOL)gitConfigure:(NSString *)url
	    username:(NSString *)username
	       token:(NSString *)token
	      branch:(NSString *)branch
	       error:(NSError **)error
{
	std::string address, message;
	return ok_or_fail(opendives::git_configure(str(url), str(username), str(token), str(branch), address, message),
			  message, error);
}

+ (NSString *)gitCreateLogWithError:(NSError **)error
{
	std::string json, message;
	int ret = opendives::git_create_log(json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)cloudProbeWithError:(NSError **)error
{
	std::string json, message;
	int ret = opendives::cloud_probe(json, message);
	return json_or_fail(ret, json, message, error);
}

// --- Editing ------------------------------------------------------------------

+ (NSString *)editDive:(NSInteger)identifier changes:(NSString *)changes error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::edit_dive((int)identifier, str(changes), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)getTrip:(NSInteger)tripId
{
	std::string json, message;
	opendives::trip_json((int)tripId, json, message);
	return ns(json);
}

// action: location, notes, remove, split, merge, add, ungroup, create, autogroup.
+ (NSString *)tripAction:(NSString *)actionIn
		  tripId:(NSInteger)tripId
		  diveId:(NSInteger)diveId
		 otherId:(NSInteger)otherId
		 diveIds:(NSArray<NSNumber *> *)diveIds
		   value:(NSString *)valueIn
		   error:(NSError **)error
{
	std::string action = str(actionIn), value = str(valueIn), json, message;
	std::vector<int> ids = ints(diveIds);
	int ret;
	if (action == "location" || action == "notes")
		ret = opendives::edit_trip((int)tripId, action, value, json, message);
	else if (action == "remove")
		ret = ids.empty() ? opendives::trip_remove_dive((int)diveId, json, message)
				  : opendives::trip_remove_dives(ids, json, message);
	else if (action == "split")
		ret = opendives::trip_split_at((int)diveId, json, message);
	else if (action == "merge")
		ret = opendives::trips_merge((int)tripId, (int)otherId, json, message);
	else if (action == "add")
		ret = opendives::trip_add_dives((int)tripId, ids, json, message);
	else if (action == "ungroup")
		ret = opendives::trip_ungroup((int)tripId, json, message);
	else if (action == "create")
		ret = opendives::trip_create(ids, json, message);
	else if (action == "autogroup")
		ret = opendives::trips_autogroup(value == "on", json, message);
	else {
		ret = -1;
		message = "BAD_REQUEST: unknown action " + action;
	}
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)undo:(BOOL)redo error:(NSError **)error
{
	std::string json, message;
	int ret = redo ? opendives::redo(json, message) : opendives::undo(json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)syncWithError:(NSError **)error
{
	std::string json, message;
	int ret = opendives::sync(json, message);
	return json_or_fail(ret, json, message, error);
}

+ (BOOL)saveLocalWithError:(NSError **)error
{
	std::string message;
	return ok_or_fail(opendives::save_local(message), message, error);
}

+ (NSString *)listLoadedDives
{
	std::string json;
	opendives::list_loaded_dives(json);
	return ns(json);
}

// kind: list, site, nearby, duplicates, without, place; anything else gives "null".
+ (NSString *)siteQuery:(NSString *)kindIn
		   uuid:(int64_t)uuid
		    lat:(NSInteger)lat
		    lon:(NSInteger)lon
		      a:(NSInteger)a
		      b:(NSInteger)b
		   text:(NSString *)text
{
	std::string kind = str(kindIn), json, message;
	if (kind == "list")
		opendives::sites_json(json);
	else if (kind == "site")
		opendives::site_json(static_cast<uint32_t>(uuid), json, message);
	else if (kind == "nearby")
		opendives::site_nearby((int)lat, (int)lon, (int)a, json);
	else if (kind == "duplicates")
		opendives::sites_duplicates((int)a, (int)b, json);
	else if (kind == "without")
		opendives::dives_without_site(json);
	else
		json = "null";
	return ns(json);
}

+ (NSString *)filterQuery:(NSString *)kindIn
		 fulltext:(NSString *)fulltext
		     mode:(NSString *)mode
		    rules:(NSArray<NSString *> *)rules
		    error:(NSError **)error
{
	std::string kind = str(kindIn), json, message;
	if (kind == "options") {
		opendives::filter_options(json);
		return ns(json);
	}
	if (kind == "search") {
		opendives::search_dives(str(fulltext), json, message);
		return ns(json);
	}
	int ret = opendives::filter_dives(str(fulltext), str(mode), filter_rules(rules), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)createDive:(NSString *)fields error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::create_dive(str(fields), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)deleteDives:(NSArray<NSNumber *> *)ids error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::delete_dives(ints(ids), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)renumberDives:(NSArray<NSNumber *> *)ids
		      start:(NSInteger)start
		    numbers:(NSArray<NSNumber *> *)numbers
		      error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::renumber_dives(ints(ids), (int)start, json, message, ints(numbers));
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)importDives:(NSString *)file source:(NSString *)source error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::import_dives(str(file), str(source), json, message);
	return edit_or_fail(ret, json, message, error);
}

// action: list (read-only, the plain object), save or delete (undoable steps).
+ (NSString *)filterPresets:(NSString *)actionIn
		       name:(NSString *)name
		   fulltext:(NSString *)fulltext
		       mode:(NSString *)mode
		      rules:(NSArray<NSString *> *)rules
		      index:(NSInteger)index
		      error:(NSError **)error
{
	std::string action = str(actionIn), json, message;
	if (action == "list") {
		opendives::filter_presets_json(json);
		return ns(json);
	}
	int ret;
	if (action == "delete")
		ret = opendives::filter_preset_delete((int)index, json, message);
	else
		ret = opendives::filter_preset_save(str(name), str(fulltext), str(mode), filter_rules(rules), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (NSString *)syncConflictsWithError:(NSError **)error
{
	std::string json, message;
	int ret = opendives::sync_conflicts(json, message);
	return json_or_fail(ret, json, message, error);
}

+ (BOOL)resolveConflicts:(NSString *)choices error:(NSError **)error
{
	std::string message;
	return ok_or_fail(opendives::resolve_conflicts(str(choices), message), message, error);
}

+ (BOOL)cancelConflictResolutionWithError:(NSError **)error
{
	std::string message;
	return ok_or_fail(opendives::cancel_conflict_resolution(message), message, error);
}

// kind "values": `text` is a field name; otherwise the criteria as JSON.
+ (NSString *)statsQuery:(NSString *)kind text:(NSString *)text error:(NSError **)error
{
	std::string json, message;
	int ret = [kind isEqualToString:@"values"] ? opendives::stats_values(str(text), json, message)
						   : opendives::stats(str(text), json, message);
	return json_or_fail(ret, json, message, error);
}

// action: create, edit, geocode, merge, delete, deleteSite.
+ (NSString *)siteAction:(NSString *)actionIn
		    uuid:(int64_t)uuid
		   other:(int64_t)other
		   uuids:(NSArray<NSNumber *> *)uuidsIn
		   field:(NSString *)fieldIn
		   value:(NSString *)valueIn
		     lat:(NSInteger)lat
		     lon:(NSInteger)lon
		 country:(NSString *)country
		  region:(NSString *)region
		  county:(NSString *)county
		    city:(NSString *)city
		   error:(NSError **)error
{
	std::string action = str(actionIn), field = str(fieldIn), value = str(valueIn);
	std::vector<uint32_t> uuids;
	for (NSNumber *n in uuidsIn)
		uuids.push_back(static_cast<uint32_t>(n.longLongValue));
	std::string json, message;
	int ret;
	if (action == "create")
		ret = opendives::site_create(value, (int)lat, (int)lon, json, message);
	else if (action == "edit")
		ret = opendives::site_edit(static_cast<uint32_t>(uuid), field, value, (int)lat, (int)lon, json, message);
	else if (action == "geocode")
		ret = opendives::site_geocode(static_cast<uint32_t>(uuid), str(country), str(region), str(county), str(city), json, message);
	else if (action == "merge")
		ret = opendives::sites_merge(static_cast<uint32_t>(uuid), static_cast<uint32_t>(other), json, message);
	else if (action == "delete")
		ret = opendives::sites_delete_unused(uuids, json, message);
	else if (action == "deleteSite")
		ret = opendives::site_delete(static_cast<uint32_t>(uuid), json, message);
	else {
		ret = -1;
		message = "BAD_REQUEST: unknown action " + action;
	}
	return edit_or_fail(ret, json, message, error);
}

// kind: cylinders, weights, desaturation; anything else gives "null".
+ (NSString *)toolQuery:(NSString *)kindIn error:(NSError **)error
{
	std::string kind = str(kindIn), json;
	if (kind == "cylinders") {
		opendives::gas_cylinder_types(json);
	} else if (kind == "weights") {
		opendives::weight_types(json);
	} else if (kind == "desaturation") {
		opendives::desaturation(0, json);
	} else {
		json = "null";
	}
	return ns(json);
}

+ (NSString *)diveComputers
{
	std::string json;
	opendives::dive_computers(json);
	return ns(json);
}

+ (NSString *)diveComputerAction:(NSString *)action
			   model:(NSString *)model
			  serial:(NSString *)serial
			   value:(NSString *)value
		       intoModel:(NSString *)intoModel
		      intoSerial:(NSString *)intoSerial
			   error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::dive_computer_action(str(action), str(model), str(serial), str(value), str(intoModel),
						  str(intoSerial), json, message);
	return edit_or_fail(ret, json, message, error);
}

+ (BOOL)exportDives:(NSArray<NSNumber *> *)ids
	     format:(NSString *)format
	  anonymize:(BOOL)anonymize
	       path:(NSString *)path
	      error:(NSError **)error
{
	std::string message;
	return ok_or_fail(opendives::export_dives(ints(ids), str(format), anonymize, str(path), message), message, error);
}

// --- Download from a dive computer ---------------------------------------------

+ (NSString *)dcFromBluetoothName:(NSString *)name
{
	return ns(opendives::dc_from_bluetooth_name(str(name)));
}

+ (NSString *)dcBluetoothModels
{
	return ns(opendives::dc_bluetooth_models());
}

+ (void)resetBluetoothTransport
{
	transport().reset();
}

+ (NSString *)downloadDives:(NSString *)request progress:(void (^)(NSString *))progress error:(NSError **)error
{
	void (^handler)(NSString *) = [progress copy];
	opendives_compat::set_bt_transport(&transport());
	std::string json, message;
	int ret = opendives::download_dives(str(request), send_progress, (__bridge void *)handler, json, message);
	opendives_compat::set_bt_transport(nullptr);
	return json_or_fail(ret, json, message, error);
}

+ (NSString *)downloadPartial:(NSString *)action error:(NSError **)error
{
	std::string json, message;
	int ret = opendives::download_partial(str(action), json, message);
	return json_or_fail(ret, json, message, error);
}

+ (void)downloadCancel
{
	opendives::download_cancel();
	transport().cancel();
}

@end
