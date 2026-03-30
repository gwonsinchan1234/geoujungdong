import { NextRequest } from "next/server";
import { buildMonthlyOutputHtml, type MonthlyOutputData } from "@/lib/monthlyOutputTemplate";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function launchBrowser() {
  const puppeteer = (await import("puppeteer-core")).default;

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: { width: 1400, height: 900, deviceScaleFactor: 2 },
    });
  }

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
        defaultViewport: { width: 1400, height: 900, deviceScaleFactor: 2 },
      });
      return browser;
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw new Error(`No local Chrome/Edge executable found for PNG rendering. Last error: ${String(lastError)}`);
}

export async function POST(req: NextRequest) {
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    const payload = (await req.json()) as { data: MonthlyOutputData; fileName?: string };
    const html = buildMonthlyOutputHtml(payload.data);
    const fileName = String(payload.fileName ?? "월간출력현황.png");

    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });

    // A4 landscape에 가깝게 body를 캡처
    const png = await page.screenshot({ type: "png", fullPage: true });

    return new Response(Buffer.from(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}

