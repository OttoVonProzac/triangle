import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: [
      "@supabase/supabase-js",
      "html2canvas",
      "jspdf"
    ]
  }
});
