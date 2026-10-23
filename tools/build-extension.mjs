import { build } from "vite";
await build({ configFile: "vite.extension.config.ts" });
for (const name of ["content", "injected"]) {
  await build({
    configFile: false,
    publicDir: false,
    build: {
      outDir: "dist-extension",
      emptyOutDir: false,
      lib: {
        entry: `src/extension/${name}.ts`,
        name: `Abyss${name}`,
        formats: ["iife"],
        fileName: () => `${name}.js`,
      },
    },
  });
}
