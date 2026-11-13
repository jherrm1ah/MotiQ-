package com.orynthra.motiq;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Lets the web app ask the home-screen widget to redraw after it saves a new summary.
@CapacitorPlugin(name = "MotiqWidget")
public class MotiqWidgetPlugin extends Plugin {
    // Push notifications need the Firebase file (google-services.json) built into the app.
    // Without it, asking Firebase for a token would crash, so the app checks first.
    @PluginMethod
    public void pushReady(PluginCall call) {
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
        ret.put("ready", id != 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        MotiqWidget.updateAll(getContext());
        call.resolve();
    }
}
