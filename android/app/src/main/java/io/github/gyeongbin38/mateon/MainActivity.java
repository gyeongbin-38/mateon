package io.github.gyeongbin38.mateon;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.MimeTypeMap;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/* 공유 수신: 다른 앱의 텍스트 공유를 대화 시트 프리필로, 이미지 공유를 앨범 첨부로 넘긴다 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MateWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        handleSendIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleSendIntent(intent);
    }

    private void handleSendIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type != null && type.startsWith("image/")) { handleSharedImage(intent); return; }
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) return;
        String safe = text.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n");
        evalJs("window.__mateon && window.__mateon.acceptSharedText && window.__mateon.acceptSharedText('" + safe + "')");
    }

    /* 공유받은 이미지를 앱 파일 영역에 복사한 뒤 JS로 경로를 넘긴다 */
    private void handleSharedImage(Intent intent) {
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return;
        try {
            grantUriPermission(getPackageName(), uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) return;
            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(getContentResolver().getType(uri));
            if (ext == null) ext = "jpg";
            File dir = new File(getFilesDir(), "shared");
            if (!dir.exists()) dir.mkdirs();
            File out = new File(dir, "shared-" + System.currentTimeMillis() + "." + ext);
            OutputStream os = new FileOutputStream(out);
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            os.close(); in.close();
            String path = out.getAbsolutePath().replace("\\", "\\\\").replace("'", "\\'");
            evalJs("window.__mateon && window.__mateon.acceptSharedImage && window.__mateon.acceptSharedImage('" + path + "')");
        } catch (Exception ignored) { }
    }

    private void evalJs(String js) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript(js, null));
        }
    }
}
