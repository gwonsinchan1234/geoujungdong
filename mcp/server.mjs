// mcp/server.mjs
// 구현 이유: Cursor에서 “제가 필요할 때 즉시” 파일구조/수정분/git diff/검색을 읽어 원인 단일확정 디버깅을 하기 위한 로컬 MCP 서버(stdio).
// 보안 원칙: 프로젝트 루트(cwd) 밖 접근/절대경로/상위경로(..)는 차단.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const server = new Server(
  { name: "geoujungdong-mcp", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

// ---------- Security helpers ----------
function assertSafeRelative(rel) {
  if (typeof rel !== "string" || rel.trim().length === 0) throw new Error("relativePath is required.");
  if (path.isAbsolute(rel)) throw new Error("Absolute paths are not allowed.");
  // 윈도우 드라이브 문자 우회 차단 (e.g. C:foo)
  if (/^[a-zA-Z]:/.test(rel)) throw new Error("Drive paths are not allowed.");
}

function resolveInProjectRoot(rel) {
  const root = process.cwd();
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error("Path traversal detected. Blocked.");
  }
  return { root, full };
}

// ---------- Schemas ----------
const PingInput = z.object({
  message: z.string().optional(),
});

const ReadFileInput = z.object({
  relativePath: z.string().min(1),
});

const ListDirInput = z.object({
  relativePath: z.string().default("."),
  maxEntries: z.number().int().min(1).max(500).default(200),
});

const GrepInput = z.object({
  query: z.string().min(1),
  // 기본은 src/만 뒤지게 하여 토큰/부하 절감
  relativeDir: z.string().default("src"),
  maxMatches: z.number().int().min(1).max(200).default(50),
  fileExts: z.array(z.string()).default([".ts", ".tsx", ".js", ".mjs", ".json", ".css", ".md"]),
});

const GitStatusInput = z.object({});

const GitDiffInput = z.object({
  // 기본: staged + unstaged 전체, 너무 길면 maxBytes로 자르기
  maxBytes: z.number().int().min(1000).max(300000).default(80000),
});

const FileHashInput = z.object({
  relativePath: z.string().min(1),
  algo: z.enum(["sha1", "sha256"]).default("sha256"),
});

// ---------- Tool list ----------
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ping",
        description: "Health check. Returns pong + optional echo.",
        inputSchema: {
          type: "object",
          properties: { message: { type: "string" } },
          required: [],
        },
      },
      {
        name: "project_info",
        description: "Returns project root (cwd) and node version.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "read_file_safe",
        description: "Reads a text file within the project root only (blocks absolute paths & traversal).",
        inputSchema: {
          type: "object",
          properties: { relativePath: { type: "string" } },
          required: ["relativePath"],
        },
      },
      {
        name: "list_dir",
        description: "Lists directory entries (files/folders) under project root.",
        inputSchema: {
          type: "object",
          properties: {
            relativePath: { type: "string", description: "Directory path relative to project root" },
            maxEntries: { type: "number", description: "Max entries to return (1~500)" },
          },
          required: [],
        },
      },
      {
        name: "grep_text",
        description: "Search text within a directory (simple grep). Returns file + line number + snippet.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            relativeDir: { type: "string" },
            maxMatches: { type: "number" },
            fileExts: { type: "array", items: { type: "string" } },
          },
          required: ["query"],
        },
      },
      {
        name: "git_status",
        description: "Runs 'git status --porcelain=v1 -b' in project root to see modified/untracked files.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "git_diff",
        description:
          "Runs 'git diff' (unstaged) + 'git diff --staged' and returns combined diff (truncated by maxBytes).",
        inputSchema: {
          type: "object",
          properties: { maxBytes: { type: "number" } },
          required: [],
        },
      },
      {
        name: "file_hash",
        description: "Returns a file hash (sha256/sha1) to detect changes reliably.",
        inputSchema: {
          type: "object",
          properties: {
            relativePath: { type: "string" },
            algo: { type: "string", enum: ["sha1", "sha256"] },
          },
          required: ["relativePath"],
        },
      },
    ],
  };
});

