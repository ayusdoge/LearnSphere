import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const pyodideFiles = [
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json"
];
const pyodideDirectory = resolve("node_modules/pyodide");

function localPyodideAssets() {
  return {
    name: "local-pyodide-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split("?")[0] || "";
        if (!pathname.startsWith("/pyodide/")) {
          next();
          return;
        }
        const filename = pathname.slice("/pyodide/".length);
        if (!pyodideFiles.includes(filename)) {
          next();
          return;
        }
        response.setHeader(
          "Content-Type",
          filename.endsWith(".wasm")
            ? "application/wasm"
            : filename.endsWith(".json")
              ? "application/json"
              : filename.endsWith(".zip")
                ? "application/zip"
                : "text/javascript"
        );
        response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        response.end(readFileSync(resolve(pyodideDirectory, filename)));
      });
    },
    generateBundle() {
      for (const filename of pyodideFiles) {
        this.emitFile({
          type: "asset",
          fileName: `pyodide/${filename}`,
          source: readFileSync(resolve(pyodideDirectory, filename))
        });
      }
    }
  };
}

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "/ui/",
  plugins: [localPyodideAssets()],
  worker: {
    format: "es"
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/ask": "http://127.0.0.1:8000",
      "/exam": "http://127.0.0.1:8000",
      "/flashcards": "http://127.0.0.1:8000",
      "/roadmap": "http://127.0.0.1:8000",
      "/auth": "http://127.0.0.1:8000",
      "/sources": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000"
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
}));
