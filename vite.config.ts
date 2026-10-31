import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset path relative, so the build works on
// GitHub Pages (https://<user>.github.io/<repo>/) and later inside an Android WebView.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    // libraries in their own files so the browser keeps them cached between app updates
    rollupOptions: { output: { manualChunks: { react: ["react", "react-dom"], leaflet: ["leaflet"], supabase: ["@supabase/supabase-js"] } } },
  },
});
