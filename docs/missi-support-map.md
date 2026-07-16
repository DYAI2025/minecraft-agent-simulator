# MISSI Support Map

This document outlines the support matrix, configuration requirements, and compatibility profiles for Minecraft Java Server versions and LLM providers supported by the **Minecraft Scenario Simulator (MISSI)**. It also specifies the evidence levels for validation.

---

## 1. Evidence Levels

Each supported item is validated using one of the following evidence levels:
* **Source-Inspected**: Code analysis confirms theoretical compatibility; pending functional test.
* **Unit-Only**: Validated against isolated mock environments and unit tests.
* **Integration**: Verified working in local sandbox integrations.
* **Real-Boundary-Smoke**: Fully validated against live, real-world boundaries (actual Minecraft server, actual LLM network calls).

---

## 2. Minecraft Java Server Version Support

MISSI relies on `mineflayer` for live connections and specific Java runtimes to host the local server. The following matrix details supported versions:

| Server Version | Java Runtime | Mineflayer Support | Evidence Level | Known Limitations |
| :--- | :--- | :--- | :--- | :--- |
| **1.20.4** | Java 17 / 21 | Stable | Real-Boundary-Smoke | None. Fully supported primary target. |
| **1.19.4** | Java 17 | Stable | Integration | Minor block data ID variations compared to 1.20. |
| **1.18.2** | Java 17 | Stable | Source-Inspected | Legacy terrain generation; some new items unavailable. |
| **1.16.5** | Java 8 / 11 | Stable | Source-Inspected | Highly requested legacy version; chat packet structures differ significantly. |
| **1.21.x** | Java 21 | Experimental | Unit-Only | Mineflayer support is ongoing; expect minor packet instability. |

### Configuration Requirements:
- The host system (or Docker container) MUST have the required Java version installed to launch the target server JAR via `MinecraftServerService`.
- `mineflayer-pathfinder` requires matching block data sets for navigation. Ensure the client initializes with the corresponding version string.

---

## 3. LLM Provider Support Matrix

MISSI supports a diverse range of cloud-hosted and local LLMs.

| Provider | Access Mode | Recommended Models | Auth Source | Interface Protocol | Evidence Level | Known Limitations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Gemini** | Cloud API | `gemini-2.5-flash`, `gemini-2.5-pro` | `GEMINI_API_KEY` | Native REST SDK | Real-Boundary-Smoke | Strict rate limits on free tiers. Excellent JSON schema enforcement. |
| **OpenAI GPT** | Cloud API | `gpt-4o`, `gpt-4o-mini` | `OPENAI_API_KEY` | OpenAI REST API | Real-Boundary-Smoke | High cost at scale. Best-in-class strict action schema adherence. |
| **Anthropic Claude** | Cloud API | `claude-3-5-sonnet-latest` | `ANTHROPIC_API_KEY` | Anthropic SDK | Integration | Lacks native JSON schema objects outside of tool usage. Requires prompt engineering for schemas. |
| **OpenRouter** | Cloud Aggregator | `google/gemini-2.5-flash`, `meta-llama/llama-3.3-70b` | `OPENROUTER_API_KEY` | OpenAI-Compatible | Integration | Extra latency (150-300ms). Schema adherence depends entirely on the chosen downstream model. |
| **Ollama** | Local Host | `llama3.1`, `gemma2` | Local URL | Ollama / OpenAI-Comp | Integration | Requires heavy local compute. Quantized models (<8B) may hallucinate action schemas. |
| **LM Studio** | Local Host | Custom GGUF models | Local URL | OpenAI-Compatible | Integration | Same hardware limitations as Ollama. Great for offline development. |

### Provider Configuration:
- Secrets are stored in `SecretStoreService` and injected safely into the `LLMProviderService` at runtime.
- For local providers (Ollama/LM Studio), ensure the ports (`11434` / `1234`) are reachable from the MISSI container if using Docker.
