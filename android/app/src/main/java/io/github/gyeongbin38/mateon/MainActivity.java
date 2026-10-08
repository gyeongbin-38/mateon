package io.github.gyeongbin38.mateon;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/* 공유 수신: 다른 앱의 텍스트 공유를 대화 시트 프리필로 넘긴다 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleSendIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleSendIntent(intent);
    }

    private void handleSendIntent(Intent intent) {
        if (intent == null) return;
        if (!Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) return;
        String safe = text.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n");
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript(
                    "window.__mateon && window.__mateon.acceptSharedText && window.__mateon.acceptSharedText('" + safe + "')",
                    null));
        }
    }
}
