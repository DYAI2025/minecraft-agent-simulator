import http from 'http';
import { spawn } from 'child_process';

async function verify() {
  console.log('--- Verifying Railway Deployment Configuration ---');
  
  const testPort = 39721;
  console.log(`Starting server on test port ${testPort}...`);

  const serverProcess = spawn('npm', ['start'], {
    env: { ...process.env, PORT: testPort.toString(), HOST: '0.0.0.0' },
    stdio: 'pipe'
  });

  let serverStarted = false;

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes(`http://0.0.0.0:${testPort}`)) {
      serverStarted = true;
    }
  });

  // Give it a moment to boot
  await new Promise(resolve => setTimeout(resolve, 3000));

  if (!serverStarted) {
    console.error('[FAIL] Server did not listen on injected PORT');
    serverProcess.kill();
    process.exit(1);
  }

  try {
    const response = await fetch(`http://127.0.0.1:${testPort}/health`);
    if (response.status !== 200) {
      throw new Error(`Healthcheck returned HTTP ${response.status}`);
    }
    const body = await response.json() as any;
    if (body.status !== 'healthy') {
      throw new Error('Healthcheck status is not healthy');
    }
    console.log('[PASS] Healthcheck endpoint verified');
  } catch (error) {
    console.error('[FAIL] Healthcheck verification failed', error);
    serverProcess.kill();
    process.exit(1);
  }

  serverProcess.kill();
  console.log('[PASS] Railway verification complete');
}

verify().catch(console.error);
