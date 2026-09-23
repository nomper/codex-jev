import { build } from "esbuild";

await build({
  entryPoints: ["src/server.mjs"],
  outfile: "plugins/codex-jev/dist/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  sourcemap: false,
  legalComments: "eof",
});

console.error("Built plugins/codex-jev/dist/server.mjs");
