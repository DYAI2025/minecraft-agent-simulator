# Minecraft Server Lifecycle Service

This document describes the design, setup, configuration, and execution mechanics of the **Minecraft Server Lifecycle Service** in MISSI.

---

## 1. Lifecycle States

The lifecycle of the server process (`MinecraftServerService`) moves through a set of explicit state machine conditions:

```
  ┌───────────┐         (Preflight Fail)
  │  stopped  │───────────────────────────┐
  └─────┬─────┘                           │
        │                                 ▼
        │ (startServer)             ┌───────────┐
        ▼                           │  blocked  │
  ┌───────────┐                     └───────────┘
  │validating │
  └─────┬─────┘
        │ (Preflight Pass)
        ▼
  ┌───────────┐                     ┌───────────┐
  │ starting  │                     │  failed   │
  └─────┬─────┘                     └─────▲─────┘
        │                                 │
        │ (Process Listening)             │ (Process Crashed)
        ▼                                 │
  ┌───────────┐ ──────────────────────────┘
  │  running  │ ──────────────────────────┐
  └─────┬─────┘                           │
        │                                 ▼
        │ (stopServer)              ┌───────────┐
        ▼                           │ stopping  │
  ┌───────────┐                     └─────┬─────┘
  │ stopped   │ ◄─────────────────────────┘
  └───────────┘     (Clean exit or SIGKILL)
```

---

## 2. Server Properties Compilation & Pre-execution

Before launching the Minecraft Java executable, the service automatically translates runtime options and configuration objects into standard physical files:

### server.properties File
Constructed dynamically based on active configuration settings (`levelName`, `seed`, `gameMode`, `difficulty`, `port`, `serverName`):

```properties
server-port=25565
level-name=world
level-seed=123456789
gamemode=survival
difficulty=normal
motd=MISSI-Server
online-mode=false
allow-flight=true
spawn-protection=0
pvp=false
```

### eula.txt File
Ensures compliance with Mojang's licensing terms by writing the configuration-driven agreement file:
```
eula=true
```

---

## 3. Preflight Diagnostics

The `MinecraftServerPreflightService` executes rigorous environment checks before starting:
1. **Java Runtime Probe**: Executes `java -version` to verify compatibility.
2. **EULA Consent validation**: Checks if `eula.txt` contains `eula=true` or matches client confirmations.
3. **Server JAR Presence**: Confirms `server.jar` is downloaded and available in the working directory.
4. **Network Port Reservation**: Assures the configured port (e.g., `25565`) is unoccupied by another daemon.

If preflight diagnostics fail and sandbox emulation is not toggled, the state transition halts and enters **blocked** status.

---

## 4. Startup & Clean Shutdown Protocols

### Programmatic Process Spawning
The service uses Node's `child_process.spawn` to instantiate the Minecraft Java runtime with customized heap allocation configurations:

```bash
java -Xmx1024M -Xms1024M -jar server.jar nogui
```

`stdout` is actively parsed line-by-line. The transition from `starting` to `running` occurs immediately upon detecting the ready notification string:
```
Done (s) ... For help, type "help"
```

### Clean Shutdown Timeout
To prevent world corruption, clean shutdowns write standard save-commands into the child process's standard input (`stdin`):
```bash
stop
```
A safety timeout watchdog (default `15000ms`) is scheduled. If the process does not terminate cleanly within this duration, the system issues a forceful `SIGKILL` to reclaim container resources.

---

## 5. Deployment & Execution Commands

### Prerequisites
Make sure a Java Runtime Environment (JRE) matching the desired Minecraft server version is installed on the host or container.

### Core Lifecycle Commands (via REST API)

#### Get Server Status
- **Method**: `GET`
- **Path**: `/api/server/status`
- **Response**:
```json
{
  "status": "running",
  "runtimeMode": "live",
  "config": {
    "serverName": "MISSI-Server",
    "levelName": "world",
    "seed": "123456789",
    "gameMode": "survival",
    "difficulty": "normal",
    "port": 25565
  },
  "logsCount": 184
}
```

#### Start Server
- **Method**: `POST`
- **Path**: `/api/server/start`
- **Body**:
```json
{
  "acceptEula": true,
  "useEmulator": false
}
```

#### Stop Server
- **Method**: `POST`
- **Path**: `/api/server/stop`

#### Execute RCON / Console Command
- **Method**: `POST`
- **Path**: `/api/server/command`
- **Body**:
```json
{
  "command": "say Hello bots, welcome to MISSI!"
}
```
