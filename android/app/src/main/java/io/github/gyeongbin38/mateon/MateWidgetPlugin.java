package io.github.gyeongbin38.mateon;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/* JS → 네이티브 위젯 데이터 전달. update({title,dday,sub,mission}) 를 SharedPreferences에 쓰고
   AppWidgetManager에 갱신을 요청한다. */
@CapacitorPlugin(name = "MateWidget")
public class MateWidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(MateWidgetProvider.PREFS, 0);
        SharedPreferences.Editor e = p.edit();
        String[] keys = {"title", "dday", "sub", "mission"};
        for (String k : keys) {
            String v = call.getString(k);
            if (v != null) e.putString(k, v);
        }
        e.apply();
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(getContext());
            int[] ids = mgr.getAppWidgetIds(new ComponentName(getContext(), MateWidgetProvider.class));
            if (ids != null && ids.length > 0) {
                for (int id : ids) MateWidgetProvider.updateOne(getContext(), mgr, id);
            }
        } catch (Exception ignored) { }
        call.resolve();
    }
}
