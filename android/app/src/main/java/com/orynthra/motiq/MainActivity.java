package com.orynthra.motiq;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MotiqWidgetPlugin.class);
        registerPlugin(MotiqTripsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
