package com.bluespindash.checksmith;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Checksmith is a single self-contained HTML file. This activity is only a
 * shell: it hosts a WebView, loads the bundled page and hands the Android back
 * gesture to the page so it closes dialogs before it closes the app.
 *
 * The game runs entirely offline from assets. The app requests no permissions
 * and makes no network calls.
 */
public class MainActivity extends Activity {

    private static final String GAME_URL = "file:///android_asset/index.html";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // A puzzle with no timer invites long pauses for thinking; don't let
        // the screen drop out mid-plan.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = findViewById(R.id.web);
        web.setBackgroundColor(Color.parseColor("#14151A"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setHapticFeedbackEnabled(false);
        // no text selection or magnifier when a tile is held down
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // best scores and audio preferences
        s.setDatabaseEnabled(true);
        s.setTextZoom(100);                    // the board is a fixed layout; ignore system font scaling
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        // the page is local and never fetches anything; keep it that way
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);   // nothing here is ever fetched
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                // Only the bundled page may load in here. Anything else is a
                // mistake or an injected link; refuse it.
                return !GAME_URL.equals(url.toString());
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(GAME_URL);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    /**
     * Back closes whatever the page has open - results, how to play, the
     * discard prompt - and only leaves the app when the board is clear.
     */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript(
                "(function(){" +
                "  var open=document.querySelector('.overlay:not([hidden])');" +
                "  if(!open) return false;" +
                "  var close=open.querySelector('#helpClose,#confirmNo,#rChange');" +
                "  if(close){close.click();} else {open.hidden=true;}" +
                "  return true;" +
                "})()",
                value -> {
                    if (!"true".equals(value)) {
                        finishAfterTransition();
                    }
                });
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();          // suspends JS timers and audio while backgrounded
        web.pauseTimers();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.resumeTimers();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
