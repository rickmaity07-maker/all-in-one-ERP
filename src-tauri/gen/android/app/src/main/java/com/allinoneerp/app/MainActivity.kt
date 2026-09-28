package com.allinoneerp.app

import android.content.ContentValues
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentAdapter.LayoutResultCallback
import android.print.PrintDocumentAdapter.WriteResultCallback
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
  private var webViewRef: WebView? = null
  // While a teacher has "tap cards" open, card taps are read here instead of by other apps.
  private var nfcWanted = false

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
    webViewRef = webView
    webView.addJavascriptInterface(Bridge(), "AndroidBridge")
    watchConnectivity(webView)
  }

  // Android's WebView doesn't notice connection changes by itself; pass them on so the page's
  // navigator.onLine and online/offline events (the "You're offline" notice) work like in a browser.
  private fun watchConnectivity(webView: WebView) {
    val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
    val report = { online: Boolean -> runOnUiThread { webView.setNetworkAvailable(online) } }
    report(cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true)
    // Use what each callback reports: in onLost, activeNetwork can still point at the network being lost.
    cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) = report(true)
      override fun onLost(network: Network) = report(false)
      override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) =
        report(caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))
    })
  }

  override fun onResume() {
    super.onResume()
    if (nfcWanted) enableNfc()
  }

  override fun onPause() {
    NfcAdapter.getDefaultAdapter(this)?.disableReaderMode(this)
    super.onPause()
  }

  // Reads the ID of any contactless card held to the phone and hands it to the page as an "erp:nfc" event.
  private fun enableNfc() {
    val adapter = NfcAdapter.getDefaultAdapter(this) ?: return
    val flags = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_NFC_F or
      NfcAdapter.FLAG_READER_NFC_V or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
    adapter.enableReaderMode(this, { tag: Tag ->
      val uid = tag.id.joinToString("") { "%02X".format(it) }
      runOnUiThread {
        webViewRef?.evaluateJavascript("window.dispatchEvent(new CustomEvent('erp:nfc', { detail: '$uid' }))", null)
      }
    }, flags, null)
  }

  // Called from lib/utils.ts (printDocument, downloadCsv) when running inside the Android app.
  inner class Bridge {
    // "none" (no NFC chip), "off" (switched off in settings) or "ready".
    @JavascriptInterface
    fun nfcStatus(): String {
      val adapter = NfcAdapter.getDefaultAdapter(this@MainActivity) ?: return "none"
      return if (adapter.isEnabled) "ready" else "off"
    }

    @JavascriptInterface
    fun startNfc() {
      runOnUiThread {
        nfcWanted = true
        enableNfc()
      }
    }

    @JavascriptInterface
    fun stopNfc() {
      runOnUiThread {
        nfcWanted = false
        NfcAdapter.getDefaultAdapter(this@MainActivity)?.disableReaderMode(this@MainActivity)
      }
    }

    @JavascriptInterface
    fun print(html: String, title: String) {
      runOnUiThread {
        val view = WebView(this@MainActivity)
        view.webViewClient = object : WebViewClient() {
          override fun onPageFinished(page: WebView, url: String?) {
            val manager = getSystemService(PRINT_SERVICE) as PrintManager
            val inner = page.createPrintDocumentAdapter(title)
            // Hand Android the document, then throw the helper view away once printing is done or cancelled.
            val adapter = object : PrintDocumentAdapter() {
              override fun onStart() = inner.onStart()
              override fun onLayout(old: PrintAttributes?, new: PrintAttributes, signal: CancellationSignal?, cb: LayoutResultCallback, extras: Bundle?) =
                inner.onLayout(old, new, signal, cb, extras)
              override fun onWrite(pages: Array<out PageRange>, dest: ParcelFileDescriptor, signal: CancellationSignal?, cb: WriteResultCallback) =
                inner.onWrite(pages, dest, signal, cb)
              override fun onFinish() {
                inner.onFinish()
                runOnUiThread {
                  if (printView === page) printView = null
                  page.destroy()
                }
              }
            }
            manager.print(title, adapter, PrintAttributes.Builder().build())
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
