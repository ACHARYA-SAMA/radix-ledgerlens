import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
  const publicHost = publicBaseUrl?.startsWith("https://")
    ? new URL(publicBaseUrl).hostname
    : null;
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "."),
      },
    },
    server: {
      allowedHosts: publicHost ? [publicHost] : [],
      hmr: process.env.DISABLE_HMR !== "true",
      watch: process.env.DISABLE_HMR === "true" ? null : {},
    },
  };
});
