// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.os.Build
import android.util.Log
import java.io.IOException
import java.util.UUID
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * The Bluetooth primitives of core/compat/bt_transport.h, called by the core
 * through JNI (opendives_jni.cpp, JniBtTransport) during a download, on the
 * core thread. Each call blocks until Android answers or the timeout expires;
 * the packets never reach JavaScript. What to do with them (which service,
 * which characteristics, notifications, credits) is decided in C++, by the
 * port of Subsurface's qt-ble.cpp (core/compat/bluetooth_compat.cpp).
 *
 * Bluetooth Low Energy goes through BluetoothGatt; Bluetooth Classic through
 * an RFCOMM socket of the serial port profile, as Subsurface-mobile does.
 * Permissions are checked by the plugin before a download starts.
 */
@SuppressLint("MissingPermission")
internal class BluetoothTransport(
    private val context: Context,
    private val adapter: BluetoothAdapter,
    /** A device seen by the current scan, by MAC address: it carries its address type. */
    private val scanned: (String) -> BluetoothDevice?,
) {
    @Volatile private var cancelled = false
    @Volatile private var error = ""

    /** Starts a new download: nothing cancelled, nothing open. */
    fun reset() {
        cancelled = false
        error = ""
    }

    /** Ends every wait at once (the core is told by download_cancel()). */
    fun cancel() {
        cancelled = true
        error = "cancelled"
        try {
            socket?.close()
        } catch (_: IOException) {
        }
        synchronized(rfcommLock) { (rfcommLock as Object).notifyAll() }
    }

    fun lastError(): String = error

    // --- Bluetooth Low Energy --------------------------------------------------

    private class Op(val kind: String, val status: Int, val value: ByteArray? = null)

    private var gatt: BluetoothGatt? = null
    @Volatile private var connected = false
    /** Answers of the GATT operations, one at a time (Android allows one operation at a time). */
    private val ops = LinkedBlockingQueue<Op>()
    /** Notifications and indications, in order of arrival: (characteristic, value). */
    private val received = LinkedBlockingQueue<Pair<String, ByteArray>>()

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            Log.i(TAG, "GATT connection state $newState, status $status")
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connected = true
                ops.put(Op("connect", status))
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connected = false
                error = "disconnected (GATT status $status)"
                ops.put(Op("disconnect", status))
            }
        }

        override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {
            Log.i(TAG, "GATT MTU $mtu, status $status")
            ops.put(Op("mtu", status))
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            ops.put(Op("services", status))
        }

        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) {
            ops.put(Op("descriptor", status))
        }

        override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
            ops.put(Op("write", status))
        }

        override fun onCharacteristicRead(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
            ops.put(Op("read", status, value.clone()))
        }

        @Deprecated("Before Android 13")
        override fun onCharacteristicRead(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
            @Suppress("DEPRECATION")
            ops.put(Op("read", status, c.value?.clone()))
        }

        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray) {
            received.put(c.uuid.toString() to value.clone())
        }

        @Deprecated("Before Android 13")
        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
            // Copied at once: the next notification overwrites c.value.
            @Suppress("DEPRECATION")
            received.put(c.uuid.toString() to (c.value?.clone() ?: ByteArray(0)))
        }
    }

    /**
     * Waits for the answer `kind` of the operation just started; null after
     * the timeout, on cancellation, or when the device disconnects.
     */
    private fun await(kind: String, timeoutMs: Int): Op? {
        val end = System.currentTimeMillis() + timeoutMs
        while (!cancelled) {
            val left = end - System.currentTimeMillis()
            if (left <= 0) break
            val op = ops.poll(minOf(left, 100L), TimeUnit.MILLISECONDS) ?: continue
            if (op.kind == kind) return op
            if (op.kind == "disconnect") return null
        }
        if (!cancelled && error.isEmpty()) error = "no answer to $kind within $timeoutMs ms"
        return null
    }

    private fun device(address: String, random: Boolean): BluetoothDevice {
        scanned(address)?.let { return it }
        adapter.bondedDevices?.firstOrNull { it.address.equals(address, ignoreCase = true) }?.let { return it }
        // Not seen by this scan (a remembered computer): its address type is
        // unknown to Android. Subsurface's guess (use_random_address) helps
        // from Android 13 on.
        if (random && Build.VERSION.SDK_INT >= 33) return adapter.getRemoteLeDevice(address, BluetoothDevice.ADDRESS_TYPE_RANDOM)
        return adapter.getRemoteDevice(address)
    }

    fun bleConnect(address: String, random: Boolean, timeoutMs: Int): Boolean {
        error = ""
        ops.clear()
        received.clear()
        val device = try {
            device(address.uppercase(), random)
        } catch (e: IllegalArgumentException) {
            error = "invalid address $address"
            return false
        }
        // OpenDives: Android often fails a first connection with status 133
        // (GATT_ERROR); one more attempt, as Subsurface does on Linux.
        for (attempt in 1..2) {
            Log.i(TAG, "GATT connect to $address (type ${device.type}, attempt $attempt)")
            gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
            val op = await("connect", timeoutMs)
            if (op != null && op.status == BluetoothGatt.GATT_SUCCESS) break
            gatt?.close()
            gatt = null
            connected = false
            if (cancelled || attempt == 2) return false
            Thread.sleep(500)
            ops.clear()
            error = ""
        }
        val g = gatt ?: return false
        // Larger packets, as Qt's Android backend asks (up to 514 bytes of
        // data per notification, the Shearwater buffer in libdivecomputer).
        g.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
        if (g.requestMtu(517)) await("mtu", 5000)
        return connected
    }

    /** One line per item: "S <uuid>", "C <uuid> <properties>", "D <uuid>"; null on failure. */
    fun bleDiscover(timeoutMs: Int): String? {
        val g = gatt ?: return null
        if (!g.discoverServices()) {
            error = "discoverServices refused"
            return null
        }
        val op = await("services", timeoutMs) ?: return null
        if (op.status != BluetoothGatt.GATT_SUCCESS) {
            error = "service discovery status ${op.status}"
            return null
        }
        val out = StringBuilder()
        for (s in g.services) {
            out.append("S ").append(s.uuid).append('\n')
            for (c in s.characteristics) {
                out.append("C ").append(c.uuid).append(' ').append(c.properties).append('\n')
                for (d in c.descriptors) out.append("D ").append(d.uuid).append('\n')
            }
        }
        Log.i(TAG, "GATT services:\n$out")
        return out.toString()
    }

    private fun characteristic(service: String, characteristic: String): BluetoothGattCharacteristic? {
        val c = gatt?.getService(UUID.fromString(service))?.getCharacteristic(UUID.fromString(characteristic))
        if (c == null) error = "characteristic $characteristic not found"
        return c
    }

    /** Retries an operation Android refuses while it is busy, until the timeout. */
    private fun start(timeoutMs: Int, what: String, op: () -> Boolean): Boolean {
        val end = System.currentTimeMillis() + timeoutMs
        while (!cancelled && connected) {
            if (op()) return true
            if (System.currentTimeMillis() > end) break
            Thread.sleep(10)
        }
        if (error.isEmpty()) error = "$what refused"
        return false
    }

    fun bleWriteDescriptor(service: String, characteristic: String, descriptor: String, value: ByteArray, timeoutMs: Int): Boolean {
        val g = gatt ?: return false
        val c = characteristic(service, characteristic) ?: return false
        val d = c.getDescriptor(UUID.fromString(descriptor)) ?: run {
            error = "descriptor $descriptor not found"
            return false
        }
        // The Client Characteristic Configuration: Android also has to
        // deliver the notifications or indications (Qt does it the same way).
        if (descriptor.equals(CCCD, ignoreCase = true)) {
            val on = value.any { it.toInt() != 0 }
            if (!g.setCharacteristicNotification(c, on)) Log.w(TAG, "setCharacteristicNotification refused for $characteristic")
        }
        ops.clear()
        val started = start(timeoutMs, "descriptor write") {
            if (Build.VERSION.SDK_INT >= 33) {
                g.writeDescriptor(d, value) == BluetoothGatt.GATT_SUCCESS
            } else {
                @Suppress("DEPRECATION")
                d.value = value
                @Suppress("DEPRECATION")
                g.writeDescriptor(d)
            }
        }
        if (!started) return false
        val op = await("descriptor", timeoutMs) ?: return false
        if (op.status != BluetoothGatt.GATT_SUCCESS) error = "descriptor write status ${op.status}"
        return op.status == BluetoothGatt.GATT_SUCCESS
    }

    fun bleWrite(service: String, characteristic: String, data: ByteArray, withResponse: Boolean, timeoutMs: Int): Boolean {
        val g = gatt ?: return false
        val c = characteristic(service, characteristic) ?: return false
        val type = if (withResponse) BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT else BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        ops.clear()
        val started = start(timeoutMs, "write") {
            if (Build.VERSION.SDK_INT >= 33) {
                g.writeCharacteristic(c, data, type) == BluetoothGatt.GATT_SUCCESS
            } else {
                c.writeType = type
                @Suppress("DEPRECATION")
                c.value = data
                @Suppress("DEPRECATION")
                g.writeCharacteristic(c)
            }
        }
        if (!started) return false
        // Android answers each write, with or without response, once sent.
        val op = await("write", timeoutMs) ?: return false
        if (op.status != BluetoothGatt.GATT_SUCCESS) error = "write status ${op.status}"
        return op.status == BluetoothGatt.GATT_SUCCESS
    }

    fun bleRead(service: String, characteristic: String, timeoutMs: Int): ByteArray? {
        val g = gatt ?: return null
        val c = characteristic(service, characteristic) ?: return null
        ops.clear()
        if (!start(timeoutMs, "read") { g.readCharacteristic(c) }) return null
        val op = await("read", timeoutMs) ?: return null
        if (op.status != BluetoothGatt.GATT_SUCCESS) {
            error = "read status ${op.status}"
            return null
        }
        return op.value ?: ByteArray(0)
    }

    /** Null when disconnected or cancelled, empty after the timeout, else the UUID (36 bytes) and the data. */
    fun bleReceive(timeoutMs: Int): ByteArray? {
        val end = System.currentTimeMillis() + timeoutMs
        while (!cancelled) {
            val packet = received.poll()
            if (packet != null) return packet.first.toByteArray(Charsets.US_ASCII) + packet.second
            if (!connected) return null
            val left = end - System.currentTimeMillis()
            if (left <= 0) return ByteArray(0)
            val next = received.poll(minOf(left, 100L), TimeUnit.MILLISECONDS)
            if (next != null) return next.first.toByteArray(Charsets.US_ASCII) + next.second
        }
        return null
    }

    fun bleClose() {
        val g = gatt
        gatt = null
        connected = false
        if (g != null) {
            Log.i(TAG, "GATT close")
            g.disconnect()
            g.close()
        }
        received.clear()
        ops.clear()
    }

    // --- Bluetooth Classic, RFCOMM ---------------------------------------------

    private var socket: BluetoothSocket? = null
    private var reader: Thread? = null
    private val rfcommLock = Any()
    private var buffer = ByteArray(0)
    private var rfcommOpen = false

    fun rfcommConnect(address: String, timeoutMs: Int): Boolean {
        error = ""
        val device = try {
            adapter.getRemoteDevice(address.uppercase())
        } catch (e: IllegalArgumentException) {
            error = "invalid address $address"
            return false
        }
        adapter.cancelDiscovery()
        // Subsurface-mobile asks Qt for no security, which opens an insecure
        // socket to the serial port service; then, as Qt falls back, a secure
        // one and channel 1.
        val attempts: List<() -> BluetoothSocket> = listOf(
            { device.createInsecureRfcommSocketToServiceRecord(SPP) },
            { device.createRfcommSocketToServiceRecord(SPP) },
            { device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType).invoke(device, 1) as BluetoothSocket },
        )
        val end = System.currentTimeMillis() + timeoutMs
        for ((i, create) in attempts.withIndex()) {
            if (cancelled || System.currentTimeMillis() > end) break
            val s = try {
                create()
            } catch (e: Exception) {
                error = "RFCOMM socket ${i + 1}: ${e.message}"
                continue
            }
            socket = s
            // connect() has no timeout of its own: closing the socket ends it.
            val watchdog = Thread {
                try {
                    Thread.sleep(maxOf(0L, end - System.currentTimeMillis()))
                    if (!s.isConnected) s.close()
                } catch (_: InterruptedException) {
                } catch (_: IOException) {
                }
            }
            watchdog.start()
            try {
                Log.i(TAG, "RFCOMM connect to $address (attempt ${i + 1})")
                s.connect()
                watchdog.interrupt()
                startReader(s)
                return true
            } catch (e: IOException) {
                watchdog.interrupt()
                error = "RFCOMM connect ${i + 1}: ${e.message}"
                Log.i(TAG, error)
                try {
                    s.close()
                } catch (_: IOException) {
                }
                socket = null
            }
        }
        return false
    }

    private fun startReader(s: BluetoothSocket) {
        synchronized(rfcommLock) {
            buffer = ByteArray(0)
            rfcommOpen = true
        }
        reader = Thread {
            val input = s.inputStream
            val chunk = ByteArray(4096)
            try {
                while (true) {
                    val n = input.read(chunk)
                    if (n < 0) break
                    synchronized(rfcommLock) {
                        buffer += chunk.copyOf(n)
                        (rfcommLock as Object).notifyAll()
                    }
                }
            } catch (e: IOException) {
                if (!cancelled) error = "RFCOMM read: ${e.message}"
            }
            synchronized(rfcommLock) {
                rfcommOpen = false
                (rfcommLock as Object).notifyAll()
            }
        }.apply { isDaemon = true; start() }
    }

    /** At most `size` bytes: null on error, empty after the timeout (negative: none). */
    fun rfcommRead(size: Int, timeoutMs: Int): ByteArray? {
        val end = System.currentTimeMillis() + timeoutMs
        synchronized(rfcommLock) {
            while (buffer.isEmpty()) {
                if (cancelled || !rfcommOpen) return null
                if (timeoutMs >= 0) {
                    val left = end - System.currentTimeMillis()
                    if (left <= 0) return ByteArray(0)
                    (rfcommLock as Object).wait(left)
                } else {
                    (rfcommLock as Object).wait(100)
                }
            }
            val n = minOf(size, buffer.size)
            val out = buffer.copyOf(n)
            buffer = buffer.copyOfRange(n, buffer.size)
            return out
        }
    }

    fun rfcommWrite(data: ByteArray): Int {
        val s = socket ?: return -1
        return try {
            s.outputStream.write(data)
            s.outputStream.flush()
            data.size
        } catch (e: IOException) {
            error = "RFCOMM write: ${e.message}"
            -1
        }
    }

    fun rfcommAvailable(): Int = synchronized(rfcommLock) { buffer.size }

    fun rfcommClose() {
        try {
            socket?.close()
        } catch (_: IOException) {
        }
        socket = null
        reader?.join(2000)
        reader = null
        synchronized(rfcommLock) {
            buffer = ByteArray(0)
            rfcommOpen = false
        }
    }

    private companion object {
        const val TAG = "OpenDives"
        const val CCCD = "00002902-0000-1000-8000-00805f9b34fb"
        val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb")
    }
}
