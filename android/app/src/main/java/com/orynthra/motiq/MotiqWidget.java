package com.orynthra.motiq;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;
import org.json.JSONObject;

// Home-screen widget: the car's health, what's due, the cheapest fuel nearby and where you
// parked, with buttons that open Motiq at Trip or SOS. The app saves the summary through
// Capacitor Preferences (SharedPreferences "CapacitorStorage", key "motiq.widget").
public class MotiqWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, MotiqWidget.class));
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    private static PendingIntent open(Context context, String screen, int code) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("com.orynthra.motiq://open/" + screen));
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.motiq_widget);
        String car = "Motiq", health = "", due = "Open Motiq to load your car", extra = "";
        try {
            SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String raw = prefs.getString("motiq.widget", null);
            if (raw != null) {
                JSONObject j = new JSONObject(raw);
                car = j.optString("car", car);
                health = j.optString("health", "");
                due = j.optString("due", "");
                String fuel = j.optString("fuel", "");
                String parked = j.optString("parked", "");
                extra = !fuel.isEmpty() ? "Fuel: " + fuel : parked;
            }
        } catch (Exception ignored) { }
        views.setTextViewText(R.id.widget_car, car);
        views.setTextViewText(R.id.widget_health, health);
        views.setTextViewText(R.id.widget_due, due);
        views.setTextViewText(R.id.widget_extra, extra);
        views.setOnClickPendingIntent(R.id.widget_root, open(context, "home", 1));
        views.setOnClickPendingIntent(R.id.widget_trip, open(context, "trip", 2));
        views.setOnClickPendingIntent(R.id.widget_sos, open(context, "sos", 3));
        return views;
    }
}
