#!/usr/bin/env node
/**
 * Doc-test runner: extracts `$ lean ...` blocks from markdown files in
 * Docs/, runs each command against a local emulator, and diffs the actual
 * output against the expected block.
 *
 * Usage:
 *   tsx scripts/doc-test.ts [files...] [--update]
 *
 * Env:
 *   LEAN_EMULATOR_DIR  Path to the emulate repo (default ../emulate)
 *   LEAN_EMULATOR_PORT Emulator port (default 4100, distinct from a dev one)
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import YAML from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EMULATOR_DIR = process.env.LEAN_EMULATOR_DIR
  ? resolve(process.env.LEAN_EMULATOR_DIR)
  : resolve(ROOT, "..", "emulate");
const PORT = Number(process.env.LEAN_EMULATOR_PORT ?? 4100);
const EMULATOR_URL = `http://localhost:${PORT}`;
const API_KEY = "lin_api_test";

type Block = {
  kind: "console";
  startLine: number;
  endLine: number;
  raw: string;
  entries: Entry[];
};

type Entry = {
  command: string;
  expected: string;
  expectedStartLine: number;
  expectedEndLine: number;
};

type DocFile = {
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  blocks: Block[];
};

const PLACEHOLDERS: [RegExp, string][] = [
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>"],
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "<timestamp>"],
  [/"lastSyncId":\s*\d+/g, '"lastSyncId": <syncId>'],
];

function normalize(text: string): string {
  let out = text.replace(/\r\n/g, "\n").replace(/^\n+/, "").trimEnd();
  for (const [pattern, replacement] of PLACEHOLDERS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown> | null; body: string } {
  if (!content.startsWith("---\n")) {
    return { frontmatter: null, body: content };
  }
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: null, body: content };
  }
  const raw = content.slice(4, end);
  const parsed = YAML.parse(raw) as Record<string, unknown>;
  return { frontmatter: parsed, body: content.slice(end + 5) };
}

function parseBlocks(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "```console") {
      const startLine = i;
      const bodyLines: string[] = [];
      i++;
      const bodyStart = i;
      while (i < lines.length && lines[i]?.trim() !== "```") {
        bodyLines.push(lines[i] ?? "");
        i++;
      }
      const endLine = i;
      const entries = parseEntries(bodyLines, bodyStart);
      blocks.push({
        kind: "console",
        startLine,
        endLine,
        raw: bodyLines.join("\n"),
        entries,
      });
    }
    i++;
  }
  return blocks;
}

function parseEntries(bodyLines: string[], absoluteStart: number): Entry[] {
  const entries: Entry[] = [];
  let i = 0;
  while (i < bodyLines.length) {
    const line = bodyLines[i] ?? "";
    if (line.startsWith("$ ")) {
      let command = line.slice(2);
      while (command.endsWith("\\") && i + 1 < bodyLines.length) {
        command = command.slice(0, -1).trimEnd() + " " + (bodyLines[++i] ?? "").trim();
      }
      i++;
      const expectedStartLine = absoluteStart + i;
      const expectedLines: string[] = [];
      while (i < bodyLines.length && !(bodyLines[i] ?? "").startsWith("$ ")) {
        expectedLines.push(bodyLines[i] ?? "");
        i++;
      }
      while (expectedLines.length > 0 && (expectedLines[expectedLines.length - 1] ?? "").trim() === "") {
        expectedLines.pop();
      }
      entries.push({
        command,
        expected: expectedLines.join("\n"),
        expectedStartLine,
        expectedEndLine: expectedStartLine + expectedLines.length,
      });
      continue;
    }
    i++;
  }
  return entries;
}

async function loadDoc(path: string): Promise<DocFile> {
  const content = await readFile(path, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);
  return { path, content, frontmatter, blocks: parseBlocks(body) };
}

async function findDocFiles(args: string[]): Promise<string[]> {
  if (args.length > 0) {
    return args.map(a => resolve(a));
  }
  const docsDir = resolve(ROOT, "Docs");
  const all = await readdir(docsDir);
  return all
    .filter(f => f.endsWith(".md") && !f.startsWith("_"))
    .sort()
    .map(f => join(docsDir, f));
}

async function startEmulator(): Promise<ChildProcess> {
  const cliPath = join(EMULATOR_DIR, "packages/emulate/dist/index.js");
  if (!existsSync(cliPath)) {
    throw new Error(`Emulator CLI not found at ${cliPath}. Run \`pnpm build\` in ${EMULATOR_DIR} first.`);
  }
  const proc = spawn("node", [cliPath, "start", "--service", "linear", "--port", String(PORT)], {
    cwd: EMULATOR_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // Force the emulator to reject unknown filter fields/operators so
      // bugs in lean's filter shapes fail loudly instead of silently
      // returning all rows.
      LEAN_EMULATOR_STRICT: "1",
    },
  });
  await waitForReady();
  return proc;
}

async function waitForReady(timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${EMULATOR_URL}/graphql`, {
        method: "POST",
        headers: { Authorization: API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ viewer { id } }" }),
      });
      if (res.ok) {
        return;
      }
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Emulator did not become ready on ${EMULATOR_URL}`);
}

async function resetEmulator(): Promise<void> {
  const res = await fetch(`${EMULATOR_URL}/__reset?defaults=false`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`/__reset failed: ${res.status}`);
  }
}

async function seedEmulator(seed: unknown): Promise<void> {
  const res = await fetch(`${EMULATOR_URL}/__seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(seed),
  });
  if (!res.ok) {
    throw new Error(`/__seed failed: ${res.status}`);
  }
}

async function loadDefaultSeed(): Promise<unknown> {
  const seedPath = resolve(ROOT, "Docs", "_seed.yaml");
  if (!existsSync(seedPath)) {
    return null;
  }
  const text = await readFile(seedPath, "utf-8");
  return YAML.parse(text);
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? "";
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        buf += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch as '"' | "'";
      continue;
    }
    if (ch === " ") {
      if (buf.length > 0) {
        tokens.push(buf);
        buf = "";
      }
      continue;
    }
    buf += ch;
  }
  if (buf.length > 0) {
    tokens.push(buf);
  }
  return tokens;
}

async function runLean(
  command: string,
  envOverrides?: Record<string, string | null>
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let tokens = tokenize(command);
  const inlineUnset: string[] = [];
  const inlineSet: Record<string, string> = {};

  // Support a leading `env -u VAR` and `VAR=value` style prefix per command,
  // so individual doc-tests can override env without per-doc frontmatter.
  if (tokens[0] === "env") {
    let i = 1;
    while (i < tokens.length && (tokens[i] === "-u" || /^[A-Z_][A-Z0-9_]*=/.test(tokens[i] ?? ""))) {
      const tok = tokens[i] ?? "";
      if (tok === "-u") {
        const name = tokens[i + 1];
        if (name) {
          inlineUnset.push(name);
        }
        i += 2;
      } else {
        const eq = tok.indexOf("=");
        inlineSet[tok.slice(0, eq)] = tok.slice(eq + 1);
        i += 1;
      }
    }
    tokens = tokens.slice(i);
  }

  if (tokens[0] !== "lean") {
    throw new Error(`Command must start with 'lean': ${command}`);
  }
  const args = tokens.slice(1);
  const cliPath = join(ROOT, "dist", "index.js");
  const baseEnv: Record<string, string | undefined> = {
    ...process.env,
    LINEAR_API_KEY: API_KEY,
    LINEAR_API_URL: `${EMULATOR_URL}/graphql`,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    LEAN_SKIP_DOTENV: "1",
  };
  if (envOverrides) {
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === null) {
        delete baseEnv[key];
      } else {
        baseEnv[key] = value;
      }
    }
  }
  for (const name of inlineUnset) {
    delete baseEnv[name];
  }
  for (const [k, v] of Object.entries(inlineSet)) {
    baseEnv[k] = v;
  }
  const result = await execa("node", [cliPath, ...args], {
    env: baseEnv,
    reject: false,
    stripFinalNewline: true,
    input: "",
  });
  let stderr = result.stderr ?? "";
  if (stderr.length > 800) {
    const firstNewline = stderr.indexOf("\n");
    const firstLine = (firstNewline === -1 ? stderr : stderr.slice(0, firstNewline)).slice(0, 200);
    stderr = firstLine + "\n... [stderr truncated]";
  }
  return {
    stdout: result.stdout ?? "",
    stderr,
    exitCode: result.exitCode ?? 0,
  };
}

function diff(actual: string, expected: string): string {
  const a = actual.split("\n");
  const b = expected.split("\n");
  const out: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const av = a[i] ?? "<EOF>";
    const bv = b[i] ?? "<EOF>";
    if (av === bv) {
      out.push(`  ${av}`);
    } else {
      out.push(`- ${bv}`);
      out.push(`+ ${av}`);
    }
  }
  return out.join("\n");
}

interface RunSummary {
  file: string;
  passed: number;
  failed: number;
  failures: { command: string; actual: string; expected: string }[];
}

async function runDoc(doc: DocFile, defaultSeed: unknown, update: boolean): Promise<RunSummary> {
  await resetEmulator();
  if (defaultSeed) {
    await seedEmulator(defaultSeed);
  }
  if (doc.frontmatter && doc.frontmatter.seed) {
    await seedEmulator(doc.frontmatter.seed);
  }

  const summary: RunSummary = {
    file: relative(ROOT, doc.path),
    passed: 0,
    failed: 0,
    failures: [],
  };

  const replacements: { entry: Entry; actual: string }[] = [];

  for (const block of doc.blocks) {
    // Reset state between blocks so each block is self-contained. Sequencing
    // within one block is intentional; sequencing across blocks is not.
    await resetEmulator();
    if (defaultSeed) {
      await seedEmulator(defaultSeed);
    }
    if (doc.frontmatter && doc.frontmatter.seed) {
      await seedEmulator(doc.frontmatter.seed);
    }

    for (const entry of block.entries) {
      const envOverrides =
        doc.frontmatter && doc.frontmatter.env ? (doc.frontmatter.env as Record<string, string | null>) : undefined;
      const result = await runLean(entry.command, envOverrides);
      const parts = [result.stdout, result.stderr].filter(s => s.length > 0);
      const actualNorm = normalize(parts.join("\n"));
      const expectedNorm = normalize(entry.expected);
      if (actualNorm === expectedNorm) {
        summary.passed++;
      } else {
        summary.failed++;
        summary.failures.push({ command: entry.command, actual: actualNorm, expected: expectedNorm });
        if (update) {
          replacements.push({ entry, actual: actualNorm });
        }
      }
    }
  }

  if (update && replacements.length > 0) {
    await rewriteDoc(doc, replacements);
  }
  return summary;
}

async function rewriteDoc(doc: DocFile, replacements: { entry: Entry; actual: string }[]): Promise<void> {
  const lines = doc.content.split("\n");
  // Apply from bottom to top so line numbers stay valid.
  const sorted = [...replacements].sort((a, b) => b.entry.expectedStartLine - a.entry.expectedStartLine);
  for (const { entry, actual } of sorted) {
    const newLines = actual === "" ? [] : actual.split("\n");
    lines.splice(entry.expectedStartLine, entry.expectedEndLine - entry.expectedStartLine, ...newLines);
  }
  await writeFile(doc.path, lines.join("\n"), "utf-8");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const update = argv.includes("--update");
  const fileArgs = argv.filter(a => a !== "--update");

  // Guardrail: SKILL.md must stay under 8000 chars (~2000 tokens).
  const skillPath = resolve(ROOT, "SKILL.md");
  if (existsSync(skillPath)) {
    const skill = await readFile(skillPath, "utf-8");
    if (skill.length > 8000) {
      console.error(`SKILL.md is ${skill.length} chars; the cap is 8000.`);
      process.exit(1);
    }
  }

  const files = await findDocFiles(fileArgs);
  if (files.length === 0) {
    console.error("No doc files found.");
    process.exit(1);
  }

  console.error(`Starting emulator on ${EMULATOR_URL} ...`);
  const emulator = await startEmulator();
  const cleanup = (): void => {
    if (!emulator.killed) {
      emulator.kill("SIGTERM");
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  const defaultSeed = await loadDefaultSeed();

  let totalPassed = 0;
  let totalFailed = 0;
  try {
    for (const file of files) {
      const doc = await loadDoc(file);
      const summary = await runDoc(doc, defaultSeed, update);
      totalPassed += summary.passed;
      totalFailed += summary.failed;
      const status = summary.failed === 0 ? "PASS" : "FAIL";
      console.log(`${status} ${summary.file}  (${summary.passed} passed, ${summary.failed} failed)`);
      for (const f of summary.failures) {
        console.log(`  $ ${f.command}`);
        console.log(
          diff(f.actual, f.expected)
            .split("\n")
            .map(l => `    ${l}`)
            .join("\n")
        );
      }
    }
  } finally {
    cleanup();
  }

  console.log(`\n${totalPassed} passed, ${totalFailed} failed`);
  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
