import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Libraries go in their own files: they rarely change, so after an update phones only
// download Motiq's own code again.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "supabase";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
});
