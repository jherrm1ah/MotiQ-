package com.orynthra.motiq;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothDevice;
import android.companion.AssociationInfo;
import android.companion.AssociationRequest;
import android.companion.BluetoothDeviceFilter;
import android.companion.CompanionDeviceManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentSender;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;

// Background trips: the driver picks the car's Bluetooth (stereo) once. From then on a trip
// records whenever the phone connects to it (CarConnectionReceiver + TripRecorderService), and
// the app uploads finished trips the next time it opens (takePending).
@CapacitorPlugin(name = "MotiqTrips")
public class MotiqTripsPlugin extends Plugin {
    static final String PREFS = "motiq_trips";
    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall pending;
    private String pendingVehicle = "";

    @Override
    public void load() {
        launcher = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PluginCall call = pending;
            pending = null;
            if (call == null) return;
            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.reject("No car Bluetooth was picked."); return; }
            Intent data = result.getData();
            String address = null, name = null;
            try {
                if (Build.VERSION.SDK_INT >= 33) {
                    AssociationInfo info = data.getParcelableExtra(CompanionDeviceManager.EXTRA_ASSOCIATION, AssociationInfo.class);
                    if (info != null && info.getDeviceMacAddress() != null) address = info.getDeviceMacAddress().toString();
                    if (info != null && info.getDisplayName() != null) name = info.getDisplayName().toString();
                }
                if (address == null) {
                    BluetoothDevice device = data.getParcelableExtra(CompanionDeviceManager.EXTRA_DEVICE);
                    if (device != null) {
                        address = device.getAddress();
                        try { name = device.getName(); } catch (SecurityException ignored) { }
                    }
                }
            } catch (Exception e) {
                call.reject("Couldn't read the car's Bluetooth.");
                return;
            }
            if (address == null) { call.reject("Couldn't read the car's Bluetooth."); return; }
            prefs().edit().putString("address", address.toUpperCase()).putString("name", name == null ? "Your car" : name).putString("vehicleId", pendingVehicle).apply();
            askPermissions();
            JSObject ret = new JSObject();
            ret.put("enabled", true);
            ret.put("deviceName", name == null ? "Your car" : name);
            call.resolve(ret);
        });
    }

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private void askPermissions() {
        List<String> perms = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) perms.add(Manifest.permission.BLUETOOTH_CONNECT);
        if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!perms.isEmpty()) ActivityCompat.requestPermissions(getActivity(), perms.toArray(new String[0]), 7102);
        // "Allow all the time" has to be asked on its own, after the normal location permission.
        if (Build.VERSION.SDK_INT >= 29) ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.ACCESS_BACKGROUND_LOCATION }, 7103);
    }

    @PluginMethod
    public void pairCar(PluginCall call) {
        if (Build.VERSION.SDK_INT < 26) { call.reject("Background trips need Android 8 or newer."); return; }
        CompanionDeviceManager cdm = (CompanionDeviceManager) getContext().getSystemService(Context.COMPANION_DEVICE_SERVICE);
        if (cdm == null) { call.reject("This phone doesn't support it."); return; }
        pendingVehicle = call.getString("vehicleId", "");
        AssociationRequest request = new AssociationRequest.Builder().addDeviceFilter(new BluetoothDeviceFilter.Builder().build()).setSingleDevice(false).build();
        pending = call;
        cdm.associate(request, new CompanionDeviceManager.Callback() {
            @Override
            public void onDeviceFound(IntentSender chooser) { launch(chooser); }

            @Override
            public void onAssociationPending(IntentSender chooser) { launch(chooser); }

            @Override
            public void onFailure(CharSequence error) {
                PluginCall c = pending;
                pending = null;
                if (c != null) c.reject(error == null ? "Couldn't find your car's Bluetooth." : error.toString());
            }
        }, null);
    }

    private void launch(IntentSender chooser) {
        try { launcher.launch(new IntentSenderRequest.Builder(chooser).build()); }
        catch (Exception e) { PluginCall c = pending; pending = null; if (c != null) c.reject("Couldn't open the Bluetooth picker."); }
    }

    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences p = prefs();
        JSObject ret = new JSObject();
        ret.put("enabled", p.getString("address", null) != null);
        ret.put("deviceName", p.getString("name", ""));
        ret.put("recording", p.getBoolean("recording", false));
        call.resolve(ret);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        prefs().edit().remove("address").remove("name").remove("vehicleId").apply();
        Intent stop = new Intent(getContext(), TripRecorderService.class).setAction(TripRecorderService.ACTION_STOP);
        try { getContext().startService(stop); } catch (Exception ignored) { }
        call.resolve();
    }

    // Finished trips waiting to be saved to the user's account. Returned once, then cleared.
    @PluginMethod
    public void takePending(PluginCall call) {
        SharedPreferences p = prefs();
        String raw = p.getString("pending", "[]");
        p.edit().putString("pending", "[]").apply();
        JSObject ret = new JSObject();
        try { ret.put("trips", new JSArray(new JSONArray(raw).toString())); } catch (Exception e) { ret.put("trips", new JSArray()); }
        call.resolve(ret);
    }
}
