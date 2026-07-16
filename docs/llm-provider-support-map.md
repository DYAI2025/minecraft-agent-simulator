# LLM Provider Support Map

This document outlines the support matrix, model listings, configuration requirements, and compatibility profiles for all LLM providers supported by the **Minecraft Scenario Simulator (MISSI)**.

---

## 1. LLM Provider Support Matrix

MISSI supports a diverse range of cloud-hosted, aggregated, and local LLM backends to allow flexible simulation scales.

| Provider | Access Mode | Recommended Models | Auth / Config Source | Primary Interface Protocol |
| :--- | :--- | :--- | :--- | :--- |
| **Google Gemini (Default)** | Cloud API | `gemini-2.5-flash`, `gemini-2.5-pro` | `GEMINI_API_KEY` (Env/SecretStore) | Native REST SDK (`@google/genai`) |
| **OpenAI GPT** | Cloud API | `gpt-4o`, `gpt-4o-mini` | `OPENAI_API_KEY` (SecretStore) | OpenAI REST API (`v1/chat/completions`) |
| **Anthropic Claude** | Cloud API | `claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest` | `ANTHROPIC_API_KEY` (SecretStore) | Anthropic Messages SDK / API |
| **OpenRouter** | Cloud Aggregator | `google/gemini-2.5-flash`, `meta-llama/llama-3.3-70b-instruct` | `OPENROUTER_API_KEY` (SecretStore) | OpenAI-Compatible API (`openrouter.ai/api/v1`) |
| **Ollama** | Local Host | `llama3`, `mistral`, `gemma2` | Local URL (`http://localhost:11434`) | Ollama Native REST API or OpenAI-Comp |
| **LM Studio** | Local Host | `meta-llama-3-8b-instruct`, custom GGUF models | Local URL (`http://localhost:1234/v1`) | OpenAI-Compatible API (`v1/chat/completions`) |

---

## 2. Detailed Provider Profiles

### A. Google Gemini (Default)
* **Specific Supported Models**:
  - `gemini-2.5-flash` (Optimized for speed, high token limits, and low cost)
  - `gemini-2.5-pro` (Recommended for complex cooperative multi-agent tasks)
  - `gemini-1.5-flash` / `gemini-1.5-pro` (Legacy fallbacks)
* **Limitations & Configuration Requirements**:
  - Requires `process.env.GEMINI_API_KEY` or a securely saved credential in `SecretStore`.
  - Rate limits can be hit under intense parallel bot ticking; retry-backoff is recommended.
* **MISSI Core Compatibility**:
  - **Structured Outputs (Schema Enforcement)**: **Excellent (Native)**. Supports JSON Schema parameter validation inside the API call, ensuring bots return valid actions without syntax parsing errors.
  - **Deterministic Simulation**: **Fully Compatible**.
  - **Live Connect Mode**: **Fully Compatible**.
  - **Error Classification**: Maps to standard `unauthorized`, `missing_key`, or `quota_exceeded` profiles.

### B. OpenAI GPT
* **Specific Supported Models**:
  - `gpt-4o` (Highly precise reasoning, superior logic)
  - `gpt-4o-mini` (Extremely cost-effective, high speed)
* **Limitations & Configuration Requirements**:
  - Requires `OPENAI_API_KEY` set in `SecretStore`.
  - Strict monthly credit limits apply; requires commercial billing setup.
* **MISSI Core Compatibility**:
  - **Structured Outputs (Schema Enforcement)**: **Excellent**. Supports strict JSON output parameters, resulting in near-zero parsing failures.
  - **Deterministic Simulation**: **Fully Compatible**.
  - **Live Connect Mode**: **Fully Compatible**.
  - **Error Classification**: Maps cleanly to standard API response errors (401/429/400).

### C. Anthropic Claude
* **Specific Supported Models**:
  - `claude-3-5-sonnet-latest` (Exceptional logic, code generation, and task planning)
  - `claude-3-5-haiku-latest` (Highly responsive fast-ticking agent)
