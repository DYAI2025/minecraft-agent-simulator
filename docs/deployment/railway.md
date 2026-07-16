# Railway Deployment

MISSI requires specific configurations to run correctly on Railway:

- **Repository Root**: Must be deployed from the repository root.
- **Build and Start Commands**: 
  - Build: `npm run build`
  - Start: `npm run start`
- **PORT Behavior**: Uses the Railway-injected `PORT` environment variable. Defaults to `3000` locally.
- **Health Endpoint**: A `/health` endpoint is exposed for Railway's healthcheck functionality.
- **Required Environment Variables**: No special environment variables are required to start, but `MISSI_STORAGE_ROOT` is recommended if using a persistent volume.
- **Volume Mount**: A persistent volume should be mounted and configured via `MISSI_STORAGE_ROOT` (e.g., `/data`).
- **Storage Root**: `MISSI_STORAGE_ROOT` defines the root directory for all persistent state.
- **Java Runtime**: The container must have a Java runtime matching the Minecraft server JAR you wish to run.
- **Minecraft TCP Proxy**: The Railway HTTP domain is exclusively for web traffic. Minecraft clients require a TCP proxy.
- **HTTP vs TCP Endpoints**: The web UI and API use the HTTP endpoint. Minecraft gameplay uses the separate TCP endpoint.
- **Honest Limitations**: The application relies heavily on local filesystem access. Without a persistent volume, all state is lost on restart.

