// SPDX-License-Identifier: GPL-2.0
// Looks for dive computers with a Bluetooth Low Energy scan, the iOS
// counterpart of the Android BluetoothScan.kt. Pure Objective-C, usable from Swift.
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NSString *_Nonnull (^ODComputerLookup)(NSString *name);

/**
 * A device is reported once per change of what is known of it (name), as an
 * event dictionary with the keys of the JavaScript BluetoothDevice:
 * mac (NSString, the peripheral identifier as "{UUID}", the form the core and
 * ble_connect take after "LE:"), name (NSString), le (YES), classic (NO),
 * bonded (NO), rssi (NSNumber, 0 when unknown), computer (NSString: JSON
 * {vendor, product} or "null", as the Android event carries it).
 * Every block runs on a private serial queue, not on the main queue.
 */
@interface ODBluetoothScan : NSObject

/**
 * @param computerForName JSON of the dive computer a device name stands for
 *        (opendives::dc_from_bluetooth_name), or "null"; nil means always "null".
 */
- (instancetype)initWithComputerForName:(nullable ODComputerLookup)computerForName
				onDevice:(void (^)(NSDictionary<NSString *, id> *event))onDevice
			      onStopped:(void (^)(void))onStopped NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

/**
 * Scans for `durationMs`. `completion` is called once, as soon as the Bluetooth
 * state is known (after the permission prompt on first use): nil when the scan
 * runs, else "NO_BLUETOOTH", "BLUETOOTH_OFF", "PERMISSION" or "CANCELLED" (stop
 * came first), the codes of the Android plugin.
 */
- (void)startWithDurationMs:(NSInteger)durationMs completion:(void (^)(NSString *_Nullable errorCode))completion;

/** Stops the scan; onStopped is called if it was running. */
- (void)stop;

@property(atomic, readonly) BOOL scanning;

/** "granted", "denied" or "prompt", as the JavaScript BluetoothStatus.permission. */
+ (NSString *)permissionState;

@end

NS_ASSUME_NONNULL_END
