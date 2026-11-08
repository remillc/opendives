// SPDX-License-Identifier: GPL-2.0
// Writes a print document (a WebView's) to a PDF file without the print
// dialog. In the android.print package because the layout and write
// callbacks of PrintDocumentAdapter have package-private constructors.
package android.print

import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import java.io.File

class PdfPrint(private val attributes: PrintAttributes) {
    fun print(adapter: PrintDocumentAdapter, file: File, done: (Boolean) -> Unit) {
        adapter.onLayout(null, attributes, null, object : PrintDocumentAdapter.LayoutResultCallback() {
            override fun onLayoutFinished(info: PrintDocumentInfo?, changed: Boolean) {
                val output = ParcelFileDescriptor.open(
                    file,
                    ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE or ParcelFileDescriptor.MODE_READ_WRITE,
                )
                adapter.onWrite(arrayOf(PageRange.ALL_PAGES), output, CancellationSignal(), object : PrintDocumentAdapter.WriteResultCallback() {
                    override fun onWriteFinished(pages: Array<PageRange>?) {
                        output.close()
                        done(true)
                    }

                    override fun onWriteFailed(error: CharSequence?) {
                        output.close()
                        done(false)
                    }
                })
            }

            override fun onLayoutFailed(error: CharSequence?) {
                done(false)
            }
        }, null)
    }
}
