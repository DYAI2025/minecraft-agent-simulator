# MISSI Architecture Proposal

Based on the source code audit of `mindcraft-develop`, `minecraft-agent-swarm-main`, and `airi-minecraft-main`, this document outlines the proposed architecture for the **Minecraft Scenario Simulator (MISSI)**.

## 1. High-Level Architecture Diagram

```
                                  ┌───────────────────────────────┐
                                  │      React SPA Frontend       │
                                  │ (Scenario Editor, Dashboard)  │
                                  └──────────────┬────────────────┘
                                                 │ REST / WebSockets
                                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                MISSI Express Backend Server                            │
│                                                                                        │
│  ┌────────────────────┐   ┌────────────────────────┐   ┌────────────────────────────┐  │
│  │  Scenario Service  │◄──┤  Bot Runtime Orchestrator│◄──┤  EventStore Service      │  │
│  │ (Parses Markdown,  │   │ (Coordinates agent     │   │ (Scientific Trace Logs,    │  │
│  │  Validates schema) │   │  ticks, Blackboard)    │   │  Replays, Output logging)  │  │
│  └────────────────────┘   └──────┬──────────┬──────┘   └────────────────────────────┘  │
│                                  │          │                                          │
│                                  │          │                                          │
│  ┌────────────────────┐          │          │          ┌────────────────────────────┐  │
│  │ Minecraft Server   │◄─────────┘          └─────────►│   LLM Provider Gateway     │  │
│  │ Lifecycle Service  │                                │ (Gemini, OpenAI, Ollama,   │  │
│  │ (Spawns/Stops Java │                                │  Anthropic, Strict Schema) │  │
│  │  server locally)   │                                └──────────────┬─────────────┘  │
│  └─────────┬──────────┘                                               │                │
└────────────┼──────────────────────────────────────────────────────────┼────────────────┘
             │                                                          │
             ▼                                                          ▼
┌─────────────────────────┐                             ┌───────────────────────────────┐
│ Local Minecraft Server  │                             │  Cloud / Local LLM APIs       │
│ (Java Process, Port     │                             │ (OpenAI, Gemini API, Ollama)  │
│  25565, World state)    │                             └───────────────────────────────┘
└─────────────────────────┘
```

## 2. Core Modules and Dependencies

### 2.1. Scenario Service
- **Role**: Parses uploaded/pasted Markdown scenarios into a structured JSON configuration and validates them against the domain schema (objectives, bot definitions, environment settings).
- **Dependencies**: Receives user input from the Frontend; provides validated `Scenario` objects to the Bot Runtime Orchestrator.

### 2.2. Bot Runtime Orchestrator
- **Role**: The core controller (heavily inspired by `mindcraft-develop` and `minecraft-agent-swarm-main`). It manages the lifecycle of `mineflayer` bot instances, distributes tasks, ticks the agents, and maintains a "Blackboard" of shared knowledge.
- **Dependencies**: 
  - Depends on `Scenario Service` for initialization constraints.
  - Calls `LLM Provider Gateway` during cognitive ticks to decide next actions.
  - Connects to the `Local Minecraft Server` via TCP (using `mineflayer`).
  - Reports state changes to `EventStore Service`.

### 2.3. LLM Provider Gateway
- **Role**: Adapts standard action prompts to the specific API format of various LLM providers (Gemini, OpenAI, Anthropic, Ollama, OpenRouter). It enforces **strict action schemas** (inspired by `airi-minecraft-main`) to ensure the LLM outputs deterministically parseable JSON actions.
- **Dependencies**: Makes outbound HTTP calls to external API networks. Feeds parsed JSON actions back to the Orchestrator.

### 2.4. Minecraft Server Lifecycle Service
- **Role**: Manages the host Java process. Modifies `server.properties`, auto-accepts `eula.txt`, and spawns the `java -jar server.jar` process. Monitors server health and handles clean shutdown commands via stdin.
- **Dependencies**: Depends on host file system and OS-level Java runtime.

### 2.5. EventStore Service
- **Role**: Acts as the immutable scientific audit log. Records every LLM prompt, response, physical action, and server event into a structured JSONL format for later replay, analysis, and validation.
- **Dependencies**: Relies on host storage for writing files (`runs/`).

## 3. Justification

This architecture directly addresses MISSI's core objectives and non-negotiable runtime evidence rules:
* **Single-Stack Efficiency**: By adopting `mindcraft`'s Node.js concepts as the primary base, we keep the entire backend in a single Node.js/Express environment, significantly reducing operational complexity compared to `airi`'s Python/Node split.
* **Traceability**: The explicit inclusion of the `EventStore Service` ensures that scientific data collection is a first-class citizen, satisfying evidence rules for deterministic validation.
* **Resilience via Strict Schemas**: The `LLM Provider Gateway` acts as a shield, preventing LLM hallucinations from crashing the bot runtime by validating schema adherence before the action ever reaches the Minecraft server.

## 4. Potential Risks and Blockers

1. **Hardware Resource Contention**: Running a local Minecraft Server (requires 1-2GB RAM), an Express server orchestrating multiple `mineflayer` clients, and potentially a local LLM (Ollama) on a single machine or small Docker container may cause severe CPU/RAM exhaustion, leading to tick lag or crashes.
2. **Mineflayer Version Mismatch**: As Minecraft updates frequently, `mineflayer` and `mineflayer-pathfinder` can become unstable on newer versions (e.g., 1.21). Version pinning (e.g., 1.20.4) is crucial.
3. **LLM Schema Hallucinations**: Despite the Gateway, smaller local models (e.g., Llama 3 8B) may struggle to follow strict JSON action schemas, requiring retry-loops or fallback heuristics in the `LLM Provider Gateway` which can stall the simulation tick rate.
