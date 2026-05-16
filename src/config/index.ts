import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function configDir(): string {
  const override = process.env.LEAN_CONFIG_DIR;
  if (override && override.length > 0) {
    return override;
  }
  return join(homedir(), ".config", "lean");
}

function configFile(): string {
  return join(configDir(), "config.json");
}

export interface OAuthCredentials {
  access_token: string;
  refresh_token?: string;
  scope: string;
  obtained_at: string;
  expires_at?: string;
}

export interface Config {
  apiKey?: string;
  oauth?: OAuthCredentials;
}

export function readConfig(): Config {
  try {
    return JSON.parse(readFileSync(configFile(), "utf-8")) as Config;
  } catch {
    return {};
  }
}

export function writeConfig(config: Config): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configFile(), JSON.stringify(config, null, 2));
  try {
    chmodSync(configFile(), 0o600);
  } catch {
    // best-effort; Windows or unusual filesystems may not support chmod
  }
}

export function deleteConfig(): void {
  if (existsSync(configFile())) {
    unlinkSync(configFile());
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
