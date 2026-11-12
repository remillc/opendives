// SPDX-License-Identifier: GPL-2.0
// The C++ facade as Swift can call it, the counterpart of opendives_jni.cpp.
// Like the facade, not reentrant: only the plugin's core queue calls these
// methods, except the ones marked "any thread".
//
// A method that fails gives an NSError whose localizedDescription is the
// facade's error text ("CODE: details"), as the JNI bridge throws it.
// Results that the Android bridge returns as JSON text are NSString here;
// the ones it wraps with edit_result() ({"dive"|"trip"|...: ..., "undo", "redo"})
// are wrapped the same way.
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface OpenDivesNative : NSObject

+ (BOOL)initializeWithHome:(NSString *)home error:(NSError **)error;
/** NO when libgit2 rejects the file. */
+ (BOOL)setCaFile:(NSString *)path NS_SWIFT_NAME(setCaFile(_:));
+ (void)setRegionsFile:(NSString *)path;
+ (void)setXsltDir:(NSString *)dir;
/** The messages of the cloud log's git work, on the thread doing the work; nil stops them. */
+ (void)setSyncProgress:(nullable void (^)(NSString *message))handler NS_SWIFT_NAME(setSyncProgress(_:));
+ (void)setCloudTestEmail:(NSString *)email NS_SWIFT_NAME(setCloudTestEmail(_:));

+ (BOOL)logExists:(NSString *)repo;
+ (nullable NSNumber *)countDives:(NSString *)log error:(NSError **)error NS_SWIFT_NAME(countDives(_:));
+ (NSInteger)importFile:(NSString *)source repo:(NSString *)repo error:(NSError **)error NS_SWIFT_NOTHROW;
+ (nullable NSString *)listDives:(NSString *)repo error:(NSError **)error;
+ (nullable NSString *)getDive:(NSInteger)identifier error:(NSError **)error;
+ (NSString *)getPrefs;
+ (BOOL)setPrefs:(NSString *)changes error:(NSError **)error;
+ (nullable NSString *)cylinderTypes:(NSString *)action
				name:(NSString *)name
			       value:(NSString *)value
				  ml:(NSInteger)ml
				mbar:(NSInteger)mbar
			       error:(NSError **)error NS_SWIFT_NAME(cylinderTypes(action:name:value:ml:mbar:));

// Planner
+ (NSString *)plannerSetup;
+ (nullable NSString *)planDive:(NSString *)request error:(NSError **)error NS_SWIFT_NAME(planDive(_:));
+ (NSString *)listPlans;
+ (nullable NSString *)savePlan:(NSString *)request
		      replaceId:(NSInteger)replaceId
			  title:(NSString *)title
			  error:(NSError **)error NS_SWIFT_NAME(savePlan(_:replaceId:title:));

// Cloud account, own git repository, divelogs.de. Credentials are only passed through.
+ (BOOL)cloudConfigure:(NSString *)email
	      password:(NSString *)password
		 error:(NSError **)error NS_SWIFT_NAME(cloudConfigure(email:password:));
+ (nullable NSString *)cloudListDives:(NSString *)email
			     password:(NSString *)password
				error:(NSError **)error NS_SWIFT_NAME(cloudListDives(email:password:));
/** Empty string when there is no local cache yet. */
+ (nullable NSString *)cloudListCachedDivesWithError:(NSError **)error NS_SWIFT_NAME(cloudListCachedDives());
+ (NSString *)pendingChanges;
+ (BOOL)cloudSignOut:(BOOL)deleteCopy error:(NSError **)error NS_SWIFT_NAME(cloudSignOut(deleteCopy:));
+ (nullable NSString *)cloudDeleteAccount:(NSString *)password
			      keepDivesIn:(NSString *)keepDivesIn
				    error:(NSError **)error NS_SWIFT_NAME(cloudDeleteAccount(password:keepDivesIn:));
+ (nullable NSString *)cloudCreateAccount:(NSString *)email
				 password:(NSString *)password
				    error:(NSError **)error NS_SWIFT_NAME(cloudCreateAccount(email:password:));
