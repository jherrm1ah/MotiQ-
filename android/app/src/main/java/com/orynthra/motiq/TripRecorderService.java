package com.orynthra.motiq;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

// Records one trip in the background: distance, time, harsh braking and time over 110 km/h,
// from GPS. Shows a notification while it records (Android requires it). The trip is kept on
// the phone until Motiq opens and saves it to the driver's account.
public class TripRecorderService extends Service implements LocationListener {
    static final String ACTION_START = "com.orynthra.motiq.TRIP_START";
    static final String ACTION_STOP = "com.orynthra.motiq.TRIP_STOP";
    private static final String CHANNEL = "motiq_trip";
    private static final int NOTIFICATION_ID = 4711;

    private LocationManager lm;
    private Location last;
    private long startedAt = 0;
    private double km = 0, lastKmh = 0, speedingSec = 0;
    private int hardBrakes = 0;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!foreground()) { stopSelf(); return START_NOT_STICKY; }
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) { finishTrip(); stopSelf(); return START_NOT_STICKY; }
        if (startedAt == 0) begin();
        return START_STICKY;
    }

    private boolean foreground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Trip recording", NotificationManager.IMPORTANCE_LOW));
        Intent open = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("com.orynthra.motiq://open/trip")).setPackage(getPackageName());
        PendingIntent tap = PendingIntent.getActivity(this, 11, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_motiq)
            .setContentTitle("Motiq is recording your trip")
            .setContentText(String.format(java.util.Locale.US, "%.1f km so far", km))
            .setOngoing(true)
            .setContentIntent(tap)
            .build();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NOTIFICATION_ID, n);
            return true;
        } catch (Exception e) {
            return false; // no location permission, or Android didn't allow it right now
        }
    }

    private void begin() {
        startedAt = System.currentTimeMillis();
        km = 0; lastKmh = 0; speedingSec = 0; hardBrakes = 0; last = null;
        prefs().edit().putBoolean("recording", true).apply();
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        try { if (lm != null) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 5f, this, Looper.getMainLooper()); }
        catch (SecurityException e) { finishTrip(); stopSelf(); }
    }

    @Override
    public void onLocationChanged(Location loc) {
        if (last != null) {
            double dKm = last.distanceTo(loc) / 1000.0;
            double dt = Math.max(0, (loc.getTime() - last.getTime()) / 1000.0);
            if (dKm > 0.0025) km += dKm; // ignore GPS jitter while standing still
            double kmh = loc.hasSpeed() ? loc.getSpeed() * 3.6 : (dt > 0 ? dKm / dt * 3600 : lastKmh);
            kmh = Math.max(0, Math.min(250, kmh));
            if (lastKmh - kmh > 25 && lastKmh > 32) hardBrakes++;
            if (kmh > 110) speedingSec += Math.min(dt, 10);
            lastKmh = kmh;
        }
        last = loc;
        foreground(); // refresh the distance in the notification
    }

    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    @Override public void onProviderEnabled(String provider) { }
    @Override public void onProviderDisabled(String provider) { }

    private SharedPreferences prefs() { return getSharedPreferences(MotiqTripsPlugin.PREFS, Context.MODE_PRIVATE); }

    private void finishTrip() {
        if (lm != null) { try { lm.removeUpdates(this); } catch (Exception ignored) { } }
        SharedPreferences p = prefs();
        if (startedAt > 0 && km >= 0.3) {
            try {
                JSONArray list = new JSONArray(p.getString("pending", "[]"));
                int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
                JSONObject t = new JSONObject();
                t.put("started_at", startedAt);
                t.put("ended_at", System.currentTimeMillis());
                t.put("distance_km", Math.round(km * 100) / 100.0);
                t.put("duration_sec", (System.currentTimeMillis() - startedAt) / 1000);
                t.put("hard_brakes", hardBrakes);
                t.put("speeding_sec", Math.round(speedingSec));
                t.put("night", hour >= 22 || hour < 5);
                t.put("vehicle_id", p.getString("vehicleId", ""));
                list.put(t);
                while (list.length() > 50) list.remove(0);
                p.edit().putString("pending", list.toString()).apply();
            } catch (Exception ignored) { }
        }
        p.edit().putBoolean("recording", false).apply();
        startedAt = 0;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
    }

    @Override
    public void onDestroy() {
        if (startedAt > 0) finishTrip();
        super.onDestroy();
    }
}
