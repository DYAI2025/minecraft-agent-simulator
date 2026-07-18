# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**MISSI** — Minecraft Scenario Simulator. A dashboard for running LLM-driven bots through
Minecraft scenarios, either against a **real Minecraft server** (via `mineflayer`) or a
**deterministic offline emulator** (a 30×30 procedural world grid). Bots make decisions by
calling a configurable LLM provider (Gemini, OpenAI, Anthropic, OpenRouter, Ollama, LM Studio).

> Note: `package.json` `name` is `react-example` and `README.md` is the stock Google AI Studio
> scaffold — both are boilerplate, not the real project docs. The authoritative architecture
> docs live in `docs/` (start with `docs/missi-services-map.md`). Treat the AI Studio README's
> setup steps as approximate; the commands below are verified against the code.

## Commands

| Task | Command |
|------|---------|
| Dev (single process: API + Vite middleware) | `npm run dev` |
| Production build | `npm run build` |
| Start production bundle | `npm run start` |
| Typecheck / lint (same thing) | `npm run typecheck` (alias `npm run lint`) |
| All unit tests | `npm run test` |
| Single test file | `npx vitest run src/__tests__/ScenarioService.test.ts` |
| Watch a test | `npx vitest src/__tests__/ScenarioService.test.ts` |
| E2E / smoke diagnostics | `npm run missi:smoke:e2e` (also `:server`, `:provider`, `:bot`) |
| Sprint acceptance checks | `npm run missi:verify:sprint2` … `:sprint8` |

- `lint`/`typecheck` are both `tsc --noEmit` — there is no ESLint. `tsconfig` has `noEmit`, so
  TypeScript never emits; compilation to JS is done by Vite (frontend) and esbuild (server).
- `build` runs `scripts/verify-build-runtime.mjs` first (a guard), then `vite build` for the
  SPA and bundles `server.ts` → `dist/server.cjs` via esbuild (CJS, external packages).
- Node **≥ 22.12** required (`engines`). Dependency lockfiles for both `bun` and `npm` exist;
  `Dockerfile`/CI use `npm ci`.

## Architecture

### Single-process, dual-serve
`server.ts` is the whole backend. One Express app serves **both** the JSON API (`/api/*`) and
the frontend on **one port** (default `3000`, override `PORT`; host `HOST`, default `0.0.0.0`):
- Dev (`NODE_ENV !== 'production'`): mounts Vite in `middlewareMode` — no separate Vite dev server.
- Prod: serves static `dist/` and SPA-falls-back non-`/api` routes to `index.html`.

`server.ts` is thin routing over a set of **singleton services** (`XService.getInstance()`),
each initialized once at startup. Adding a feature almost always means: add/extend a service,
expose a route in `server.ts`, add a React card in `src/components/`.

### Services (`src/services/`) — all singletons
- **PersistenceService** — atomic JSON read/write under `<MISSI_STORAGE_ROOT>/data/`, with a
  path-traversal sandbox (rejects any resolved path escaping `baseDir`). All config persistence
  goes through here.
- **SettingsService / SecretStoreService** — server config, workspace options, public LLM
  provider list / encrypted API keys. Secrets are kept out of logs and API responses by design.
- **ScenarioLibraryService / ScenarioService / ScenarioValidatorService** — Markdown scenarios
  parsed to JSON (schema in `docs/scenario-markdown-schema.md`), CRUD, validation.
- **BotProfileService** — reusable bot archetypes (Character Prompt = persona, Behavior Prompt = strategy).
- **MinecraftServerService** — owns `runtimeMode` and world state. Spawns a real `server.jar`
  (`minecraft-server/`, Java child process) for live mode, or the procedural grid emulator.
- **BotOrchestratorService** — join sequencing, step loop, per-step LLM decision. Each decision
  records a `decisionSource`: `real_provider` | `simulation` | `fallback_wait`.
- **LLMProviderService** — one adapter per provider; unifies them behind a decision call and
  classifies provider errors (auth / rate-limit / bad-model / etc).
- **EventStoreService** — in-memory live log buffer + archives runs to `<root>/runs/` (`run_*`
  dirs and `manifest_run_*.json`). Server logs are piped in as `SYSTEM` events.
- **LPAMService** — bot long-term memory; shells out to an external **`gbrain`** CLI via
  `child_process.spawn`. Absent that binary on PATH, LPAM features won't work.

### Frontend (`src/`)
React 19 + Tailwind v4 SPA. `App.tsx` polls `GET /api/status` every 2s to stay live; UI is a
set of cards (`src/components/*Card.tsx`, `LiveMonitor`, `WorldGridVisualizer`, `RunHistory`).
Domain schemas in `src/domain/`, shared types in `src/types/index.ts`.

## Runtime modes & safety gates

`runtimeMode` is one of `'live' | 'simulation' | 'blocked' | 'failed' | 'stopped'`. Three env
toggles gate what the app is allowed to do — **know these before touching server/bot code**:

- `ALLOW_SIMULATION_MODE` — **defaults to enabled**; only the literal string `false` disables it.
  When `false` and no real server is available, mode becomes `blocked` and start throws
  `SIMULATION_MODE_DISABLED`. `/api/status` surfaces `not_live_ready` when in simulation or blocked.
- `ALLOW_SERVER_COMMAND` — **defaults to disabled**; must be exactly `true` to run any console
  command against the server.
- Even with commands enabled, `src/domain/server/server-command-policy.ts` whitelists only:
  `say <msg>`, `seed` (no args), `list` (no args), and exactly `time query daytime`. Everything
  else is rejected. Keep this whitelist authoritative — don't bypass `isCommandAllowed`.

## Conventions & gotchas

- **Import extensions:** server-side code imports sibling modules with **`.js`** extensions
  (e.g. `from './src/services/Foo.js'`) even though the files are `.ts` — required for the
  ESM/esbuild build. Frontend imports use `.ts`/`.tsx`. Match the surrounding file.
- **Storage root:** all persisted data (`data/`, `runs/`, `minecraft-server/`) resolves under
  `MISSI_STORAGE_ROOT` (default: `process.cwd()`). In Docker/Railway it's `/data`.
- **LLM provider default models** (verified in `LLMProviderService.ts`; used when a provider
  has no `defaultModel`): Gemini `gemini-1.5-flash`, OpenAI `gpt-4o-mini`, Anthropic
  `claude-3-5-haiku-latest`, OpenRouter `google/gemini-2.5-flash`, Ollama `qwen2.5:7b`,
  LM Studio `meta-llama-3-8b-instruct`. (The model names in `docs/missi-services-map.md` are
  aspirational and partly wrong — trust the code.)
- **Deploy:** `Dockerfile` (multi-stage, installs a JRE for live Minecraft) + `railway.json`
  (Docker builder, healthcheck `/health`). See `docs/deployment/railway.md`.
- **Tests:** Vitest, in `src/__tests__/`. `scripts/smoke-*.ts` and `scripts/verify-sprint-*.ts`
  are runnable acceptance/diagnostic harnesses invoked via the `missi:*` npm scripts, not Vitest.
