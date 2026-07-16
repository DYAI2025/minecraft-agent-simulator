import { spawn, execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

async function run() {
  console.log('=== MISSI SMOKE TEST: MINECRAFT JAVA SERVER ===');
  
  // 1. Check EULA
  const acceptEula = process.env.MISSI_ACCEPT_MINECRAFT_EULA === 'true';
  if (!acceptEula) {
    console.error('\n[BLOCKED] EULA NOT ACCEPTED');
    console.error('You must set MISSI_ACCEPT_MINECRAFT_EULA=true to test real Minecraft server startup.');
    console.error('To run locally:');
    console.error('  MISSI_ACCEPT_MINECRAFT_EULA=true tsx scripts/smoke-server.ts');
    process.exit(1);
  }

  // 2. Check Java
  let javaAvailable = false;
  try {
    execSync('java -version', { stdio: 'ignore' });
    javaAvailable = true;
  } catch {
    javaAvailable = false;
  }

  if (!javaAvailable) {
    console.error('\n[BLOCKED] RUNTIME ENVIRONMENT LIMITATION');
    console.error('Java binary "java" not found in the current environment.');
    console.error('Minecraft server requires Java 17+ installed on the system.');
    console.error('Please run this smoke test locally on your machine where Java is installed.');
    process.exit(1);
  }

  // 3. Check server.jar
  const serverDir = path.resolve(process.cwd(), 'minecraft-server');
  const jarPath = path.join(serverDir, 'server.jar');
  try {
    await fs.access(jarPath);
  } catch {
    console.error('\n[BLOCKED] SERVER.JAR MISSING');
    console.error(`Minecraft server executable jar was not found at: ${jarPath}`);
    console.error('To download a clean server.jar file, execute:');
    console.error('  mkdir -p minecraft-server');
    console.error('  wget https://piston-data.mojang.com/v1/objects/84194a5c4d6da61663047990dec7177b3c2e4070/server.jar -O minecraft-server/server.jar');
    console.error('Once downloaded, retry this script.');
    process.exit(1);
  }

  console.log('Real Minecraft Java server files detected. Spawning process...');
  
  // Prepare a temporary server.properties for clean port binding (avoiding standard port conflicts)
  const tempPort = 25575;
  const props = [
    `server-port=${tempPort}`,
    `level-name=smoke_world`,
    `online-mode=false`,
    `spawn-protection=0`,
    `pvp=false`
  ];
  await fs.writeFile(path.join(serverDir, 'server.properties'), props.join('\n'));
  await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');

  const serverProcess = spawn('java', ['-Xmx1024M', '-Xms1024M', '-jar', 'server.jar', 'nogui'], {
    cwd: serverDir,
  });

  let startedSuccess = false;
  const timeout = setTimeout(() => {
    console.error('\n[FAILED] Minecraft server startup timed out (60s).');
    serverProcess.kill('SIGKILL');
    process.exit(1);
  }, 60000);

  serverProcess.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        console.log(`[MC Server] ${line.trim()}`);
        if (line.includes('Done (')) {
          console.log('\n=== REAL MC SERVER STARTED SUCCESSFULLY ===');
          startedSuccess = true;
          clearTimeout(timeout);
          
          console.log('Shutting down server cleanly...');
          serverProcess.stdin?.write('stop\n');
        }
      }
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[MC Server STDERR] ${data.toString().trim()}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Minecraft server process exited with code ${code}`);
    if (startedSuccess && code === 0) {
      console.log('=== SMOKE SERVER TEST SUCCESSFUL ===');
      process.exit(0);
    } else {
      console.error('=== SMOKE SERVER TEST FAILED OR INTERRUPTED ===');
      process.exit(1);
    }
  });
}

run().catch((err) => {
  console.error('Fatal smoke server script crash:', err);
  process.exit(1);
});
