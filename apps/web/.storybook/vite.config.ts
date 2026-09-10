import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [tailwindcss(), react()],
  optimizeDeps: {
    exclude: ["cloudflare:workers", "@tanstack/react-start/server"],
    include: [
      "@base-ui/react/slider",
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
});
