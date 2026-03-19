import { NextRequest } from "next/server";

export const maxDuration = 60;
export const dynamic   = "force-dynamic";

interface Photo  { side: "left" | "right"; slot_index: number; url: string; }
interface Block  {
  no: number;
  left_header?: string; right_header?: string;
  left_date?: string;   right_date?: string;
  left_label?: string;  right_label?: string;
  photos: Photo[];
}

// ── HTML 빌드 ──────────────────────────────────────────────────────
function buildHtml(sheetName: string, blocks: Block[]): string {
  const BLOCKS_PER_PAGE = 3;
  const pages: Block[][] = [];
  for (let i = 0; i < blocks.length; i += BLOCKS_PER_PAGE)
    pages.push(blocks.slice(i, i + BLOCKS_PER_PAGE));

  const grid = (photos: Photo[], count: number) => {
    const sorted = [...photos].sort((a, b) => a.slot_index - b.slot_index).slice(0, 4);
    const cols = count <= 1 ? "1fr" : "1fr 1fr";
    const rows = count <= 2 ? "1fr" : "1fr 1fr";
    const tmpl = count === 3
      ? "grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;"
      : `grid-template-columns:${cols};grid-template-rows:${rows};`;
    const cells = sorted.map((p, i) => {
      const span = count === 3 && i === 2 ? "grid-column:1/-1;" : "";
      return p.url
        ? `<div style="${span}position:relative;overflow:hidden;border-radius:2px">
             <img src="${p.url}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
           </div>`
        : `<div style="${span}background:#e5e7eb;border-radius:2px"></div>`;
    }).join("");
    return `<div style="display:grid;${tmpl}gap:3px;width:100%;height:100%">${cells}</div>`;
  };

  const pagesHtml = pages.map((pg, pi) => {
    const br = pi < pages.length - 1 ? "page-break-after:always;" : "";
    const bs = pg.map(b => {
      const lp = b.photos.filter(p => p.side === "left");
      const rp = b.photos.filter(p => p.side === "right");
      return `<div class="bc">
        <div class="bh">NO. ${b.no}</div>
        <div class="sh">
          <div class="shc">반입사진</div>
          <div class="shd"></div>
          <div class="shc">${b.right_header || "지급/설치사진"}</div>
        </div>
        <div class="gr">
          <div class="gw">${grid(lp, Math.min(lp.length, 4))}</div>
          <div class="gd"></div>
          <div class="gw">${grid(rp, Math.min(rp.length, 4))}</div>
        </div>
        <div class="bf">
          <div class="fs">
            <span class="fl">날짜</span><span class="fv">${b.left_date ?? ""}</span>
            <span class="fl">항목</span><span class="fv">${b.left_label ?? ""}</span>
          </div>
          <div class="fd"></div>
          <div class="fs">
            <span class="fl">날짜</span><span class="fv">${b.right_date ?? ""}</span>
            <span class="fl">항목</span><span class="fv">${b.right_label ?? ""}</span>
          </div>
        </div>
      </div>`;
    }).join("");
    return `<div style="${br}"><div class="pt">${sheetName}</div>${bs}</div>`;
  }).join("");

  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8">
<style>
@page { size: A4 portrait; margin: 12mm }
* { box-sizing: border-box; margin: 0; padding: 0 }
body { font-family: -apple-system, "Apple SD Gothic Neo", sans-serif;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
img  { image-rendering: high-quality; display: block }
.pt  { font-size:13px; font-weight:700; text-align:center; color:#111827;
       padding:6px 0 10px; border-bottom:2px solid #111827; margin-bottom:10px }
.bc  { border:1.5px solid #374151; border-radius:4px; overflow:hidden;
       margin-bottom:10px; break-inside:avoid }
.bh  { background:#111827; padding:6px 12px; font-size:13px; font-weight:700; color:#fff }
.sh  { display:grid; grid-template-columns:1fr 1px 1fr; border-bottom:1px solid #d1d5db }
.shc { font-size:11px; font-weight:700; color:#374151; text-align:center;
       padding:5px 0; background:#f3f4f6 }
.shd { background:#d1d5db }
.gr  { display:grid; grid-template-columns:1fr 1px 1fr; height:52mm }
.gw  { padding:4px }
.gd  { background:#d1d5db }
.bf  { display:grid; grid-template-columns:1fr 1px 1fr;
       border-top:1px solid #d1d5db; background:#f9fafb }
.fs  { display:grid; grid-template-columns:auto 1fr; gap:2px 8px;
       padding:7px 10px; align-items:baseline }
.fl  { font-size:10px; font-weight:700; color:#6b7280 }
.fv  { font-size:11px; color:#111827; font-weight:500 }
.fd  { background:#d1d5db }
</style></head><body>${pagesHtml}</body></html>`;
}

// ── Puppeteer 런처 ─────────────────────────────────────────────────
async function launchBrowser() {
  const puppeteer = (await import("puppeteer-core")).default;

  // Vercel / AWS Lambda → @sparticuz/chromium
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 3 },
    });
  }

  // 로컬 개발 — 설치된 Chromium/Chrome/Edge 사용 (여러 경로 시도)
  const candidates: string[] = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else if (process.platform === "linux") {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium");
  }

  let lastError: unknown = null;
  for (const executablePath of candidates) {
    try {
      const browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        executablePath,
        headless: true,
        defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 3 },
      });
      return browser;
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw new Error(`No local Chrome/Edge executable found for PDF rendering. Last error: ${String(lastError)}`);
}

// ── Route Handler ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  try {
    const { sheetName, blocks }: { sheetName: string; blocks: Block[] } =
      await req.json();
    const html = buildHtml(sheetName, blocks);
    browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });

    return new Response(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(sheetName)}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}
