package org.opendives.core

/**
 * The launch screen stays until the web layer has drawn the first screen
 * (OpenDivesCore.contentShown), so that no blank WebView shows between the
 * two; MainActivity reads this flag, with a time limit in case the web layer
 * never answers.
 */
object SplashGate {
    @Volatile
    var contentShown = false
}
