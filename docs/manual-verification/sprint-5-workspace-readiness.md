# MISSI Sprint 5 Manual Verification Checklist
## Workspace Completion & Readiness Hardening

This document provides step-by-step instructions for QA engineers and developers to manually verify the features, persistence layers, security whitelists, and readiness checks implemented in Sprint 5 of the Minecraft Scenario Simulator (MISSI).

---

### Part 1: ScenarioV2 Parser & Prompt Extraction
Verify that advanced scenario fields like `Version`, `Scenario Prompt`, `Character Prompt`, `Behavior Prompt`, and `Game Mode` are successfully parsed and preserved.

1. **Navigate to the Scenario Library**:
   - Locate the saved scenario card on the interface.
   - Click **Create Custom Scenario** (or click edit on an existing card).
2. **Input Markdown Structure**:
   - Paste the following ScenarioV2 markdown into the editor:
     ```markdown
     # Scenario: Jungle Archeology Dig
     Version: 2.3.1
     
     ## Scenario Prompt
     Locate a jungle temple, set up camp, and excavate buried treasure chests.
     
     ## World Configuration
     - Seed: 554422
     - Game Mode: survival
     - Difficulty: normal
     - Level Name: JungleDig
     
     ## Bots
     ### Bot: ArcheologistAlex
     - Role: Researcher
     - Goal: Find temple ruins and brush dirt
     - Provider: gemini
     - Model: gemini-2.5-flash
     - Character Prompt: You are Alex, an academic obsessed with history.
     - Behavior Prompt: Gently brush blocks and document findings.
     - Position: 100, 70, -250
     - Inventory: brush:1, compass:1
     ```
3. **Save and Validate**:
   - Save the scenario.
   - Check the **Setup Readiness Panel** (or active scenario details).
   - Ensure the name displayed is `Jungle Archeology Dig` and that the version `2.3.1` is correctly shown.
   - Verify that the game mode parses as `survival` and the level name is `JungleDig`.

---

### Part 2: Workspace Persistence
Verify that selected bot profiles, active providers, and tick-rates successfully persist across server restarts and page refreshes.

1. **Configure Workspace**:
   - In the **Workspace Settings** section of the Setup Readiness Panel, change the **Active LLM Provider** (e.g., switch from Google Gemini to OpenAI GPT).
   - Change the **Simulation Loop Speed** interval to `12000` ms.
   - Select multiple **Participating Bot Profiles** by toggling checkboxes.
2. **Apply & Save Config**:
   - Click **Save Workspace Config**.
   - Verify that the success banner shows "✓ Config Saved & Applied".
3. **Refresh & Reload**:
   - Refresh your web browser page completely.
   - Confirm that the Active Provider is still set to your updated selection, the Loop Speed interval is still `12000` ms, and the correct bot profiles remain selected.
4. **Backend Persistence Verification**:
   - Trigger a backend simulation start/stop or backend reload.
   - Verify that the same workspace configuration remains selected.

---

### Part 3: Provider lastTest UI & API Exposer
Verify that connectivity test results are displayed cleanly with status, date/time, and error codes when failures occur.

1. **Successful Test**:
   - Choose **Google Gemini** as your active provider. Ensure its API key is configured.
   - Click **Test Connection**.
   - Wait for the action to complete.
   - Ensure the indicator badge turns green and displays **PASSED**.
   - Confirm that the tested timestamp is shown correctly.
2. **Failed Test (Error Classification & Envelope)**:
   - Temporarily clear the API key of a provider or input an invalid dummy key.
   - Click **Test Connection**.
   - Ensure the indicator badge turns red and displays **FAILED**.
   - Verify that the specific error code is shown (e.g. `invalid_key` or `missing_key`) alongside a descriptive message.
   - Confirm that the general Workspace Report banner at the top of the panel flags this failure as a blocker with instructions.

---

### Part 4: Strict Server Command Whitelist
Verify that arbitrary command execution strictly filters out destructive or system-stopping inputs.

1. **Attempt Blocked/Destructive Commands**:
   - Ensure `ALLOW_SERVER_COMMAND=true` is set.
   - Open your browser Developer Console and issue a POST request to `/api/server/command` or use the command execution console in the UI.
   - Try running `/stop`, `/ban Steve`, `/op Alex`, `/kick Bob`, or `/fill 0 0 0 1000 1000 1000 stone`.
   - Verify that the API rejects the request with an HTTP 400 status and a message stating that the command is blocked for security and server stability.
2. **Attempt Blocked Gamemode Changes**:
   - Try running `/gamemode creative` or `/gamemode c`.
   - Verify that the API rejects the command.
3. **Attempt Approved/Safe Commands**:
   - Try running `/say Hello bots!` or `/time query daytime`.
   - Verify that the command succeeds with a `{"success": true}` response.
