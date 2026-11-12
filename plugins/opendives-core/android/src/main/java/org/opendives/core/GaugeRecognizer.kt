package org.opendives.core

import android.content.Context
import android.graphics.Bitmap
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

/** A piece of text found in a picture; the box is in fractions (0 to 1) of the picture. */
data class GaugeTextBlock(
    val text: String,
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
    val confidence: Float,
)

/**
 * Text recognition for the gauge camera: ML Kit Text Recognition v2 (Latin) with its model
 * bundled in the app, so it works offline and without Google Play services downloads.
 * It only returns what it sees, line by line; every rule about pressures (numbers,
 * grouping, unit, plausibility, confidence threshold) is in the app's JavaScript
 * (app/src/lib/gauge-reading.js). Call it off the main thread.
 */
object GaugeRecognizer {
    @Suppress("UNUSED_PARAMETER")
    fun recognise(context: Context, bitmap: Bitmap): List<GaugeTextBlock> {
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
            val text = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)))
            val w = bitmap.width.toFloat()
            val h = bitmap.height.toFloat()
            val out = ArrayList<GaugeTextBlock>()
            for (block in text.textBlocks) {
                for (line in block.lines) {
                    val box = line.boundingBox ?: continue
                    out.add(
                        GaugeTextBlock(
                            line.text,
                            (box.left / w).coerceIn(0f, 1f),
                            (box.top / h).coerceIn(0f, 1f),
                            (box.right / w).coerceIn(0f, 1f),
                            (box.bottom / h).coerceIn(0f, 1f),
                            line.confidence,
                        ),
                    )
                }
            }
            return out
        } finally {
            recognizer.close()
        }
    }
}
