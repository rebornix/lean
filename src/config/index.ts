import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "lean");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  apiKey?: string;
}

export function readConfig(): Config {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function writeConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function deleteConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE);
  }
}

export function getApiKey(): string {
  const envKey = process.env.LINEAR_API_KEY;
  if (envKey) {
    return envKey;
  }
  const config = readConfig();
  if (config.apiKey) {
    return config.apiKey;
  }
  throw new Error("No API key found. Run `lean auth login` or set LINEAR_API_KEY.");
}
