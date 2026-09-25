package com.allinoneerp.app

import android.content.ContentValues
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File

class MainActivity : TauriActivity() {
  // Keeps the off-screen print WebView alive until the system print dialog has taken the job.
  private var printView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    // Back on the first screen: send the app to the background (like Home) instead of destroying the
    // activity, which tears down the Rust runtime and can crash on the way out. Registered before
    // Tauri's own handler, so it only runs once Tauri has no page history left to go back through.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        moveTaskToBack(true)
      }
    })
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Edge-to-edge is mandatory on Android 15+: pad the app so nothing sits under the
    // status bar, navigation bar, camera cutout or the on-screen keyboard.
    val root = findViewById<android.view.View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(Bridge(), "AndroidBridge")
  }

  // Called from lib/utils.ts (printDocument, downloadCsv) when running inside the Android app.
  inner class Bridge {
    @JavascriptInterface
    fun print(html: String, title: String) {
      runOnUiThread {
        val view = WebView(this@MainActivity)
        view.webViewClient = object : WebViewClient() {
          override fun onPageFinished(page: WebView, url: String?) {
            val manager = getSystemService(PRINT_SERVICE) as PrintManager
            manager.print(title, page.createPrintDocumentAdapter(title), PrintAttributes.Builder().build())
          }
        }
        view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
        printView = view
      }
    }

    // Saves a file to the phone's Downloads folder and returns where it went.
    @JavascriptInterface
    fun saveFile(name: String, mime: String, base64: String): String {
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_")
      val where = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, safe)
          put(MediaStore.Downloads.MIME_TYPE, mime)
          put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
          ?: throw IllegalStateException("Could not create the file")
        contentResolver.openOutputStream(uri)!!.use { it.write(bytes) }
        values.clear()
        values.put(MediaStore.Downloads.IS_PENDING, 0)
        contentResolver.update(uri, values, null, null)
        "Downloads/$safe"
      } else {
        val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)!!
        File(dir, safe).writeBytes(bytes)
        "${dir.absolutePath}/$safe"
      }
      runOnUiThread { Toast.makeText(this@MainActivity, "Saved to $where", Toast.LENGTH_LONG).show() }
      return where
    }
  }
}
