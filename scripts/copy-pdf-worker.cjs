/**
 * pdfjs-dist 업그레이드 시 worker 버전을 맞추기 위해 public에 복사합니다.
 * postinstall에서 실행됩니다.
 */
const fs = require("fs");
const path = require("path");

const src = path.join(
  __dirname,
  "..",
  "node_modules",
  "pdfjs-dist",
  "build",
  "pdf.worker.min.mjs",
);
const dest = path.join(__dirname, "..", "public", "pdf.worker.min.mjs");

try {
  fs.copyFileSync(src, dest);
  console.log("[copy-pdf-worker] copied to public/pdf.worker.min.mjs");
} catch (e) {
  console.warn("[copy-pdf-worker] skip:", e.message);
}
