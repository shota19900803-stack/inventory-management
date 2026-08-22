const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "scripts", "apply-history-edit-actions.js");
let source = fs.readFileSync(file, "utf8");

// apply-history-edit-actions.js contains generated Dashboard code inside
// template literals. Escape nested backticks and ${...} expressions so the
// build-time patch script itself remains valid JavaScript.
const starts = [
  "const helpers = `",
  "const replacement = `",
];

for (const startMarker of starts) {
  let searchFrom = 0;

  while (true) {
    const start = source.indexOf(startMarker, searchFrom);
    if (start === -1) break;

    const bodyStart = start + startMarker.length;
    const closeMarker = "`;\n  if (!source.includes(marker))";
    const end = source.indexOf(closeMarker, bodyStart);

    if (end === -1) {
      throw new Error(`Could not find template literal end for ${startMarker}`);
    }

    const body = source.slice(bodyStart, end);
    let escaped = "";

    for (let i = 0; i < body.length; i += 1) {
      const char = body[i];

      if (char === "`") {
        if (i === 0 || body[i - 1] !== "\\") escaped += "\\`";
        else escaped += char;
        continue;
      }

      if (char === "$" && body[i + 1] === "{") {
        if (i === 0 || body[i - 1] !== "\\") escaped += "\\${";
        else escaped += "${";
        i += 1;
        continue;
      }

      escaped += char;
    }

    source = source.slice(0, bodyStart) + escaped + source.slice(end);
    searchFrom = bodyStart + escaped.length + closeMarker.length;
  }
}

fs.writeFileSync(file, source, "utf8");
console.log("Fixed history edit patch script template escaping.");
