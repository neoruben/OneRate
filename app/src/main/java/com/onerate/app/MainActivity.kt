package com.onerate.app

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView
import org.mozilla.geckoview.WebExtension
import org.json.JSONObject

/**
 * Mini navegador con GeckoView (el motor de Firefox) que lleva tu extensión OneRate integrada.
 *
 * - Pestañas de la extensión (tabs.create / update / remove): tabDelegate y sessionTabDelegate.
 * - Ventanas emergentes de las webs (p. ej. "Iniciar sesión con Google" en IMDb):
 *   navigationDelegate.onNewSession las abre y contentDelegate.onCloseRequest las cierra.
 *
 * Regla de GeckoView: las sesiones que se devuelven en onNewTab / onNewSession deben ir SIN abrir;
 * GeckoView las abre y carga la URL por su cuenta.
 */
class MainActivity : ComponentActivity() {

    companion object {
        private const val TAG = "OneRate"
        private const val EXT_URI = "resource://android/assets/votodoble/"
        private const val EXT_ID = "onerate@onerate.app"
        private const val FA_HOME = "https://www.filmaffinity.com/es/main.html"

        // Solo puede haber un GeckoRuntime por proceso
        private var sRuntime: GeckoRuntime? = null

        private fun runtime(ctx: Context): GeckoRuntime = sRuntime ?: GeckoRuntime.create(
            ctx.applicationContext,
            GeckoRuntimeSettings.Builder()
                .remoteDebuggingEnabled(true) // permite depurar desde about:debugging de Firefox de escritorio
                // El idioma del móvil decide el de la app (inglés por defecto, español si el móvil está en español)
                .locales(arrayOf(java.util.Locale.getDefault().toLanguageTag()))
                .build()
        ).also { sRuntime = it }
    }

    private lateinit var geckoView: GeckoView
    private lateinit var runtime: GeckoRuntime
    private lateinit var mainSession: GeckoSession

    private var visible: GeckoSession? = null
    private var extension: WebExtension? = null
    private var searchUrl: String? = null   // buscador propio de la extensión (search.html)
    private var mainCanGoBack = false
    private val extraSessions = mutableSetOf<GeckoSession>()

    // ---------- Ventanas emergentes de las webs (login con Google, Amazon, Apple...) ----------