* **Limitations & Configuration Requirements**:
  - Requires `ANTHROPIC_API_KEY` in `SecretStore`.
  - More expensive per token compared to flash models.
* **MISSI Core Compatibility**:
  - **Structured Outputs (Schema Enforcement)**: **High**. Anthropic does not support standard JSON schemas natively in the same structural manner as OpenAI/Gemini without using tool-use/function calling. Requires careful system instruction wrapping or tool binding to guarantee JSON formatting.
  - **Deterministic Simulation**: **Fully Compatible**.
  - **Live Connect Mode**: **Fully Compatible**.

### D. OpenRouter
* **Specific Supported Models**:
  - `google/gemini-2.5-flash` (Cost-effective bridged routing)
  - `meta-llama/llama-3.3-70b-instruct` (High-end open-source model)
  - `mistralai/mistral-large-2`
  - `deepseek/deepseek-chat` (Extremely cost-effective)
* **Limitations & Configuration Requirements**:
  - Requires `OPENROUTER_API_KEY` in `SecretStore`.
  - Endpoint target must be explicitly routed to `https://openrouter.ai/api/v1`.
  - Multi-hop routing introduces an average of 150-300ms additional latency.
* **MISSI Core Compatibility**:
  - **Structured Outputs (Schema Enforcement)**: **Variable**. Performance depends on the underlying model selected. High-end models (Llama 70B, Gemini) enforce JSON schemas perfectly, while smaller, cheaper models may output malformed JSON.
  - **Deterministic Simulation**: **Fully Compatible**.
  - **Live Connect Mode**: **Fully Compatible**.

### E. Ollama (Local)
* **Specific Supported Models**:
  - `llama3` (8B) / `llama3.1` (8B / 70B)
  - `mistral` (7B)
  - `gemma2` (9B / 27B)
* **Limitations & Configuration Requirements**:
  - No API key required (offline-first development).
  - Requires a local daemon running at `http://localhost:11434`.
  - Extremely hardware-dependent; consumer laptops will suffer high latency (low tokens per second) if running models > 8B parameter size alongside a heavy Minecraft client or Docker swarm.
* **MISSI Core Compatibility**:
  - **Structured Outputs (Schema Enforcement)**: **Medium**. Ollama supports JSON schema modes natively on newer versions, but smaller 8B/7B quantized models frequently struggle to adhere to strict schema boundaries under complex prompt constraints, occasionally outputting empty parameters or mismatched keys.
  - **Deterministic Simulation**: **Fully Compatible**.
  - **Live Connect Mode**: **Fully Compatible**.

### F. LM Studio (Local)
* **Specific Supported Models**:
  - Any model packaged in GGUF format (typically Llama, Mistral, Qwen, or Phi-3).
* **Limitations & Configuration Requirements**:
  - No API key required.
  - Requires LM Studio server running locally and bound to port `1234` (`http://localhost:1234/v1`).
  - Hardware-dependent; high CPU/GPU/VRAM overhead.
* **MISSI Core Compatibility**:
  - **Structured Outputs (Schema Enforcement)**: **Medium**. Enforced via OpenAI-compatible endpoints, but subject to the same model-size-dependent formatting constraints as Ollama.
  - **Deterministic Simulation**: **Fully Compatible**.
  - **Live Connect Mode**: **Fully Compatible**.

---

## 3. Compatibility Summary Table

Below is a compatibility matrix for core MISSI functionalities across all providers.

| Core Functionality | Gemini | OpenAI | Anthropic | OpenRouter | Ollama | LM Studio |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Deterministic Offline Grid** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Live Connect (mineflayer)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Structured Output (JSON)** | ✅ (Native) | ✅ (Native)| ⚠️ (Prompt) | ⚠️ (Model) | ⚠️ (Model) | ⚠️ (Model) |
| **Scientific Trace Logging** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Error Classification** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Offline Privacy Mode** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
