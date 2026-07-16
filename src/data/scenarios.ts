export const DEFAULT_SCENARIOS = [
  {
    title: 'Wood Harvesting Challenge',
    description: 'Bots coordinate to harvest Oak logs and assemble a crafting table on the server.',
    markdown: `# Scenario: Wood Harvesting Challenge
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
`,
  },
  {
    title: 'Survival Sheltering Task',
    description: 'Agents coordinate to gather cobblestone, secure wood, and build a protective grid boundary.',
    markdown: `# Scenario: Survival Sheltering Task
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
`,
  },
  {
    title: 'Colleague Exploration & Chat',
    description: 'An interactive conversation and spatial walk across the server between agents.',
    markdown: `# Scenario: Colleague Exploration
Agents map out the server map coordinates together and exchange research ideas.

## Objectives
- Traverse from corner to corner
- Chat with team members to discuss world seeds
- Share coordinates of interesting formations

## Bots
### Bot: ExplorerEli
- Role: Field cartographer
- Goal: Move around corners, search for lakes, and talk with Ava
- Provider: gemini
- Model: gemini-3.5-flash
- Position: -10, 64, -10
- Inventory: map: 1

### Bot: SurveyorAva
- Role: Landscape analyst
- Goal: Stand near center, verify grid levels, and log findings in chat
- Provider: gemini
- Model: gemini-3.5-flash
- Position: 2, 64, 2
- Inventory: compass: 1
`,
  }
];

export const COMPLEX_TEMPLATES = [
  {
    title: 'PvP Arena',
    description: 'Two team leaders and combat bots coordinate resources, equip gear, and simulate a sparring tournament.',
    markdown: `# Scenario: PvP Arena Tournament
A highly intense mock combat tournament in a structured arena coordinate zone.

## Objectives
- Construct a 6x6 combat ring arena
- Gather 2 Iron Swords
- Equip 2 Iron Chestplates
- Initiate mock combat sequence and log state changes

## Bots
### Bot: GladiatorJax
- Role: Red Team champion
- Goal: Move to the combat ring, equip iron chestplate and iron sword, and prepare for mock battle
- Provider: gemini
- Model: gemini-3.5-flash
- Position: 5, 64, 5
- Inventory: iron_sword: 1, iron_chestplate: 1, cooked_beef: 4

### Bot: GladiatorValk
- Role: Blue Team champion
- Goal: Meet Jax in the arena ring, verify equipment, and practice defensive parries
- Provider: gemini
- Model: gemini-3.5-flash
- Position: -5, 64, -5
- Inventory: iron_sword: 1, iron_chestplate: 1, golden_apple: 1
`,
  },
  {
    title: 'Large Scale Construction',
    description: 'A multi-agent grand project involving stone hauling, foundation layering, and battlements construction.',
    markdown: `# Scenario: Large Scale Castle Construction
An ambitious cooperative build project involving heavy logistics and architectural layering.

## Objectives
- Mine 64 Cobblestone blocks
- Lay down a 8x8 foundation grid
- Build a 3-block high defensive wall structure
- Install 4 wooden doors and 2 ladders

## Bots
### Bot: ForemanFred
- Role: Chief builder and architect
- Goal: Direct workers, inspect cobblestone foundation layers, and construct the castle walls
- Provider: gemini
- Model: gemini-3.5-flash
- Position: 10, 64, 10
- Inventory: stone_pickaxe: 1, ladder: 4, oak_door: 4

### Bot: HaulerHarry
- Role: Logistics supplier
- Goal: Mines stone from quarry sites, moves wood, and delivers construction materials to ForemanFred
- Provider: gemini
- Model: gemini-3.5-flash
- Position: -10, 64, -10
- Inventory: iron_pickaxe: 1, cobblestone: 32, oak_log: 16
`,
  }
];
