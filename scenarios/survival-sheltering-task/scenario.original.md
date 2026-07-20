# Scenario: Survival Sheltering Task
Agents build a secure parameter out of stone and wood to prepare for nightfall.

## Objectives
- Mine 8 Cobblestone blocks
- Collect 8 Oak Wood logs
- Construct a 4x4 stone boundary
- Place a torch or marker block

## Bots
### Bot: BuilderBen
- Role: Structural architect
- Goal: Receives stone, builds a flat 4x4 foundation wall, and keeps guard
- Provider: gemini
- Model: gemini-3.5-flash
- Position: 8, 64, -6
- Inventory: stone_pickaxe: 1

### Bot: GathererGaby
- Role: Resource miner
- Goal: Locates stone hills, mines cobblestone, and delivers to BuilderBen
- Provider: gemini
- Model: gemini-3.5-flash
- Position: -8, 64, 7
- Inventory: iron_pickaxe: 1, coal: 2
