import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

type ApiHandler = (
  request: IncomingMessage & { query?: Record<string, string> },
  response: ServerResponse,
) => Promise<void>;

/** Route table mirroring the Vercel file-system routes under api/testnet. */
const routes: ReadonlyArray<{
  method: "GET" | "POST";
  pattern: RegExp;
  module: string;
  params: readonly string[];
}> = [
  { method: "GET", pattern: /^\/health\/?$/, module: "/api/testnet/health.ts", params: [] },
  {
    method: "POST",
    pattern: /^\/payment-challenge\/?$/,
    module: "/api/testnet/payment-challenge/index.ts",
    params: [],
  },
  {
    method: "POST",
    pattern: /^\/payment-challenge\/([^/]+)\/verify\/?$/,
    module: "/api/testnet/payment-challenge/[challengeId]/verify.ts",
    params: ["challengeId"],
  },
  {
    method: "GET",
    pattern: /^\/payment-challenge\/([^/]+)\/?$/,
    module: "/api/testnet/payment-challenge/[challengeId]/index.ts",
    params: ["challengeId"],
  },
  {
    method: "GET",
    pattern: /^\/transaction\/([^/]+)\/?$/,
    module: "/api/testnet/transaction/[txid].ts",
    params: ["txid"],
  },
];

/**
 * Serves the Vercel testnet functions from the Vite dev server so `npm run dev`
 * exercises the same handlers the deployment runs, without requiring the
 * Vercel CLI. Development only; production routing stays Vercel's.
 */
function testnetApiDevServer(): Plugin {
  return {
    name: "zity-testnet-api-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/testnet", (request, response, next) => {
        const path = (request.url ?? "/").split("?")[0];
        const route = routes.find(
          (candidate) => candidate.method === request.method && candidate.pattern.test(path),
        );
        if (!route) {
          next();
          return;
        }

        const matched = route.pattern.exec(path) ?? [];
        const query: Record<string, string> = {};
        route.params.forEach((name, index) => {
          query[name] = decodeURIComponent(matched[index + 1] ?? "");
        });

        void (async () => {
          try {
            const loaded = await server.ssrLoadModule(route.module);
            const handler = loaded.default as ApiHandler;
            await handler(Object.assign(request, { query }), response);
          } catch (error) {
            server.config.logger.error(`[zity api] ${String(error)}`);
            if (!response.headersSent) {
              response.statusCode = 500;
              response.setHeader("content-type", "application/json");
              response.end(JSON.stringify({
                error: { code: "DEV_HANDLER_FAILED", message: String(error), retryable: false },
              }));
            }
          }
        })();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // The API handlers read unprefixed server variables from process.env, which
  // Vite does not populate on its own.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react(), testnetApiDevServer()],
    build: {
      target: "es2022",
      sourcemap: true,
      chunkSizeWarningLimit: 1300,
      rollupOptions: {
        output: {
          manualChunks: {
            phaser: ["phaser"],
            react: ["react", "react-dom", "react-router-dom"],
          },
        },
      },
    },
  };
});
