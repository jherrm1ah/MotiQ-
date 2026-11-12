package com.orynthra.motiq;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Lets the web app ask the home-screen widget to redraw after it saves a new summary.
@CapacitorPlugin(name = "MotiqWidget")
public class MotiqWidgetPlugin extends Plugin {
    @PluginMethod
    public void refresh(PluginCall call) {
        MotiqWidget.updateAll(getContext());
        call.resolve();
    }
}
