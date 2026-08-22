const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

const oldBlock = `      marginTop: 16,\n      padding: 10,\n      background: "#000",\n      borderRadius: 14,\n      width: "100%",\n      boxSizing: "border-box",`;

const newBlock = `      position: "fixed",\n      inset: 0,\n      zIndex: 9999,\n      margin: 0,\n      padding: 16,\n      background: "rgba(0,0,0,0.94)",\n      borderRadius: 0,\n      width: "100vw",\n      height: "100vh",\n      boxSizing: "border-box",\n      display: "flex",\n      flexDirection: "column",\n      justifyContent: "center",\n      overflowY: "auto",`;

if (source.includes(newBlock)) {
  console.log("JAN scanner fullscreen patch already applied.");
} else if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
  console.log("Applied JAN scanner fullscreen patch.");
} else {
  throw new Error("JAN scanner container style marker not found.");
}

const oldVideo = `        width: "100%",\n        height: "min(68vh, 520px)",\n        minHeight: 320,\n        display: "block",\n        objectFit: "cover",\n        borderRadius: 10,`;
const newVideo = `        width: "100%",\n        height: "min(72vh, 620px)",\n        minHeight: "45vh",\n        display: "block",\n        objectFit: "contain",\n        borderRadius: 12,\n        background: "#111",`;

if (source.includes(oldVideo)) {
  source = source.replace(oldVideo, newVideo);
}

fs.writeFileSync(file, source, "utf8");
console.log("JAN scanner fullscreen patch complete.");
