import type { Command } from "commander";
import { password } from "@inquirer/prompts";
import { writeConfig, deleteConfig, getApiKey } from "../config/index.js";
import { getClient } from "../api/client.js";
import { LeanError } from "../errors.js";
import { respond } from "../output/index.js";

interface AuthOpts {
  apiKey?: string;
  json?: boolean;
  format?: string;
}

export function registerAuthCommands(auth: Command): void {
  auth
    .command("login")
    .description("Authenticate with Linear API key")
    .option("--api-key <key>", "Provide API key non-interactively")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async (opts: AuthOpts) => {
      let apiKey = opts.apiKey;
      if (!apiKey) {
        if (!process.stdin.isTTY) {
          throw new LeanError("prompt_required_in_non_tty", "Cannot prompt for API key in non-interactive mode", {
            action: "Pass --api-key <key> or set LINEAR_API_KEY",
          });
        }
        apiKey = await password({ message: "Enter your Linear API key:", mask: "*" });
      }
      writeConfig({ apiKey });
      respond(opts, { ok: true }, () => {
        console.log("API key saved.");
      });
    });

  auth
    .command("status")
    .description("Show current authentication status")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async (opts: AuthOpts) => {
      try {
        getApiKey();
      } catch {
        throw new LeanError("auth_required", "No API key configured", {
          action: "Run `lean auth login` or set LINEAR_API_KEY",
        });
      }
      const client = getClient();
      const viewer = await client.viewer;
      respond(opts, { authenticated: true, user: { id: viewer.id, name: viewer.name, email: viewer.email } }, () => {
        console.log(`Logged in as: ${viewer.name} (${viewer.email})`);
      });
    });

  auth
    .command("logout")
    .description("Remove stored credentials")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action((opts: AuthOpts) => {
      deleteConfig();
      respond(opts, { ok: true }, () => {
        console.log("Logged out.");
      });
    });
}
