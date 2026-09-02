/**
 * Temporary guard while legacy build-time patch scripts are removed.
 * New application code must not depend on source-to-source mutation during build.
 */
const fs = require("fs");
const path = require("path");

const scriptsDir = path.join(process.cwd(), "scripts");
const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
const prebuild = packageJson.scripts?.prebuild || "";
const referenced = [...prebuild.matchAll(/node\s+scripts\/([^\s&]+)/g)].map((m) => m[1]);
const missing = referenced.filter((name) => !fs.existsSync(path.join(scriptsDir, name)));

if (missing.length) {
  throw new Error(`prebuild references missing scripts: ${missing.join(", ")}`);
}

console.log(`Legacy build patches currently referenced: ${referenced.length}`);
