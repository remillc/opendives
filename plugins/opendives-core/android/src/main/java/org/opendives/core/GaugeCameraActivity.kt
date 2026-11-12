package org.opendives.core

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.ExifInterface
import android.net.Uri
import android.os.Bundle
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
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.graphics.PathParser
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The full-screen camera that reads cylinder pressures (docs/ui-specification.md,
 * "Reading cylinder pressures from a photo"). Opened by OpenDivesCorePlugin.gaugeCamera
 * with every visible text in the "options" JSON (the app's translation files stay the
 * only place of texts). It ends with one of three results, as the "result" extra:
 * {action: "cancelled"}, {action: "manual"} or {action: "photo", thumbnail, blocks}.
 * When nothing is recognised it stays open on the alert instead of returning.
 *
 * Privacy: the live preview is never stored or analysed; a still capture goes to the app
 * cache and is deleted as soon as it is read (and again when the screen is left); a
 * gallery photo is read through its URI and never copied. Nothing goes over the network.
 */
class GaugeCameraActivity : AppCompatActivity() {
    private lateinit var options: JSONObject
    private lateinit var root: FrameLayout
    private lateinit var preview: PreviewView
    private lateinit var overlay: FrameOverlay
    private lateinit var topBar: LinearLayout
    private lateinit var hints: LinearLayout
    private lateinit var alert: LinearLayout
    private lateinit var bottomRow: FrameLayout
    private lateinit var permissionPanel: LinearLayout
    private lateinit var permissionText: TextView
    private lateinit var permissionButton: Button
    private lateinit var flashButton: PathIconButton
    private lateinit var shutter: View
    private lateinit var manualText: TextView

    private val worker: ExecutorService = Executors.newSingleThreadExecutor()
    private var imageCapture: ImageCapture? = null
    private var camera: Camera? = null
    private var torchOn = false
    private var busy = false
    private var insetTop = 0
    private var insetBottom = 0
    private val captureFile: File by lazy { File(cacheDir, "gauge-capture.jpg") }

