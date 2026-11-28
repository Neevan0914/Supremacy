// Rebuilds the 3D battle bundle and splices it into Supremacy.html.
//   npm install && npm run build
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const HTML = new URL("../Supremacy.html", import.meta.url);
const MARK = "<script>/* three.js (MIT) + 3D battle */\n";

const out = await build({
  entryPoints: [new URL("../src/battle3d/game.js", import.meta.url).pathname],
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "Battle3D",
  target: "es2020",
  legalComments: "none",
  write: false,
});
const js = out.outputFiles[0].text.trim();
if (js.includes("</script")) throw new Error("bundle contains </script");

const html = readFileSync(HTML, "utf8");
const start = html.indexOf(MARK);
if (start < 0) throw new Error("battle script marker not found");
const end = html.indexOf("</script>", start);
const next = html.slice(0, start) + MARK + js + "\n" + html.slice(end);
writeFileSync(HTML, next);
// Re-inject the settings modal source (idempotent) so edits to src/app/settings.js land.
execFileSync("python3", [new URL("./patch_app.py", import.meta.url).pathname], { stdio: "inherit" });
console.log(`battle bundle: ${(js.length / 1024).toFixed(0)} KB, html: ${(next.length / 1024 / 1024).toFixed(2)} MB`);
