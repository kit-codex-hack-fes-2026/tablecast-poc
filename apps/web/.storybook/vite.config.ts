import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [tailwindcss(), react()],
  optimizeDeps: {
    exclude: ["cloudflare:workers", "@tanstack/react-start/server"],
    include: [
      "@base-ui/react/popover",
      "@base-ui/react/slider",
      "@better-auth/infra/client",
      "@better-auth/stripe/client",
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
});
