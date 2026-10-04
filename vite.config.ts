import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import fs from "node:fs";

export default defineConfig(({mode}) => ({
  plugins: [react(), {
    name: "persona-extension-manifest",
    generateBundle(_options, bundle) {
      const overlay = bundle["overlay.js"];
      if (overlay?.type === "chunk") {
        if (overlay.imports.length) throw new Error("Overlay injection must be a self-contained classic script");
        overlay.code = `(() => {\n${overlay.code}\n})();`;
      }
    },
    writeBundle(options) {
      const env = loadEnv(mode, process.cwd(), "VITE_");
      const api = process.env.VITE_API_URL ?? env.VITE_API_URL ?? "http://localhost:3210";
      const manifest = JSON.parse(fs.readFileSync("public/manifest.json", "utf8"));
      manifest.host_permissions = api ? [new URL(api).origin + "/*"] : [];
      fs.writeFileSync(resolve(options.dir ?? "dist", "manifest.json"), JSON.stringify(manifest,null,2));
    },
  }],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        panel: resolve(import.meta.dirname, "floating-panel.html"),
        overlay: resolve(import.meta.dirname, "src/extension/overlay.ts"),
        background: resolve(import.meta.dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (["background", "overlay"].includes(chunkInfo.name)) return `${chunkInfo.name}.js`;
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
}));
