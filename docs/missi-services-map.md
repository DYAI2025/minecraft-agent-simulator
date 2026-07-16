# MISSI Architecture & Service Mapping

This document provides a comprehensive structural mapping of the core services, provider integrations, server/bot capability boundaries, and the CLI/GUI architecture for the **Minecraft Scenario Simulator (MISSI)**.

---

## 1. Core Services & Entry Points

MISSI consists of multiple interconnected services managing world-generation, scenario execution, persistent storage, and bot orchestration.

| Service Name | Purpose / Responsibility | Entry Point File | Primary Access API / Pattern |
| :--- | :--- | :--- | :--- |
| **PersistenceService** | Atomically reads/writes configuration data files, checks path-traversal sandboxes, handles temp files. | `/src/services/PersistenceService.ts` | `PersistenceService.getInstance()` |
| **SettingsService** | Loads, merges, and updates server configuration, workspace options, and public LLM providers. | `/src/services/SettingsService.ts` | `SettingsService.getInstance()` |
| **SecretStoreService** | Encrypts and securely isolates credentials/API keys backend-side. Excludes secrets from logs/API. | `/src/services/SecretStoreService.ts` | `SecretStoreService.getInstance()` |
| **ScenarioLibraryService**| Manages Markdown/parsed JSON scenarios, auto-populates defaults, executes CRUD cycles. | `/src/services/ScenarioLibraryService.ts` | `ScenarioLibraryService.getInstance()` |
| **BotProfileService** | Curates reusable bot archetypes, character personas, and behavioral scripts (Character/Behavior Prompts). | `/src/services/BotProfileService.ts` | `BotProfileService.getInstance()` |
| **MinecraftServerService**| Simulates procedurally generated world grids, processes mock/live console commands, hooks server loops. | `/src/services/MinecraftServerService.ts` | `MinecraftServerService.getInstance()` |
| **BotOrchestratorService**| Oversees bot join-sequences, coordinates step intervals, triggers LLM reasoning-loops. | `/src/services/BotOrchestratorService.ts` | `BotOrchestratorService.getInstance()` |
| **EventStoreService** | Buffers dynamic execution logs, records structured metadata, archives runs. | `/src/services/EventStoreService.ts` | `EventStoreService.getInstance()` |

---

## 2. LLM Provider Support Map

MISSI supports multiple LLM providers natively. Each is configured with standard or custom endpoints and models:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LLM PROVIDER SUPPORT MAP                         │
└────────────────────────────────────────────────────────────────────────┘
     │
     ├── Google Gemini (Default)
     │    ├── API Key Source: process.env.GEMINI_API_KEY / SecretStore
     │    └── Primary Model: gemini-3.5-flash / gemini-2.5-flash
     │
     ├── OpenAI GPT
     │    ├── API Key Source: SecretStore
     │    └── Primary Model: gpt-4o-mini
     │
     ├── Anthropic Claude
     │    ├── API Key Source: SecretStore
     │    └── Primary Model: claude-3-5-sonnet / claude-3-5-haiku-latest
     │
     ├── OpenRouter (Aggregator)
     │    ├── API Key Source: SecretStore
     │    ├── Custom Endpoint: https://openrouter.ai/api/v1
     │    └── Primary Model: google/gemini-2.5-flash
     │
     ├── Ollama (Local)
     │    ├── Auth: Omitted (Local development)
     │    ├── Custom Endpoint: http://localhost:11434
     │    └── Primary Model: llama3
     │
     └── LM Studio (Local)
          ├── Auth: Omitted (Local development)
          ├── Custom Endpoint: http://localhost:1234/v1
          └── Primary Model: meta-llama-3-8b-instruct
```

---

## 3. Minecraft Server & Bot Capabilities

MISSI supports two operation modes: **Simulation (Deterministic Offline)** and **Live (Socket Connective)**.

```
                  ┌─────────────────────────────────────┐
                  │      Minecraft Server Runtime       │
                  └──────────────────┬──────────────────┘
                                     │
             ┌───────────────────────┴───────────────────────┐
             ▼                                               ▼
  [Simulation Engine]                                [Live Socket Join]
  - 30x30 procedural world grid                      - Spawns real TCP connections
  - Deterministic block harvesting                   - Interacts with mineflayer package
  - Step-based trigger loop                          - Operates on real server.jar ports
  - Local state buffers                              - Logs real-time TCP socket stream
```

### Bot Action Capabilities:
- **Spatial Positioning**: Tracks X, Y, Z coordinate metrics on the active play grid.
- **Resource Harvesting**: Collects logs, stones, or utility tables deterministically or via live mineflayer scripts.
- **Inter-Bot Communication**: Exchange status messages, request help, or coordinate objectives over mock/live chat channels.
- **Character Prompts**: Contextual persona modeling (e.g. "LumberjackBob", "GathererGaby") to drive dialog variance.
- **Behavior Prompts**: Dynamic script-rules directing task execution strategies (e.g. "Locate nearest Oak block and harvest").

---

## 4. UI / Runtime Architecture

The platform runs a dual-layer architecture built for instant local or cloud execution:

```
  ┌─────────────────────────────────────────────────────────┐
  │                   CLIENT-SIDE (GUI)                     │
  │   - React 19 SPA styled with Tailwind CSS               │
  │   - Live procedural block layouts & coordinate maps    │
  │   - Interactive code/markdown dropzone file-parsers     │
  │   - Real-time simulation event-stream log terminal     │
  └───────────────────────────┬─────────────────────────────┘
                              │
                    JSON Rest Endpoints (HTTP)
                              │
  ┌───────────────────────────▼─────────────────────────────┐
  │                    SERVER-SIDE (API)                    │
  │   - Express 4 custom endpoints running CJS / Cwd logs  │
  │   - Host: 0.0.0.0 | Port: 3000                          │
  │   - Integrated tsx development compilation layer        │
  │   - Atomic local JSON file systems under data/          │
  └─────────────────────────────────────────────────────────┘
```

---

## 5. Build, Test, and Execution Commands

| Target Operation | Command | Description |
| :--- | :--- | :--- |
| **Development Boot** | `npm run dev` | Boots backend with `tsx` watching file changes, exposing REST ports. |
| **Production Build** | `npm run build` | Compiles front-end assets to `/dist` and bundles `server.ts` into a self-contained ESM/CJS file. |
| **Production Start** | `npm run start` | Launches compiled production bundle. |
| **Full Typecheck** | `npm run typecheck` | Validates strict typescript compiler parameters. |
| **Unit Testing** | `npm run test` | Executes vitest suites verifying scenarios, parser modules, and persistent storage layers. |
| **Smoke Diagnostic**| `npm run missi:smoke:e2e` | Runs comprehensive mock diagnostic tests. |
