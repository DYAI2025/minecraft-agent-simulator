# Scenario: Wood Harvesting Challenge
A challenge where bots coordinate to gather wood and craft basic tools.

## Objectives
- Gather 16 Oak Logs
- Craft 16 Oak Wood Planks
- Craft 1 Crafting Table
- Assemble and place the crafting table

## Bots
### Bot: LumberjackBob
- Role: Primary wood harvester
- Goal: Move to oak logs, harvest them, and tell Sally when finished
- Provider: gemini
- Model: gemini-3.5-flash
- Position: 4, 64, 4
- Inventory: wooden_axe: 1

### Bot: CrafterSally
- Role: Tool and table craftsman
- Goal: Ask Bob for wood, receive planks, and place a crafting table
- Provider: gemini
- Model: gemini-3.5-flash
- Position: -3, 64, -2
- Inventory: sticks: 4
