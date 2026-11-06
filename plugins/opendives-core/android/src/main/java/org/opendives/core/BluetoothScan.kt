// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.getcapacitor.JSObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Looks for dive computers, as Subsurface-mobile on Android
 * (core/btdiscovery.cpp, BTDiscoveryReDiscover): a Bluetooth Low Energy scan,
 * plus the paired devices (Android cannot scan for Bluetooth Classic ones:
 * only the paired ones are known). Each device is reported once per change,
 * by MAC address, with what is known of it: its name, whether it is reached
 * over BLE (seen by the scan, or paired as LE) or Classic (paired as Classic),
 * and the dive computer its name stands for (download.cpp, as
 * btdiscovery.cpp's getDeviceType).
 */
@SuppressLint("MissingPermission")
internal class BluetoothScan(
    private val adapter: BluetoothAdapter,
    private val onDevice: (JSObject) -> Unit,
    private val onStopped: () -> Unit,
) {
    private class Found(val mac: String) {
        var name = ""
        var le = false
        var classic = false
        var bonded = false
        var rssi = 0
        var reported = ""
    }

    private val devices = ConcurrentHashMap<String, Found>()
    /** Devices seen by the scan: they carry their address type for the connection. */
    private val seen = ConcurrentHashMap<String, BluetoothDevice>()
    private val handler = Handler(Looper.getMainLooper())
    @Volatile var scanning = false
        private set

    fun device(mac: String): BluetoothDevice? = seen[mac.uppercase()]

    private val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val d = result.device
            seen[d.address.uppercase()] = d
            val name = result.scanRecord?.deviceName ?: d.name ?: ""
            report(d.address, name, le = true, classic = false, bonded = d.bondState == BluetoothDevice.BOND_BONDED, rssi = result.rssi)
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            for (r in results) onScanResult(0, r)
        }

        override fun onScanFailed(errorCode: Int) {
            Log.w(TAG, "Bluetooth LE scan failed: $errorCode")
            stop()
        }
    }

    private fun report(address: String, name: String, le: Boolean, classic: Boolean, bonded: Boolean, rssi: Int) {
        val mac = address.uppercase()
        val f = devices.getOrPut(mac) { Found(mac) }
        synchronized(f) {
            if (name.isNotEmpty()) f.name = name
            f.le = f.le || le
            f.classic = f.classic || classic
            f.bonded = f.bonded || bonded
            if (rssi != 0) f.rssi = rssi
            val dc = if (f.name.isEmpty()) "null" else NativeCore.dcFromBluetoothName(f.name)
            val key = "${f.name}|${f.le}|${f.classic}|${f.bonded}"
            // The signal strength alone changes all the time: not reported again for it.
            if (key == f.reported) return
            f.reported = key
            val event = JSObject()
                .put("mac", mac)
                .put("name", f.name)
                .put("le", f.le)
                .put("classic", f.classic)
                .put("bonded", f.bonded)
                .put("rssi", f.rssi)
                .put("computer", dc)
            Log.i(TAG, "Bluetooth device $mac '${f.name}' le=${f.le} classic=${f.classic} bonded=${f.bonded}: $dc")
            onDevice(event)
        }
    }

    /** Starts the scan for `durationMs`, after reporting the paired devices. */
    fun start(durationMs: Long) {
        stop(notify = false)
        devices.clear()
        // getBluetoothDevices(): 1 means Classic, 2 means BLE, 3 means dual stack.
        for (d in adapter.bondedDevices.orEmpty()) {
            val type = d.type
            report(
                d.address, d.name ?: "",
                le = type and BluetoothDevice.DEVICE_TYPE_LE != 0,
                classic = type and BluetoothDevice.DEVICE_TYPE_CLASSIC != 0,
                bonded = true, rssi = 0,
            )
        }
        val scanner = adapter.bluetoothLeScanner
        if (scanner == null) {
            Log.w(TAG, "No Bluetooth LE scanner (Bluetooth off?)")
            onStopped()
            return
        }
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        scanner.startScan(null, settings, callback)
        scanning = true
        Log.i(TAG, "Bluetooth LE scan started")
        handler.postDelayed({ stop() }, durationMs)
    }

    fun stop(notify: Boolean = true) {
        handler.removeCallbacksAndMessages(null)
        if (!scanning) return
        scanning = false
        try {
            adapter.bluetoothLeScanner?.stopScan(callback)
        } catch (e: Exception) {
            Log.w(TAG, "Stopping the Bluetooth LE scan", e)
        }
        Log.i(TAG, "Bluetooth LE scan stopped")
        if (notify) onStopped()
    }

    private companion object {
        const val TAG = "OpenDives"
    }
}
