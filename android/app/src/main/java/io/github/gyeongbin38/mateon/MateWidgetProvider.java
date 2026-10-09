package io.github.gyeongbin38.mateon;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/* 홈 화면 위젯 — 웹 레이어가 넘긴 D-day·미션 현황을 SharedPreferences에서 읽어 표시.
   탭하면 앱을 연다. */
public class MateWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "mateon_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateOne(ctx, mgr, id);
    }

    static void updateOne(Context ctx, AppWidgetManager mgr, int id) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_mateon);
        v.setTextViewText(R.id.wg_title, p.getString("title", "MATE:ON"));
        v.setTextViewText(R.id.wg_dday, p.getString("dday", "—"));
        v.setTextViewText(R.id.wg_sub, p.getString("sub", "우리 공간을 열어 보세요"));
        v.setTextViewText(R.id.wg_mission, p.getString("mission", ""));
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.wg_root, PendingIntent.getActivity(ctx, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        mgr.updateAppWidget(id, v);
    }
}
