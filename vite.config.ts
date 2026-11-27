import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { startupMessages } from "./src/shared/i18n/startupMessages";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), {
    name: "startup-loading-copy",
    // Keep the first HTML paint localized without loading React or the locale graph.
    transformIndexHtml: html => html
      .replaceAll('__STARTUP_OPENING_ZH__', startupMessages['zh-CN']['startup.opening'])
      .replaceAll('__STARTUP_OPENING_EN__', startupMessages['en-US']['startup.opening']),
  }],

  // Pre-bundle the postprocessing passes up front; otherwise the first video call discovers
  // them late and Vite re-optimizes deps mid-session, reloading the page (dev only).
  optimizeDeps: {
    include: [
      "three/examples/jsm/postprocessing/EffectComposer.js",
      "three/examples/jsm/postprocessing/RenderPass.js",
      "three/examples/jsm/postprocessing/ShaderPass.js",
      "three/examples/jsm/postprocessing/UnrealBloomPass.js",
      "three/examples/jsm/postprocessing/OutputPass.js",
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Native builds and local verification profiles are outside the frontend source tree.
      ignored: ["**/src-tauri/**", "**/.tmp/**"],
    },
  },
}));