// ---------- Tool handlers ----------
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "ping") {
    const parsed = PingInput.safeParse(args ?? {});
    if (!parsed.success) throw new Error("Invalid input for ping");
    return {
      content: [{ type: "text", text: `pong${parsed.data.message ? ` | echo: ${parsed.data.message}` : ""}` }],
    };
  }

  if (name === "project_info") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { cwd: process.cwd(), node: process.version, platform: process.platform },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "read_file_safe") {
    const parsed = ReadFileInput.safeParse(args ?? {});
    if (!parsed.success) throw new Error("Invalid input for read_file_safe");

    const rel = parsed.data.relativePath;
    assertSafeRelative(rel);
    const { full } = resolveInProjectRoot(rel);

    const text = await fs.readFile(full, "utf8");
    return { content: [{ type: "text", text }] };
  }

  if (name === "list_dir") {
    const parsed = ListDirInput.safeParse(args ?? {});
    if (!parsed.success) throw new Error("Invalid input for list_dir");

    const rel = parsed.data.relativePath;
    assertSafeRelative(rel);
    const { full } = resolveInProjectRoot(rel);

    const entries = await fs.readdir(full, { withFileTypes: true });
    const limited = entries.slice(0, parsed.data.maxEntries).map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : e.isFile() ? "file" : "other",
    }));

    return { content: [{ type: "text", text: JSON.stringify({ path: rel, entries: limited }, null, 2) }] };
  }

  if (name === "grep_text") {
    const parsed = GrepInput.safeParse(args ?? {});
    if (!parsed.success) throw new Error("Invalid input for grep_text");

    const { query, relativeDir, maxMatches, fileExts } = parsed.data;
    assertSafeRelative(relativeDir);
    const { full: dirFull } = resolveInProjectRoot(relativeDir);

    const matches = [];
    async function walk(dir) {
      if (matches.length >= maxMatches) return;

      const ents = await fs.readdir(dir, { withFileTypes: true });
      for (const ent of ents) {
        if (matches.length >= maxMatches) return;
        if (ent.name === "node_modules" || ent.name === ".next" || ent.name === ".git") continue;

        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await walk(p);
        } else if (ent.isFile()) {
          const ext = path.extname(ent.name);
          if (!fileExts.includes(ext)) continue;

          let content;
          try {
            content = await fs.readFile(p, "utf8");
          } catch {
            continue;
          }

          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(query)) {
              matches.push({
                file: path.relative(process.cwd(), p),
                line: i + 1,
                text: lines[i].slice(0, 240),
              });
              if (matches.length >= maxMatches) return;
            }
          }
        }
      }
    }

    await walk(dirFull);
    return { content: [{ type: "text", text: JSON.stringify({ query, matches }, null, 2) }] };
  }

  if (name === "git_status") {
    const parsed = GitStatusInput.safeParse(args ?? {});
    if (!parsed.success) throw new Error("Invalid input for git_status");

    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "-b"], { cwd: process.cwd() });
    return { content: [{ type: "text", text: stdout || "(clean)" }] };
  }

  if (name === "git_diff") {
    const parsed = GitDiffInput.safeParse(args ?? {});
    if (!parsed.success) throw new Error("Invalid input for git_diff");

    const maxBytes = parsed.data.maxBytes;

    const a = await execFileAsync("git", ["diff"], { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
    const b = await execFileAsync("git", ["diff", "--staged"], { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });

    let combined = "";
    if (a.stdout) combined += `--- git diff (unstaged) ---\n${a.stdout}\n`;
    if (b.stdout) combined += `--- git diff --staged ---\n${b.stdout}\n`;
    if (!combined) combined = "(no diff)";

    // 길이 제한
    const buf = Buffer.from(combined, "utf8");
    const out = buf.length > maxBytes ? buf.subarray(0, maxBytes).toString("utf8") + "\n\n[TRUNCATED]" : combined;

    return { content: [{ type: "text", text: out }] };
  }

  if (name === "file_hash") {
    const parsed = FileHashInput.safeParse(args ?? {});
    if (!parsed.success) throw new Error("Invalid input for file_hash");

    const rel = parsed.data.relativePath;
    assertSafeRelative(rel);
    const { full } = resolveInProjectRoot(rel);

    const data = await fs.readFile(full);
    const h = crypto.createHash(parsed.data.algo).update(data).digest("hex");
    return { content: [{ type: "text", text: JSON.stringify({ file: rel, algo: parsed.data.algo, hash: h }, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[geoujungdong-mcp] started (stdio) v1.1.0");
}

main().catch((e) => {
  console.error("[geoujungdong-mcp] failed:", e);
  process.exit(1);
});