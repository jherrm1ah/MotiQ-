package com.orynthra.motiq;

import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

// Starts recording when the phone connects to the car's Bluetooth, stops when it disconnects.
public class CarConnectionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String want = context.getSharedPreferences(MotiqTripsPlugin.PREFS, Context.MODE_PRIVATE).getString("address", null);
        if (want == null) return;
        BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
        if (device == null) return;
        String address;
        try { address = device.getAddress(); } catch (SecurityException e) { return; }
        if (address == null || !want.equalsIgnoreCase(address)) return;
        Intent service = new Intent(context, TripRecorderService.class);
        if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(intent.getAction())) service.setAction(TripRecorderService.ACTION_START);
        else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(intent.getAction())) service.setAction(TripRecorderService.ACTION_STOP);
        else return;
        try { ContextCompat.startForegroundService(context, service); } catch (Exception ignored) { }
    }
}