+ (nullable NSString *)cloudVerifyPin:(NSString *)email
			     password:(NSString *)password
				  pin:(NSString *)pin
				error:(NSError **)error NS_SWIFT_NAME(cloudVerifyPin(email:password:pin:));
+ (nullable NSString *)cloudCreateLog:(NSString *)importPath error:(NSError **)error NS_SWIFT_NAME(cloudCreateLog(importPath:));
+ (nullable NSString *)importCount:(NSString *)path error:(NSError **)error NS_SWIFT_NAME(importCount(_:));
+ (nullable NSString *)divelogsCheck:(NSString *)user
			    password:(NSString *)password
			       error:(NSError **)error NS_SWIFT_NAME(divelogsCheck(user:password:));
+ (nullable NSString *)divelogsDownload:(NSString *)user
			       password:(NSString *)password
				outPath:(NSString *)outPath
				  error:(NSError **)error NS_SWIFT_NAME(divelogsDownload(user:password:outPath:));
/** Network only: may run off the core queue. */
+ (nullable NSString *)gitCheck:(NSString *)url
		       username:(NSString *)username
			  token:(NSString *)token
			  error:(NSError **)error NS_SWIFT_NAME(gitCheck(url:username:token:));
+ (BOOL)gitConfigure:(NSString *)url
	    username:(NSString *)username
	       token:(NSString *)token
	      branch:(NSString *)branch
	       error:(NSError **)error NS_SWIFT_NAME(gitConfigure(url:username:token:branch:));
+ (nullable NSString *)gitCreateLogWithError:(NSError **)error NS_SWIFT_NAME(gitCreateLog());
/** Network only: the one call that may run off the core queue, during a load. */
+ (nullable NSString *)cloudProbeWithError:(NSError **)error NS_SWIFT_NAME(cloudProbe());

// Editing. Each result is the edit_result() object as JSON text.
+ (nullable NSString *)editDive:(NSInteger)identifier
			changes:(NSString *)changes
			  error:(NSError **)error NS_SWIFT_NAME(editDive(_:changes:));
+ (NSString *)getTrip:(NSInteger)tripId NS_SWIFT_NAME(getTrip(_:));
+ (nullable NSString *)tripAction:(NSString *)action
			   tripId:(NSInteger)tripId
			   diveId:(NSInteger)diveId
			  otherId:(NSInteger)otherId
			  diveIds:(nullable NSArray<NSNumber *> *)diveIds
			    value:(NSString *)value
			    error:(NSError **)error NS_SWIFT_NAME(tripAction(_:tripId:diveId:otherId:diveIds:value:));
+ (nullable NSString *)undo:(BOOL)redo error:(NSError **)error NS_SWIFT_NAME(undo(redo:));
+ (nullable NSString *)syncWithError:(NSError **)error NS_SWIFT_NAME(sync());
+ (BOOL)saveLocalWithError:(NSError **)error NS_SWIFT_NAME(saveLocal());
+ (NSString *)listLoadedDives;
+ (NSString *)siteQuery:(NSString *)kind
		   uuid:(int64_t)uuid
		    lat:(NSInteger)lat
		    lon:(NSInteger)lon
		      a:(NSInteger)a
		      b:(NSInteger)b
		   text:(NSString *)text NS_SWIFT_NAME(siteQuery(kind:uuid:lat:lon:a:b:text:));
/** `rules`: five strings per rule: type, string mode, range mode, "1" or "0" for negate, data. */
+ (nullable NSString *)filterQuery:(NSString *)kind
			  fulltext:(NSString *)fulltext
			      mode:(NSString *)mode
			     rules:(NSArray<NSString *> *)rules
			     error:(NSError **)error NS_SWIFT_NAME(filterQuery(kind:fulltext:mode:rules:));