    private val requestCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCamera() else showPermissionPanel(denied = true)
    }
    private val pickPhoto = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) analyseGallery(uri)
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
        if (options.optBoolean("nothingRead")) showAlert(true)
        if (hasCameraPermission()) startCamera() else showPermissionPanel(denied = false)
    }

    override fun onDestroy() {
        captureFile.delete()
        worker.shutdown()
        super.onDestroy()
    }

    // --- The views -------------------------------------------------------------------------

    private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)
    private fun dpi(v: Float) = dp(v).toInt()
    private fun str(key: String) = options.optString(key, "")

    private fun label(sp: Float, color: Int, medium: Boolean = false): TextView = TextView(this).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
        setTextColor(color)
        if (medium) typeface = Typeface.create(Typeface.DEFAULT, 500, false)
    }

    private fun buildViews() {
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        preview = PreviewView(this).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        root.addView(preview, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        overlay = FrameOverlay(this)
        root.addView(overlay, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

        // Top: close, title with the cylinder and gas under it, flash.
        topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val close = PathIconButton(this, "M6 6l12 12 M18 6L6 18", str("close")).apply { setOnClickListener { cancel() } }
        topBar.addView(close, dpi(48f), dpi(48f))
        val titles = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        titles.addView(label(20f, Color.WHITE).apply { text = str("title"); ViewCompat.setAccessibilityHeading(this, true) })
        titles.addView(label(14f, 0xFFD7D9DB.toInt()).apply { text = str("subtitle") })
        topBar.addView(titles, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dpi(4f) })
        flashButton = PathIconButton(this, "M13 3L5 14h6l-1 7 8-11h-6z", str("flash")).apply {
            setOnClickListener { toggleTorch() }
            visibility = View.GONE
        }
        topBar.addView(flashButton, dpi(48f), dpi(48f))
        root.addView(topBar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        // Under the frame: the two hint lines, or the alert when nothing was read.
        hints = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        hints.addView(label(16f, Color.WHITE).apply { text = str("hintMain"); gravity = Gravity.CENTER }, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        hints.addView(label(14f, 0xFFD7D9DB.toInt()).apply { text = str("hintSub"); gravity = Gravity.CENTER }, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        root.addView(hints, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        alert = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            visibility = View.GONE
            setPadding(dpi(16f), dpi(12f), dpi(16f), dpi(12f))
            background = GradientDrawable().apply { setColor(0xFF2B2F33.toInt()); cornerRadius = dp(16f) }
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        alert.addView(PathIconButton(this, "M12 3l10 18H2z M12 10v5 M12 18h.01", "", color = 0xFFFF8A80.toInt()), dpi(24f), dpi(24f))
        val alertTexts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        alertTexts.addView(label(16f, Color.WHITE).apply { text = str("nothingTitle") })
        alertTexts.addView(label(14f, 0xFFD7D9DB.toInt()).apply { text = str("nothingText") })
        alert.addView(alertTexts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dpi(12f) })
        root.addView(alert, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            marginStart = dpi(16f)
            marginEnd = dpi(16f)
        })

        // Camera permission: why it is asked, then the system dialog. Photos and manual entry stay available.
        permissionPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            visibility = View.GONE
            setPadding(dpi(32f), 0, dpi(32f), 0)
        }
        permissionText = label(16f, Color.WHITE).apply { gravity = Gravity.CENTER }
        permissionPanel.addView(permissionText)
        permissionButton = filledButton(str("permissionButton")) { requestCamera.launch(Manifest.permission.CAMERA) }
        permissionPanel.addView(permissionButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dpi(40f)).apply { topMargin = dpi(16f) })
        root.addView(permissionPanel, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))

        // Bottom: Photos, the shutter, "Saisir à la main".
        bottomRow = FrameLayout(this)
        val photos = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            contentDescription = str("photosDescription")
            isClickable = true
            setOnClickListener { if (!busy) pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
        }
        photos.addView(PathIconButton(this, "M4 5h16v14H4z M4 15l5-5 4 4 3-3 4 4 M15.5 9.5h.01", "", framed = true), dpi(48f), dpi(48f))
        photos.addView(label(14f, Color.WHITE, medium = true).apply { text = str("photos") }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dpi(4f) })
        bottomRow.addView(photos, FrameLayout.LayoutParams(dpi(96f), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.START or Gravity.CENTER_VERTICAL))

        shutter = ShutterView(this).apply {
            contentDescription = str("shutter")
            isClickable = true
            setOnClickListener { capture() }
        }
        bottomRow.addView(shutter, FrameLayout.LayoutParams(dpi(76f), dpi(76f), Gravity.CENTER))

        manualText = label(14f, Color.WHITE, medium = true).apply {
            text = str("manual")
            gravity = Gravity.CENTER
            isClickable = true
            minHeight = dpi(40f)
            setPadding(dpi(12f), dpi(8f), dpi(12f), dpi(8f))
            setOnClickListener { finishWith(JSONObject().put("action", "manual")) }
        }
        bottomRow.addView(manualText, FrameLayout.LayoutParams(dpi(96f), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END or Gravity.CENTER_VERTICAL))
        root.addView(bottomRow, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM).apply {
            marginStart = dpi(32f)
            marginEnd = dpi(32f)
        })
        setContentView(root)
    }

    private fun filledButton(caption: String, onClick: () -> Unit) = Button(this).apply {
        text = caption
        isAllCaps = false
        setTextColor(0xFF1F2124.toInt())
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = dp(20f) }
        setPadding(dpi(24f), 0, dpi(24f), 0)
        setOnClickListener { onClick() }
    }

    /** Positions what depends on the system bars and on the frame: top bar, frame, hints, alert, bottom row. */
    private fun layoutAround() {
        val w = root.width
        val h = root.height
        if (w == 0 || h == 0) return
        (topBar.layoutParams as FrameLayout.LayoutParams).apply { topMargin = insetTop; marginStart = dpi(4f); marginEnd = dpi(8f) }
        (bottomRow.layoutParams as FrameLayout.LayoutParams).bottomMargin = insetBottom + dpi(56f)
        val frame = overlay.frameFor(w, h)
        overlay.frame = frame
        (hints.layoutParams as FrameLayout.LayoutParams).apply { topMargin = (frame.bottom + dp(70f)).toInt(); marginStart = dpi(24f); marginEnd = dpi(24f) }
        (alert.layoutParams as FrameLayout.LayoutParams).topMargin = (frame.bottom + dp(50f)).toInt()
        topBar.requestLayout()
        bottomRow.requestLayout()
        hints.requestLayout()
        alert.requestLayout()
        overlay.invalidate()
    }

    private fun showAlert(show: Boolean) {
        alert.visibility = if (show) View.VISIBLE else View.GONE
        hints.visibility = if (show) View.INVISIBLE else View.VISIBLE
        // "Saisir à la main" becomes a white filled button.
        if (show) {
            manualText.setTextColor(0xFF1F2124.toInt())
            manualText.background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = dp(20f) }
        } else {
            manualText.setTextColor(Color.WHITE)
            manualText.background = null
        }
    }

    private fun showPermissionPanel(denied: Boolean) {
        permissionPanel.visibility = View.VISIBLE
        permissionText.text = str(if (denied) "permissionDenied" else "permissionReason")
        permissionButton.visibility = if (denied) View.GONE else View.VISIBLE
        shutter.visibility = View.INVISIBLE
        shutter.isClickable = false
        flashButton.visibility = View.GONE
        overlay.visibility = View.INVISIBLE
        hints.visibility = View.INVISIBLE
        alert.visibility = View.GONE
    }

    // --- Camera ----------------------------------------------------------------------------

    private fun hasCameraPermission() = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun startCamera() {
        permissionPanel.visibility = View.GONE
        shutter.visibility = View.VISIBLE
        shutter.isClickable = true
        overlay.visibility = View.VISIBLE
        if (alert.visibility != View.VISIBLE) hints.visibility = View.VISIBLE
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            try {
                val provider = future.get()
                val previewUse = Preview.Builder().build().also { it.setSurfaceProvider(preview.surfaceProvider) }
                val capture = ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build()
                imageCapture = capture
                val group = UseCaseGroup.Builder().addUseCase(previewUse).addUseCase(capture)
                // The picture is cut to what the preview shows, so the frame maps onto it by fractions.
                preview.viewPort?.let { group.setViewPort(it) }
                provider.unbindAll()
                val cam = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, group.build())
                camera = cam
                flashButton.visibility = if (cam.cameraInfo.hasFlashUnit()) View.VISIBLE else View.GONE
            } catch (e: Exception) {
                Log.e(TAG, "camera", e)
                showPermissionPanel(denied = true)
                permissionText.text = str("cameraFailed")
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun toggleTorch() {
        torchOn = !torchOn
        camera?.cameraControl?.enableTorch(torchOn)
        flashButton.filled = torchOn
        flashButton.invalidate()
    }

    private fun capture() {
        val capture = imageCapture ?: return
        if (busy) return
        setBusy(true)
        capture.takePicture(
            ImageCapture.OutputFileOptions.Builder(captureFile).build(),
            ContextCompat.getMainExecutor(this),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    val frame = overlay.frame
                    val rootW = root.width.toFloat()
                    val rootH = root.height.toFloat()
                    worker.execute {
                        try {
                            val bitmap = decode(Uri.fromFile(captureFile), 2048)
                            // Crop to the frame, by fractions of what the preview shows.
                            val cropped = if (bitmap != null && frame != null && rootW > 0f) {
                                crop(bitmap, frame.left / rootW, frame.top / rootH, frame.right / rootW, frame.bottom / rootH)
                            } else bitmap
                            analyse(cropped)
                        } finally {
                            captureFile.delete()
                        }
                    }
                }

                override fun onError(e: ImageCaptureException) {
                    Log.e(TAG, "capture", e)
                    captureFile.delete()
                    setBusy(false)
                    showAlert(true)
                }
            },
        )
    }

    private fun analyseGallery(uri: Uri) {
        setBusy(true)
        worker.execute { analyse(decode(uri, 2048)) }
    }

    private fun setBusy(value: Boolean) {
        runOnUiThread {
            busy = value
            shutter.alpha = if (value) 0.4f else 1f
        }
    }

    /** Reads the picture; with nothing found the camera stays open on the alert, else the result goes to the page. */
    private fun analyse(bitmap: Bitmap?) {
        val blocks = if (bitmap == null) emptyList() else try {
            GaugeRecognizer.recognise(this, bitmap)
        } catch (e: Exception) {
            Log.e(TAG, "recognise", e)
            emptyList()
        }
        if (bitmap == null || blocks.isEmpty()) {
            runOnUiThread {
                setBusy(false)
                showAlert(true)
            }
            return
        }
        val array = JSONArray()
        for (b in blocks) {
            array.put(JSONObject().put("text", b.text).put("left", b.left.toDouble()).put("top", b.top.toDouble()).put("right", b.right.toDouble()).put("bottom", b.bottom.toDouble()).put("confidence", b.confidence.toDouble()))
        }
        val result = JSONObject().put("action", "photo").put("thumbnail", thumbnail(bitmap)).put("blocks", array)
        runOnUiThread { finishWith(result) }
    }

    /** The picture as a small JPEG in base64: all the page keeps of it. */
    private fun thumbnail(bitmap: Bitmap): String {
        val width = minOf(480, bitmap.width)
        val scaled = Bitmap.createScaledBitmap(bitmap, width, maxOf(1, (bitmap.height.toLong() * width / bitmap.width).toInt()), true)
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    /** Decodes a picture (file or content URI) to about `maxSide` pixels, turned upright by its Exif orientation. */
    private fun decode(uri: Uri, maxSide: Int): Bitmap? {
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
            val bitmap = contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return null
            val orientation = contentResolver.openInputStream(uri)?.use {
                ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            } ?: ExifInterface.ORIENTATION_NORMAL
            val m = Matrix()
            when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
                ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
                ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
                else -> return bitmap
            }
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
        } catch (e: Exception) {
            Log.e(TAG, "decode", e)
            null
        }
    }

    private fun crop(bitmap: Bitmap, l: Float, t: Float, r: Float, b: Float): Bitmap {
        val x = (l * bitmap.width).toInt().coerceIn(0, bitmap.width - 1)
        val y = (t * bitmap.height).toInt().coerceIn(0, bitmap.height - 1)
        val w = ((r - l) * bitmap.width).toInt().coerceIn(1, bitmap.width - x)
        val h = ((b - t) * bitmap.height).toInt().coerceIn(1, bitmap.height - y)
        return Bitmap.createBitmap(bitmap, x, y, w, h)
    }

    private fun cancel() = finishWith(JSONObject().put("action", "cancelled"))

    private fun finishWith(result: JSONObject) {
        captureFile.delete()
        setResult(RESULT_OK, Intent().putExtra("result", result.toString()))
        finish()
    }

    // --- Drawing ---------------------------------------------------------------------------

    /** The dimmed outside and the wide rounded frame. */
    private class FrameOverlay(context: Context) : View(context) {
        var frame: RectF? = null
        private val scrim = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x8C000000.toInt() }
        private val clear = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR) }
        private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            color = Color.WHITE
            strokeWidth = 3f * resources.displayMetrics.density
        }

        init {
            // The hole in the scrim needs an offscreen layer.
            setLayerType(LAYER_TYPE_HARDWARE, null)
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        fun frameFor(w: Int, h: Int): RectF {
            val d = resources.displayMetrics.density
            val height = minOf(220f * d, h * 0.4f)
            val top = h * 0.32f
            return RectF(12f * d, top, w - 12f * d, top + height)
        }

        override fun onDraw(canvas: Canvas) {
            val f = frame ?: return
            val radius = 28f * resources.displayMetrics.density
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), scrim)
            canvas.drawRoundRect(f, radius, radius, clear)
            canvas.drawRoundRect(f, radius, radius, line)
        }
    }

    /** A 24 dp stroke icon from an SVG path (24 x 24 grid), centred in its box; clickable when it has a description. */
    private class PathIconButton(
        context: Context,
        data: String,
        description: String,
        private val color: Int = Color.WHITE,
        private val framed: Boolean = false,
    ) : View(context) {
        var filled = false
        private val path: Path = PathParser.createPathFromPathData(data)
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            this.color = this@PathIconButton.color
        }
        private val box = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = 0xFF2B2F33.toInt() }
        private val rim = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.WHITE }

        init {
            if (description.isNotEmpty()) {
                contentDescription = description
                isClickable = true
            } else {
                importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
            }
        }

        override fun onDraw(canvas: Canvas) {
            val d = resources.displayMetrics.density
            if (framed) {
                val r = 12f * d
                val rect = RectF(d, d, width - d, height - d)
                canvas.drawRoundRect(rect, r, r, box)
                rim.strokeWidth = 2f * d
                canvas.drawRoundRect(rect, r, r, rim)
            }
            val size = 24f * d
            canvas.save()
            canvas.translate((width - size) / 2f, (height - size) / 2f)
            canvas.scale(d, d)
            paint.strokeWidth = 2f
            paint.style = if (filled) Paint.Style.FILL_AND_STROKE else Paint.Style.STROKE
            canvas.drawPath(path, paint)
            canvas.restore()
        }
    }

    /** The shutter: a white ring around a white disc. */
    private class ShutterView(context: Context) : View(context) {
        private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.WHITE }
        private val disc = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }

        override fun onDraw(canvas: Canvas) {
            val d = resources.displayMetrics.density
            ring.strokeWidth = 4f * d
            canvas.drawCircle(width / 2f, height / 2f, 36f * d, ring)
            canvas.drawCircle(width / 2f, height / 2f, 30f * d, disc)
        }
    }

    companion object {
        private const val TAG = "GaugeCamera"
    }
}
