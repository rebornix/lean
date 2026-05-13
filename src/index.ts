#!/usr/bin/env node
// Load .env unless the runner explicitly opts out. The doc-test runner
// sets LEAN_SKIP_DOTENV=1 so its `env -u LINEAR_API_KEY` overrides aren't
// silently re-populated by a developer's personal .env file.
if (!process.env.LEAN_SKIP_DOTENV) {
  await import("dotenv/config");
}
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerIssueCommands } from "./commands/issue.js";
import { registerApiCommand } from "./commands/api.js";
import { registerUsageCommand, registerSubcommandUsage } from "./commands/usage.js";
import { reportError } from "./reporter.js";

const program = new Command();

program.name("lean").description("CLI for Linear project management").version("0.1.0");

const auth = program.command("auth").description("Authentication commands");
registerAuthCommands(auth);
registerSubcommandUsage(auth, "auth");

const issue = program.command("issue").description("Issue management");
registerIssueCommands(issue);
registerSubcommandUsage(issue, "issue");

registerApiCommand(program);
const apiCmd = program.commands.find(c => c.name() === "api");
if (apiCmd) {
  registerSubcommandUsage(apiCmd, "api");
}

registerUsageCommand(program);

program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (err) {
  reportError(err);
}