    private val navigationDelegate = object : GeckoSession.NavigationDelegate {
        // Enlaces que no son de la app (Ko-fi) se abren en el navegador del móvil
        override fun onLoadRequest(
            session: GeckoSession,
            request: GeckoSession.NavigationDelegate.LoadRequest
        ): GeckoResult<AllowOrDeny>? {
            val uri = request.uri
            if (uri.startsWith("https://ko-fi.com/")) {
                runOnUiThread {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)))
                    } catch (e: Exception) {
                        Log.w(TAG, "No se pudo abrir $uri", e)
                    }
                }
                return GeckoResult.deny()
            }
            return GeckoResult.allow()
        }

        override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) {
            if (session === mainSession) mainCanGoBack = canGoBack
        }

        override fun onNewSession(session: GeckoSession, uri: String): GeckoResult<GeckoSession>? {
            Log.d(TAG, "Ventana nueva -> $uri")
            val popup = newChildSession()   // sin abrir: GeckoView la abre y carga la URI
            showWhenOpen(popup)
            return GeckoResult.fromValue(popup)
        }
    }

    // El buscador es la "portada": al llegar a él se olvida el historial de las webs,
    // así "atrás" desde el buscador sale de la app en vez de recorrer páginas de login
    private var lastStartUrl: String? = null
    private val progressDelegate = object : GeckoSession.ProgressDelegate {
        override fun onPageStart(session: GeckoSession, url: String) {
            if (session === mainSession) lastStartUrl = url
        }

        override fun onPageStop(session: GeckoSession, success: Boolean) {
            val su = searchUrl ?: return
            if (session === mainSession && success && lastStartUrl?.startsWith(su) == true) {
                session.purgeHistory()
            }
        }
    }

    private val contentDelegate = object : GeckoSession.ContentDelegate {
        // La web llama a window.close() (p. ej. al terminar el login): volvemos a la ventana principal
        override fun onCloseRequest(session: GeckoSession) {
            Log.d(TAG, "window.close()")
            closeChild(session)
        }
    }

    // Ventanas emergentes permitidas + desplegables (<select>) de las webs como diálogo de Android
    private val promptDelegate = object : GeckoSession.PromptDelegate {
        override fun onPopupPrompt(
            session: GeckoSession,
            prompt: GeckoSession.PromptDelegate.PopupPrompt
        ): GeckoResult<GeckoSession.PromptDelegate.PromptResponse> =
            GeckoResult.fromValue(prompt.confirm(AllowOrDeny.ALLOW))

        override fun onChoicePrompt(
            session: GeckoSession,
            prompt: GeckoSession.PromptDelegate.ChoicePrompt
        ): GeckoResult<GeckoSession.PromptDelegate.PromptResponse> {
            val result = GeckoResult<GeckoSession.PromptDelegate.PromptResponse>()
            // Aplana los grupos (<optgroup>) y quita separadores y opciones desactivadas
            val flat = mutableListOf<GeckoSession.PromptDelegate.ChoicePrompt.Choice>()
            fun add(list: Array<GeckoSession.PromptDelegate.ChoicePrompt.Choice>) {
                for (c in list) {
                    val sub = c.items
                    if (sub != null) add(sub) else if (!c.separator && !c.disabled) flat.add(c)
                }
            }
            add(prompt.choices)
            if (flat.isEmpty()) return GeckoResult.fromValue(prompt.dismiss())

            var done = false
            val finish = { r: GeckoSession.PromptDelegate.PromptResponse ->
                if (!done) { done = true; result.complete(r) }
            }
            val selected = flat.indexOfFirst { it.selected }
            AlertDialog.Builder(this@MainActivity)
                .setTitle(prompt.title)
                .setSingleChoiceItems(flat.map { it.label }.toTypedArray(), selected) { d, which ->
                    finish(prompt.confirm(flat[which]))
                    d.dismiss()
                }
                .setOnDismissListener { finish(prompt.dismiss()) }
                .show()
            return result
        }
    }

    // ---------- Pestañas que abre la extensión para votar en la otra web ----------

    private val tabDelegate = object : WebExtension.TabDelegate {
        override fun onNewTab(
            source: WebExtension,
            details: WebExtension.CreateTabDetails
        ): GeckoResult<GeckoSession>? {
            Log.d(TAG, "tabs.create -> ${details.url} (active=${details.active})")
            val s = newChildSession()       // sin abrir y sin loadUri: GeckoView carga details.url
            if (details.active == true) showWhenOpen(s)
            return GeckoResult.fromValue(s)
        }
    }

    private val sessionTabDelegate = object : WebExtension.SessionTabDelegate {
        override fun onCloseTab(
            source: WebExtension?,
            session: GeckoSession
        ): GeckoResult<AllowOrDeny> {
            closeChild(session)
            return GeckoResult.allow()
        }

        override fun onUpdateTab(
            source: WebExtension,
            session: GeckoSession,
            details: WebExtension.UpdateTabDetails
        ): GeckoResult<AllowOrDeny> {
            // Si el voto falla (p. ej. falta iniciar sesión), la extensión pone la pestaña activa: la mostramos
            if (details.active == true) show(session)
            return GeckoResult.allow()
        }
    }

    // ------------------------------------------------------------------------------------------

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Android 15+ dibuja bajo las barras del sistema: dejamos el hueco para que no tapen los botones
        ViewCompat.setOnApplyWindowInsetsListener(findViewById<View>(R.id.root)) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            insets
        }

        geckoView = findViewById(R.id.geckoview)
        runtime = runtime(this)

        mainSession = GeckoSession()
        attachDelegates(mainSession)
        mainSession.progressDelegate = progressDelegate
        mainSession.open(runtime)
        show(mainSession)
        runtime.webExtensionController.setTabActive(mainSession, true)

        // Fondo oscuro como el buscador: iconos claros en la barra de estado
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = false

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = goBack()
        })

        installExtension()
    }

    /**
     * Instala la extensión integrada. Si la instalada es de otra versión, la desinstala antes:
     * al actualizar, GeckoView no concede los permisos de webs nuevas (p. ej. Letterboxd),
     * y en una instalación limpia sí. Las sesiones (cookies) no se pierden.
     */
    private fun installExtension() {
        val ctl = runtime.webExtensionController
        val wanted = try {
            JSONObject(assets.open("votodoble/manifest.json").bufferedReader().use { it.readText() }).getString("version")
        } catch (e: Exception) { null }

        val ready = { ext: WebExtension? ->
            if (ext != null) onExtensionReady(ext)
            mainSession.loadUri(searchUrl ?: FA_HOME)
        }
        val plainInstall = {
            ctl.ensureBuiltIn(EXT_URI, EXT_ID).accept({ ready(it) }, { e ->
                Log.e(TAG, "No se pudo instalar la extensión", e)
                mainSession.loadUri(FA_HOME)
            })
        }

        ctl.list().then(GeckoResult.OnValueListener<List<WebExtension>, Void> { list ->
            val old = list?.firstOrNull { it.id == EXT_ID }
            if (old != null && wanted != null && old.metaData.version != wanted) {
                Log.d(TAG, "Reinstalando la extensión ${old.metaData.version} -> $wanted")
                ctl.uninstall(old)
            } else {
                GeckoResult.fromValue<Void>(null)
            }
        }).then(GeckoResult.OnValueListener<Void, WebExtension> {
            ctl.ensureBuiltIn(EXT_URI, EXT_ID)
        }).accept({ ready(it) }, { e ->
            Log.e(TAG, "Fallo al reinstalar la extensión; se intenta instalar sin más", e)
            plainInstall()
        })
    }

    private fun onExtensionReady(ext: WebExtension) {
        extension = ext
        searchUrl = ext.metaData.baseUrl.trimEnd('/') + "/search.html"
        ext.setTabDelegate(tabDelegate)
        mainSession.webExtensionController.setTabDelegate(ext, sessionTabDelegate)
        extraSessions.forEach { it.webExtensionController.setTabDelegate(ext, sessionTabDelegate) }
        Log.d(TAG, "Extensión lista: ${ext.id}")
    }

    /** Delegados comunes a todas las sesiones (así los popups pueden abrir otros popups y cerrarse). */
    private fun attachDelegates(s: GeckoSession) {
        s.navigationDelegate = navigationDelegate
        s.contentDelegate = contentDelegate
        s.promptDelegate = promptDelegate
        extension?.let { s.webExtensionController.setTabDelegate(it, sessionTabDelegate) }
    }

    /** Sesión nueva SIN abrir, para devolverla a GeckoView en onNewTab / onNewSession. */
    private fun newChildSession(): GeckoSession {
        val s = GeckoSession()
        attachDelegates(s)
        extraSessions.add(s)
        return s
    }

    private fun closeChild(session: GeckoSession) {
        if (session === mainSession) return
        if (visible === session) show(mainSession)
        extraSessions.remove(session)
        if (session.isOpen) session.close()
    }

    /**
     * GeckoView.setSession() abriría una sesión cerrada con otro runtime, así que esperamos a que
     * GeckoView abra la sesión que le hemos devuelto y entonces la mostramos.
     */
    private fun showWhenOpen(s: GeckoSession, tries: Int = 50) {
        geckoView.postDelayed({
            when {
                s !in extraSessions -> Unit            // ya se cerró
                s.isOpen -> show(s)
                tries > 0 -> showWhenOpen(s, tries - 1)
                else -> Log.w(TAG, "La ventana nueva no llegó a abrirse")
            }
        }, 20)
    }

    private fun show(s: GeckoSession) {
        if (visible === s) return
        geckoView.releaseSession()
        geckoView.setSession(s)
        visible = s
    }

    // Atrás: cierra la pestaña de voto visible, si no retrocede en el historial y, al final, sale de la app
    private fun goBack() {
        when {
            visible !== mainSession -> show(mainSession)
            mainCanGoBack -> mainSession.goBack()
            else -> finish()
        }
    }
}
