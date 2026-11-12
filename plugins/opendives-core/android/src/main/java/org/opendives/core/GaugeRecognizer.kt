package org.opendives.core

import android.content.Context
import android.graphics.Bitmap

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
 * Text recognition for the gauge camera. It only returns what it sees; every rule about
 * pressures (numbers, grouping, unit, plausibility, threshold) is in the app's JavaScript
 * (app/src/lib/gauge-reading.js).
 */
object GaugeRecognizer {
    @Suppress("UNUSED_PARAMETER")
    fun recognise(context: Context, bitmap: Bitmap): List<GaugeTextBlock> = emptyList()
}
