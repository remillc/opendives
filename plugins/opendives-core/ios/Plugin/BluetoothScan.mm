// SPDX-License-Identifier: GPL-2.0
#import "BluetoothScan.h"

#import <CoreBluetooth/CoreBluetooth.h>

@interface ODScanFound : NSObject
@property(nonatomic, copy) NSString *name;
@property(nonatomic) int rssi;
@property(nonatomic, copy) NSString *reported;
@property(nonatomic) BOOL hasReported;
@end

@implementation ODScanFound
@end

@interface ODBluetoothScan () <CBCentralManagerDelegate>
@property(atomic, readwrite) BOOL scanning;
@end

@implementation ODBluetoothScan {
	ODComputerLookup _computerForName;
	void (^_onDevice)(NSDictionary<NSString *, id> *);
	void (^_onStopped)(void);
	dispatch_queue_t _queue;
	CBCentralManager *_central;
	NSMutableDictionary<NSUUID *, ODScanFound *> *_devices;
	dispatch_source_t _timer;
	// A start waiting for the Bluetooth state.
	void (^_pendingCompletion)(NSString *_Nullable);
	NSInteger _pendingDurationMs;
}

- (instancetype)initWithComputerForName:(nullable ODComputerLookup)computerForName
				onDevice:(void (^)(NSDictionary<NSString *, id> *event))onDevice
			      onStopped:(void (^)(void))onStopped
{
	if ((self = [super init])) {
		_computerForName = [computerForName copy];
		_onDevice = [onDevice copy];
		_onStopped = [onStopped copy];
		_queue = dispatch_queue_create("org.opendives.core.bluetooth.scan", DISPATCH_QUEUE_SERIAL);
		_devices = [NSMutableDictionary dictionary];
	}
	return self;
}

- (void)dealloc
{
	if (_timer)
		dispatch_source_cancel(_timer);
	_central.delegate = nil;
}

+ (NSString *)permissionState
{
	switch (CBCentralManager.authorization) {
	case CBManagerAuthorizationAllowedAlways:
		return @"granted";
	case CBManagerAuthorizationDenied:
	case CBManagerAuthorizationRestricted:
		return @"denied";
	default:
		return @"prompt";
	}
}

- (void)startWithDurationMs:(NSInteger)durationMs completion:(void (^)(NSString *_Nullable))completion
{
	dispatch_async(_queue, ^{
		[self stopNotifying:NO];
		[self cancelPendingStart];
		[self->_devices removeAllObjects];
		self->_pendingCompletion = [completion copy];
		self->_pendingDurationMs = durationMs;
		if (!self->_central) {
			// The first use of CoreBluetooth makes iOS ask for the permission; the
			// state arrives in centralManagerDidUpdateState:.
			self->_central = [[CBCentralManager alloc] initWithDelegate:self queue:self->_queue options:nil];
		} else {
			[self applyState];
		}
	});
}

- (void)stop
{
	dispatch_async(_queue, ^{
		[self cancelPendingStart];
		[self stopNotifying:YES];
	});
}

// On _queue.
- (void)cancelPendingStart
{
	void (^completion)(NSString *_Nullable) = _pendingCompletion;
	_pendingCompletion = nil;
	if (completion)
		completion(@"CANCELLED");
}

// On _queue.
- (void)stopNotifying:(BOOL)notify
{
	if (_timer) {
		dispatch_source_cancel(_timer);
		_timer = nil;
	}
	if (!self.scanning)
		return;
	self.scanning = NO;
	[_central stopScan];
	if (notify)
		_onStopped();
}

// On _queue: starts the scan asked for, or fails it, once the state is known.
- (void)applyState
{
	if (!_pendingCompletion)
		return;
	NSString *code = nil;
	switch (_central.state) {
	case CBManagerStatePoweredOn:
		break;
	case CBManagerStateUnsupported:
		code = @"NO_BLUETOOTH";
		break;
	case CBManagerStateUnauthorized:
		code = @"PERMISSION";
		break;
	case CBManagerStatePoweredOff:
		code = @"BLUETOOTH_OFF";
		break;
	default:
		return; // unknown or resetting: wait for the next update
	}
	void (^completion)(NSString *_Nullable) = _pendingCompletion;
	_pendingCompletion = nil;
	if (!code) {
		// Duplicates are allowed so that a name arriving in a later advertisement is seen;
		// only a change of name is reported.
		[_central scanForPeripheralsWithServices:nil options:@{CBCentralManagerScanOptionAllowDuplicatesKey : @YES}];
		self.scanning = YES;
		_timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, _queue);
		dispatch_source_set_timer(_timer, dispatch_time(DISPATCH_TIME_NOW, (int64_t)_pendingDurationMs * (int64_t)NSEC_PER_MSEC),
					  DISPATCH_TIME_FOREVER, 100 * NSEC_PER_MSEC);
		__weak ODBluetoothScan *weakSelf = self;
		dispatch_source_set_event_handler(_timer, ^{
			[weakSelf stopNotifying:YES];
		});
		dispatch_resume(_timer);
	}
	completion(code);
}

- (void)centralManagerDidUpdateState:(CBCentralManager *)central
{
	if (central.state != CBManagerStatePoweredOn && self.scanning)
		[self stopNotifying:YES];
	[self applyState];
}

- (void)centralManager:(CBCentralManager *)central
 didDiscoverPeripheral:(CBPeripheral *)peripheral
     advertisementData:(NSDictionary<NSString *, id> *)advertisementData
		  RSSI:(NSNumber *)RSSI
{
	if (!self.scanning)
		return;
	ODScanFound *f = _devices[peripheral.identifier];
	if (!f) {
		f = [[ODScanFound alloc] init];
		f.name = @"";
		f.reported = @"";
		_devices[peripheral.identifier] = f;
	}
	NSString *name = advertisementData[CBAdvertisementDataLocalNameKey];
	if (![name isKindOfClass:[NSString class]] || name.length == 0)
		name = peripheral.name;
	if (name.length > 0)
		f.name = name;
	int rssi = RSSI.intValue;
	if (rssi != 127 && rssi != 0) // 127: not available
		f.rssi = rssi;
	// The signal strength alone changes all the time: not reported again for it.
	if (f.hasReported && [f.name isEqualToString:f.reported])
		return;
	f.hasReported = YES;
	f.reported = f.name;
	NSString *computer = (f.name.length && _computerForName) ? _computerForName(f.name) : @"null";
	NSDictionary<NSString *, id> *event = @{
		@"mac" : [NSString stringWithFormat:@"{%@}", peripheral.identifier.UUIDString],
		@"name" : f.name,
		@"le" : @YES,
		@"classic" : @NO,
		@"bonded" : @NO,
		@"rssi" : @(f.rssi),
		@"computer" : computer,
	};
	_onDevice(event);
}

@end
