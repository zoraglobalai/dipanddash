import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: false,
      includeAssets: ["favicon.ico", "logo.png"],
      manifest: {
        name: "Dip & Dash POS",
        short_name: "D&D POS",
        description: "Dip & Dash staff point of sale",
        theme_color: "#8E0909",
        background_color: "#FFF8EF",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/logo.png",
            sizes: "1024x1024",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": "/src"
    }
  },
  server: {
    port: 5175
  }
});