+ (nullable NSString *)createDive:(NSString *)fields error:(NSError **)error NS_SWIFT_NAME(createDive(_:));
+ (nullable NSString *)deleteDives:(NSArray<NSNumber *> *)ids error:(NSError **)error NS_SWIFT_NAME(deleteDives(_:));
+ (nullable NSString *)renumberDives:(NSArray<NSNumber *> *)ids
			       start:(NSInteger)start
			     numbers:(NSArray<NSNumber *> *)numbers
			       error:(NSError **)error NS_SWIFT_NAME(renumberDives(ids:start:numbers:));
+ (nullable NSString *)importDives:(NSString *)file
			    source:(NSString *)source
			     error:(NSError **)error NS_SWIFT_NAME(importDives(file:source:));
+ (nullable NSString *)filterPresets:(NSString *)action
				name:(NSString *)name
			    fulltext:(NSString *)fulltext
				mode:(NSString *)mode
			       rules:(NSArray<NSString *> *)rules
			       index:(NSInteger)index
			       error:(NSError **)error NS_SWIFT_NAME(filterPresets(action:name:fulltext:mode:rules:index:));
+ (nullable NSString *)syncConflictsWithError:(NSError **)error NS_SWIFT_NAME(syncConflicts());
+ (BOOL)resolveConflicts:(NSString *)choices error:(NSError **)error NS_SWIFT_NAME(resolveConflicts(_:));
+ (BOOL)cancelConflictResolutionWithError:(NSError **)error NS_SWIFT_NAME(cancelConflictResolution());
+ (nullable NSString *)statsQuery:(NSString *)kind text:(NSString *)text error:(NSError **)error NS_SWIFT_NAME(statsQuery(kind:text:));
+ (nullable NSString *)siteAction:(NSString *)action
			     uuid:(int64_t)uuid
			    other:(int64_t)other
			    uuids:(nullable NSArray<NSNumber *> *)uuids
			    field:(NSString *)field
			    value:(NSString *)value
			      lat:(NSInteger)lat
			      lon:(NSInteger)lon
			    error:(NSError **)error NS_SWIFT_NAME(siteAction(_:uuid:other:uuids:field:value:lat:lon:));
+ (nullable NSString *)toolQuery:(NSString *)kind
			      o2:(NSInteger)o2
			      he:(NSInteger)he
			     po2:(NSInteger)po2
			   depth:(NSInteger)depth
			    args:(nullable NSArray<NSNumber *> *)args
			   error:(NSError **)error NS_SWIFT_NAME(toolQuery(kind:o2:he:po2:depth:args:));
+ (NSString *)diveComputers;
+ (nullable NSString *)diveComputerAction:(NSString *)action
				    model:(NSString *)model
				   serial:(NSString *)serial
				    value:(NSString *)value
				intoModel:(NSString *)intoModel
			       intoSerial:(NSString *)intoSerial
				    error:(NSError **)error
	NS_SWIFT_NAME(diveComputerAction(_:model:serial:value:intoModel:intoSerial:));
+ (BOOL)exportDives:(NSArray<NSNumber *> *)ids
	     format:(NSString *)format
	  anonymize:(BOOL)anonymize
	       path:(NSString *)path
	      error:(NSError **)error NS_SWIFT_NAME(exportDives(ids:format:anonymize:path:));

// Download from a dive computer. Any thread: dcFromBluetoothName, dcBluetoothModels, downloadCancel.
+ (NSString *)dcFromBluetoothName:(NSString *)name NS_SWIFT_NAME(dcFromBluetoothName(_:));
+ (NSString *)dcBluetoothModels;
/** Starts a new download for the transport (nothing cancelled): call before queueing the download. */
+ (void)resetBluetoothTransport;
/** Blocks for the whole download, on the core queue; `progress` gets the JSON of each progress report. */
+ (nullable NSString *)downloadDives:(NSString *)request
			    progress:(void (^)(NSString *json))progress
			       error:(NSError **)error NS_SWIFT_NAME(downloadDives(request:progress:));
+ (nullable NSString *)downloadPartial:(NSString *)action error:(NSError **)error NS_SWIFT_NAME(downloadPartial(_:));
/** Stops the running download (the core's, and the transport's waits). */
+ (void)downloadCancel;

@end

NS_ASSUME_NONNULL_END
