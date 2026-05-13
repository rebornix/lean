import type { Command } from "commander";
import { input } from "@inquirer/prompts";
import { writeConfig, deleteConfig, getApiKey } from "../config/index.js";
import { getClient } from "../api/client.js";
import { LeanError } from "../errors.js";

export function registerAuthCommands(auth: Command): void {
  auth
    .command("login")
    .description("Authenticate with Linear API key")
    .option("--api-key <key>", "Provide API key non-interactively")
    .action(async (opts: { apiKey?: string }) => {
      let apiKey = opts.apiKey;
      if (!apiKey) {
        if (!process.stdin.isTTY) {
          throw new LeanError("prompt_required_in_non_tty", "Cannot prompt for API key in non-interactive mode", {
            action: "Pass --api-key <key> or set LINEAR_API_KEY",
          });
        }
        apiKey = await input({ message: "Enter your Linear API key:" });
      }
      writeConfig({ apiKey });
      console.log("API key saved.");
    });

  auth
    .command("status")
    .description("Show current authentication status")
    .action(async () => {
      try {
        getApiKey();
      } catch {
        throw new LeanError("auth_required", "No API key configured", {
          action: "Run `lean auth login` or set LINEAR_API_KEY",
        });
      }
      const client = getClient();
      const viewer = await client.viewer;
      console.log(`Logged in as: ${viewer.name} (${viewer.email})`);
    });

  auth
    .command("logout")
    .description("Remove stored credentials")
    .action(() => {
      deleteConfig();
      console.log("Logged out.");
    });
}
