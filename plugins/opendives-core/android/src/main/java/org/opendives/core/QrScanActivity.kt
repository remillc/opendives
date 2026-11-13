package org.opendives.core

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The full-screen camera that reads the QR codes of a dive or a plan shared by another phone
 * (inbox task 2026-11-13-102; mock-up scanner-qr-android). Opened by OpenDivesCorePlugin.qrScan
 * with every visible text in the "options" JSON (the app's translation files stay the only
 * place of texts). Ends with {action: "cancelled"} or {action: "done", codes: [...]}, the raw
 * texts of every code of one transfer.
 *
 * The codes follow the header of app/src/lib/qr-transfer.js (keep parseChunk in line with it):
 *   OD1~kind~transfer~index~total~crc~label~data
 * Only the header is read here, to count the codes and show "5 codes lus sur 8"; the contents
 * are checked and decoded by the web layer once every code is in. Nothing is stored and nothing
 * goes over the network. ML Kit's bundled model reads QR codes only.
 */
class QrScanActivity : AppCompatActivity() {
    private class Header(val kind: String, val transfer: String, val index: Int, val total: Int, val label: String)

    private lateinit var options: JSONObject
    private lateinit var root: FrameLayout
    private lateinit var preview: PreviewView
    private lateinit var frameView: FrameView
    private lateinit var topBar: LinearLayout
    private lateinit var panel: LinearLayout
    private lateinit var kindText: TextView
    private lateinit var progressText: TextView
    private lateinit var bar: SegmentBar
    private lateinit var hintText: TextView
    private lateinit var permissionPanel: LinearLayout
    private lateinit var permissionTitle: TextView
    private lateinit var permissionText: TextView
    private lateinit var permissionButton: Button

    private val worker: ExecutorService = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private var scanner: BarcodeScanner? = null
    private var insetTop = 0
    private var insetBottom = 0

    // What has been read: the transfer being collected and its codes, by index.
    private var transfer = ""
    private var kind = ""
    private var label = ""
    private var total = 0
    private val codes = LinkedHashMap<Int, String>()
    // A transfer the diver chose to leave out, and the question being asked.
    private val ignored = HashSet<String>()
    private var asking = false
    private var finished = false

