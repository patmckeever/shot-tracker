import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function gameRouteHtmlFallback(): Plugin {
  return {
    name: "game-route-html-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.method !== "GET" || !req.url) return next();
        const path = req.url.split("?")[0];
        if (!path.startsWith("/game/")) return next();
        const accept = req.headers.accept ?? "";
        if (!accept.includes("text/html")) return next();
        req.url = "/index.html";
        next();
      });
    },
  };
}

// When you open Vite directly (`npm run dev`), `/api/*` must proxy to the Vercel
// gateway used by `vercel dev` (override if yours listens elsewhere).
const vercelGateway =
  process.env.VERCEL_DEV_API_ORIGIN?.replace(/\/$/, "") ?? "http://127.0.0.1:3000";

// `vercel dev` injects PORT for the devCommand child process. If `server.port` is
// hard-coded (e.g. 5173), Vite binds the wrong port and the gateway (:3000) proxies
// into dead air — `/api/*` and often the SPA hang with no response.
// See https://github.com/vercel/vercel/issues/8121
const devPort = Number(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react(), gameRouteHtmlFallback()],
  server: {
    port: devPort,
    strictPort: !!process.env.PORT,
    proxy: {
      "/api": {
        target: vercelGateway,
        changeOrigin: true,
      },
    },
  },
});
