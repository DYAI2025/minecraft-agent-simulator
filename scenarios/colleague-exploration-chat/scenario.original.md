# Scenario: Colleague Exploration
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