    private val requestCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCamera() else showPermissionPanel(denied = true)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        options = JSONObject(intent.getStringExtra("options") ?: "{}")
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        buildViews()
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            insetTop = bars.top
            insetBottom = bars.bottom
            layoutAround()
            insets
        }
        root.addOnLayoutChangeListener { _, l, t, r, b, ol, ot, or2, ob ->
            if (r - l != or2 - ol || b - t != ob - ot) layoutAround()
        }
        showProgress()
        if (hasCameraPermission()) startCamera() else showPermissionPanel(denied = false)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        scanner?.close()
        worker.shutdown()
        super.onDestroy()
    }

    // --- The views -------------------------------------------------------------------------

    private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)
    private fun dpi(v: Float) = dp(v).toInt()
    private fun str(key: String) = options.optString(key, "")

    private fun label(sp: Float, color: Int, weight: Int = 400): TextView = TextView(this).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
        setTextColor(color)
        typeface = Typeface.create(Typeface.DEFAULT, weight, false)
    }

    private fun buildViews() {
        root = FrameLayout(this).apply { setBackgroundColor(0xFF2B2E33.toInt()) }
        preview = PreviewView(this).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        root.addView(preview, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        frameView = FrameView(this)
        root.addView(frameView, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

        // Top: close and the title.
        topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val close = CloseButton(this, str("close")).apply { setOnClickListener { cancel() } }
        topBar.addView(close, dpi(48f), dpi(48f))
        topBar.addView(
            label(22f, Color.WHITE).apply { text = str("title"); ViewCompat.setAccessibilityHeading(this, true) },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dpi(4f) },
        )
        root.addView(topBar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        // Bottom panel: what is being read, the count, the segmented bar, the hint.
        panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dpi(20f), dpi(20f), dpi(20f), dpi(20f))
            background = GradientDrawable().apply { setColor(0xD1111316.toInt()); cornerRadius = dp(24f) }
        }
        kindText = label(13f, 0xFFE3E1DC.toInt())
        progressText = label(20f, Color.WHITE, 600).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        bar = SegmentBar(this).apply {
            contentDescription = str("progressBar")
        }
        hintText = label(14f, 0xFFE3E1DC.toInt()).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        panel.addView(kindText)
        panel.addView(progressText, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dpi(4f) })
        panel.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dpi(6f)).apply { topMargin = dpi(14f) })
        panel.addView(hintText, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dpi(14f) })
        root.addView(panel, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM).apply {
            marginStart = dpi(16f)
            marginEnd = dpi(16f)
        })

        // The camera permission: why it is asked, then the system dialog; refused, the same kind
        // of screen as the Bluetooth refusal (a title, the reason, "Open settings").
        permissionPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            visibility = View.GONE
            setPadding(dpi(32f), 0, dpi(32f), 0)
        }
        permissionTitle = label(22f, Color.WHITE).apply { gravity = Gravity.CENTER; ViewCompat.setAccessibilityHeading(this, true) }
        permissionText = label(16f, Color.WHITE).apply { gravity = Gravity.CENTER }
        permissionButton = Button(this).apply {
            isAllCaps = false
            setTextColor(0xFF1F2124.toInt())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = dp(20f) }
            setPadding(dpi(24f), 0, dpi(24f), 0)
        }
        permissionPanel.addView(permissionTitle)
        permissionPanel.addView(permissionText, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dpi(12f) })
        permissionPanel.addView(permissionButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dpi(40f)).apply { topMargin = dpi(20f) })
        root.addView(permissionPanel, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        setContentView(root)
    }

    private fun layoutAround() {
        val w = root.width
        val h = root.height
        if (w == 0 || h == 0) return
        (topBar.layoutParams as FrameLayout.LayoutParams).apply { topMargin = insetTop; marginStart = dpi(4f); marginEnd = dpi(8f) }
        (panel.layoutParams as FrameLayout.LayoutParams).bottomMargin = insetBottom + dpi(32f)
        val side = minOf(dp(240f), w * 0.66f)
        val left = (w - side) / 2f
        val top = h * 0.30f
        frameView.frame = RectF(left, top, left + side, top + side)
        topBar.requestLayout()
        panel.requestLayout()
        frameView.invalidate()
    }

    private fun showPermissionPanel(denied: Boolean) {
        permissionPanel.visibility = View.VISIBLE
        panel.visibility = View.INVISIBLE
        frameView.visibility = View.INVISIBLE
        if (denied) {
            permissionTitle.text = str("permissionDeniedTitle")
            permissionTitle.visibility = View.VISIBLE
            permissionText.text = str("permissionDenied")
            permissionButton.text = str("permissionSettings")
            permissionButton.setOnClickListener {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
            }
        } else {
            permissionTitle.visibility = View.GONE
            permissionText.text = str("permissionReason")
            permissionButton.text = str("permissionButton")
            permissionButton.setOnClickListener { requestCamera.launch(Manifest.permission.CAMERA) }
        }
    }

    // --- The panel -------------------------------------------------------------------------

    /** Shows what is known: before the first code the invitation, then the counts and the bar. */
    private fun showProgress() {
        if (total == 0) {
            kindText.visibility = View.GONE
            progressText.visibility = View.GONE
            bar.visibility = View.GONE
            hintText.text = str("hintFirst")
            hintText.setTextColor(0xFFE3E1DC.toInt())
            return
        }
        val kindName = if (kind == "p") str("kindPlan") else str("kindDive")
        kindText.visibility = View.VISIBLE
        kindText.text = if (label.isEmpty()) kindName else "$kindName · $label"
        val n = codes.size
        progressText.visibility = View.VISIBLE
        progressText.text = str(if (n == 1) "progressOne" else "progress").replace("{n}", n.toString()).replace("{total}", total.toString())
        bar.visibility = View.VISIBLE
        bar.set(total, codes.keys)
        bar.contentDescription = str("progressBar")
        hintText.text = str("hint")
        hintText.setTextColor(0xFFE3E1DC.toInt())
    }

    /** A short message in the hint's place (a foreign code); the hint comes back after 3 s. */
    private fun flashMessage(text: String) {
        hintText.text = text
        hintText.setTextColor(0xFFFF8A80.toInt())
        handler.removeCallbacksAndMessages(MESSAGE_TOKEN)
        handler.postAtTime({ if (!finished) showProgress() }, MESSAGE_TOKEN, android.os.SystemClock.uptimeMillis() + 3000)
    }

    // --- Camera and codes ------------------------------------------------------------------

    private fun hasCameraPermission() = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun startCamera() {
        permissionPanel.visibility = View.GONE
        panel.visibility = View.VISIBLE
        frameView.visibility = View.VISIBLE
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            try {
                val provider = future.get()
                val previewUse = Preview.Builder().build().also { it.setSurfaceProvider(preview.surfaceProvider) }
                val reader = BarcodeScanning.getClient(
                    BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build(),
                )
                scanner = reader
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis.setAnalyzer(worker) { image -> analyse(reader, image) }
                provider.unbindAll()
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, previewUse, analysis)
            } catch (e: Exception) {
                Log.e(TAG, "camera", e)
                showPermissionPanel(denied = true)
                permissionTitle.visibility = View.GONE
                permissionText.text = str("cameraFailed")
                permissionButton.visibility = View.GONE
            }
        }, ContextCompat.getMainExecutor(this))
    }

    @androidx.annotation.OptIn(ExperimentalGetImage::class)
    private fun analyse(reader: BarcodeScanner, proxy: ImageProxy) {
        val media = proxy.image
        if (media == null || finished) {
            proxy.close()
            return
        }
        reader.process(InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees))
            .addOnSuccessListener { found ->
                for (code in found) code.rawValue?.let { handleCode(it) }
            }
            .addOnCompleteListener { proxy.close() }
    }

    /** Header of a chunk, or null when the text is not an OpenDives code (same rules as parseChunk). */
    private fun parseHeader(text: String): Header? {
        val parts = text.split("~")
        if (parts.size != 8 || parts[0] != "OD1") return null
        val kind = parts[1]
        val transfer = parts[2]
        val index = parts[3].toIntOrNull()
        val total = parts[4].toIntOrNull()
        if ((kind != "d" && kind != "p") || !TRANSFER.matches(transfer) || !CRC.matches(parts[5])) return null
        if (index == null || total == null || index < 1 || total < 1 || index > total || total > 999) return null
        if (!BASE64URL.matches(parts[6]) || !BASE64URL.matches(parts[7])) return null
        val label = try {
            String(Base64.decode(parts[6], Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP), Charsets.UTF_8)
        } catch (e: IllegalArgumentException) {
            return null
        }
        return Header(kind, transfer, index, total, label)
    }

    private fun handleCode(text: String) {
        if (finished || asking) return
        if (!text.startsWith("OD")) {
            flashMessage(str("foreign"))
            return
        }
        val head = parseHeader(text)
        if (head == null) {
            // "OD2~..." is an OpenDives code of another format version; anything else is foreign.
            flashMessage(if (OTHER_VERSION.matches(text.substringBefore("~"))) str("newerVersion") else str("foreign"))
            return
        }
        if (head.transfer in ignored) return
        if (transfer.isEmpty()) {
            transfer = head.transfer
            kind = head.kind
            label = head.label
            total = head.total
        } else if (head.transfer != transfer) {
            askAboutOtherTransfer(head, text)
            return
        }
        if (head.total != total) return
        if (codes.put(head.index, text) == null) showProgress()
        if (codes.size == total) {
            finished = true
            val list = JSONArray()
            for (i in 1..total) list.put(codes[i])
            finishWith(JSONObject().put("action", "done").put("codes", list))
        }
    }

    /** A code of another transfer: start over only if the diver says so. */
    private fun askAboutOtherTransfer(head: Header, text: String) {
        asking = true
        AlertDialog.Builder(this)
            .setTitle(str("otherTitle"))
            .setMessage(str("otherText"))
            .setPositiveButton(str("otherRestart")) { _, _ ->
                transfer = head.transfer
                kind = head.kind
                label = head.label
                total = head.total
                codes.clear()
                asking = false
                handleCode(text)
            }
            .setNegativeButton(str("otherKeep")) { _, _ ->
                ignored.add(head.transfer)
                asking = false
            }
            .setCancelable(false)
            .show()
    }

    // --- Ending ----------------------------------------------------------------------------

    private fun cancel() = finishWith(JSONObject().put("action", "cancelled"))

    private fun finishWith(result: JSONObject) {
        setResult(RESULT_OK, Intent().putExtra("result", result.toString()))
        finish()
    }

    // --- Drawing ---------------------------------------------------------------------------

    /** The four white corners of the frame the code goes in. */
    private class FrameView(context: Context) : View(context) {
        var frame: RectF? = null
        private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            color = Color.WHITE
            strokeWidth = 5f * resources.displayMetrics.density
            strokeCap = Paint.Cap.ROUND
        }

        init {
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        override fun onDraw(canvas: Canvas) {
            val f = frame ?: return
            val d = resources.displayMetrics.density
            val r = 20f * d
            val a = 40f * d
            val p = Path()
            p.moveTo(f.left, f.top + a); p.lineTo(f.left, f.top + r); p.quadTo(f.left, f.top, f.left + r, f.top); p.lineTo(f.left + a, f.top)
            p.moveTo(f.right - a, f.top); p.lineTo(f.right - r, f.top); p.quadTo(f.right, f.top, f.right, f.top + r); p.lineTo(f.right, f.top + a)
            p.moveTo(f.left, f.bottom - a); p.lineTo(f.left, f.bottom - r); p.quadTo(f.left, f.bottom, f.left + r, f.bottom); p.lineTo(f.left + a, f.bottom)
            p.moveTo(f.right - a, f.bottom); p.lineTo(f.right - r, f.bottom); p.quadTo(f.right, f.bottom, f.right, f.bottom - r); p.lineTo(f.right, f.bottom - a)
            canvas.drawPath(p, line)
        }
    }

    /** The close glyph (an X) in a 48 dp touch target. */
    private class CloseButton(context: Context, description: String) : View(context) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            color = Color.WHITE
            strokeCap = Paint.Cap.ROUND
            strokeWidth = 2f * resources.displayMetrics.density
        }

        init {
            contentDescription = description
            isClickable = true
        }

        override fun onDraw(canvas: Canvas) {
            val d = resources.displayMetrics.density
            val cx = width / 2f
            val cy = height / 2f
            val s = 6f * d
            canvas.drawLine(cx - s, cy - s, cx + s, cy + s, paint)
            canvas.drawLine(cx + s, cy - s, cx - s, cy + s, paint)
        }
    }

    /** The segmented bar: one rounded segment per code, green when read, white at 25 % otherwise. */
    private class SegmentBar(context: Context) : View(context) {
        private var total = 0
        private var read: Set<Int> = emptySet()
        private val readPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF7FD283.toInt() }
        private val restPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x40FFFFFF }

        fun set(total: Int, read: Set<Int>) {
            this.total = total
            this.read = HashSet(read)
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            if (total == 0) return
            val gap = 4f * resources.displayMetrics.density
            val w = (width - gap * (total - 1)) / total
            val r = height / 2f
            for (i in 1..total) {
                val left = (i - 1) * (w + gap)
                canvas.drawRoundRect(left, 0f, left + w, height.toFloat(), r, r, if (i in read) readPaint else restPaint)
            }
        }
    }

    private companion object {
        const val TAG = "QrScan"
        val MESSAGE_TOKEN = Any()
        val TRANSFER = Regex("^[0-9a-z]{6}$")
        val CRC = Regex("^[0-9a-f]{8}$")
        val BASE64URL = Regex("^[A-Za-z0-9_-]*$")
        val OTHER_VERSION = Regex("^OD\\d+$")
    }
}
