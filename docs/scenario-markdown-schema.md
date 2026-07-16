# Scenario Markdown Schema and Validation Rules

This document specifies the exact Markdown format and the schema validation rules used by **MISSI** to parse and validate custom simulation scenarios.

---

## 1. Markdown Specification

Custom scenarios can be uploaded as `.md` files or pasted into the Scenario Creation interface. Below is the reference structure for a fully defined Scenario.

```markdown
# Scenario: Forest Colony Survival
This is a rich description describing the goals, settings, and conditions of the scenario.

- Version: 2.1.0

## Scenario Prompt
This is the system-wide orchestrator prompt. It establishes high-level rules, environmental challenges, and contextual boundaries that bots will retrieve during their reasoning iterations.

## World Configuration
- Seed: 987654321
- Game Mode: survival
- Difficulty: normal
- Level Name: missi_forest_world
- Port: 25565

## Objectives
- Establish an automated oak logging station.
- Keep all bots safe with average health above 15.
- Craft at least one crafting table.

## Bots

### Bot: LumberjackBob
- Role: Primary Woodcutter
- Goal: Harvest oak logs and supply wood planks to building chests.
- Provider: gemini
- Model: gemini-3.5-flash
- Position: -5, 64, 4
- Health: 20
- Food: 20
- Inventory: stone_axe:1, oak_log:4
- Character Prompt: You are LumberjackBob. Speak in simple, gruff sentences. Focus entirely on woodcutting tasks.
- Behavior Prompt: Search for nearby oak_log blocks. Move to them and execute the harvest action. If inventory is full, look for a chest to drop them off.

### Bot: GathererGaby
- Role: Material Scavenger
- Goal: Harvest stone, food, and miscellaneous items around the campsite.
- Provider: gemini
- Model: gemini-3.5-flash
- Position: 3, 64, -2
- Health: 18
- Food: 15
- Inventory: bread:5
- Character Prompt: You are GathererGaby, a friendly and talkative helper who always coordinates with Bob.
- Behavior Prompt: Explore around coordinates (0, 64, 0). Gather any apple or wheat plants. Share your coordinates if you find anything of interest.

## Research
- Question: How does specialized labor role assignment affect camp resource accumulation rate?
- Hypothesis: Differentiating woodcutting and scavenging roles will result in faster tool creation.
- Measurement Focus: oak_log, cobblestone, bread
- Observation Protocol: Track inventory accumulation rates every 10 steps.
- Expected Emergence Patterns: Cooperative sharing, pathing efficiency improvement over time
```

---

## 2. Parsing Architecture

The `ScenarioService.parseMarkdown(markdown: string): Scenario` module handles conversion:
1. **Section Splitters**: Identifies key headers (`# Scenario:`, `## Scenario Prompt`, `## World Configuration`, `## Objectives`, `## Bots`, `## Research`).
2. **Key-Value Matchers**: Extracts properties like `Seed`, `Game Mode`, `Role`, `Goal`, `Position`, and `Inventory` using precise regex rules.
3. **Array Converters**: Extracts bullet lists under `## Objectives` and comma-separated lists like `Measurement Focus` or `Expected Emergence Patterns`.
4. **Item Maps**: Parses standard item syntax (`item:count`) in the bot inventory string.

---

## 3. Validation Rules

Validation is executed programmatically by `ScenarioValidatorService.ts`. Any validation failure throws a clean, informative error message detailing the exact field and reason for failure.

### Required Global Fields
- **Title**: Must be present (`# Scenario: <Title>`) and cannot be blank.
- **Description**: Must have a basic text description.
- **Objectives**: Must contain at least one objective bullet item.
- **Bots**: Must define at least one bot (`### Bot: <Name>`).

### Bot Field Validation
Each bot must contain the following fields:
- **Name**: Non-empty text.
- **Role**: Non-empty text.
- **Goal**: Non-empty text.
- **Provider ID**: Standard identifier (e.g., `gemini`, `openai`, `anthropic`, `openrouter`, `ollama`, `lmstudio`).
- **Model**: Specific engine version.
- **Position**: Must resolve to 3 numerical coordinates `x, y, z`.
- **Health**: Range between `0` and `20`.
- **Food**: Range between `0` and `20`.

### World Configuration Rules
- **Game Mode**: If defined, must be one of `survival`, `creative`, `adventure`, or `spectator`.
- **Difficulty**: If defined, must be one of `peaceful`, `easy`, `normal`, or `hard`.
- **Port**: Must be a valid network integer between `1` and `65535`.
