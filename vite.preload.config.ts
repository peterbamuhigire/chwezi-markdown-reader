import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/main/preload.ts"),
      formats: ["cjs"],
      fileName: () => "preload.js",
    },
    minify: false,
    outDir: resolve(__dirname, "dist/main"),
    rollupOptions: {
      external: ["electron"],
    },
    sourcemap: false,
  },
});
