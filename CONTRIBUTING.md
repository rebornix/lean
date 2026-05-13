# Contributing

`lean` is a small project. The contribution flow is straightforward.

## Setup

1. **Fork and clone** this repo and the emulator fork:
   ```bash
   git clone https://github.com/<you>/lean.git
   git clone --branch lean-extensions https://github.com/rebornix/emulate.git
   ```
2. **Install** lean's deps and **build** the emulator:
   ```bash
   cd emulate && pnpm install && pnpm build && cd ..
   cd lean && npm install && npm run build
   ```
3. **Run the checks** to make sure your local environment is healthy:
   ```bash
   npm run check
   ```
   This runs lint, format check, type check, and the full doc-test
   suite against the emulator. All four must pass.

## Workflow

- **Add a feature** → write or update a spec under `Specs/<topic>.md`,
  then implement, then add or update doc-tests under `Docs/`.
- **Doc-tests are the contract.** If behaviour changes, run
  `npm run test:docs -- --update` to refresh the expected output blocks
  in place, then review the diff carefully before committing.
- **Decisions** that affect the architecture (new commands, new error
  classes, changing the auth flow, etc.) get an entry in
  `Decisions.md`.

## Coding conventions

- TypeScript strict mode (already enforced by `tsconfig.json`)
- ESLint + Prettier; `npm run check` must pass
- Errors flow through `LeanError` and the top-level reporter; never
  call `process.exit` outside `src/reporter.ts`
- Commands live one-per-resource in `src/commands/`
- Every command supports `--json`

See `AGENTS.md` for a deeper walkthrough.

## Filing issues

Bug reports are welcome. For real-world failures against
api.linear.app, please include:
- The exact command you ran (with secrets redacted)
- The exit code and stderr / `--json` output
- `lean --version`

For security issues, see [SECURITY.md](./SECURITY.md).
