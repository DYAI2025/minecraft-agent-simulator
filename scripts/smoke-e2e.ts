import { spawn, execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import net from 'net';
import mineflayer from 'mineflayer';
import { LLMProviderService } from '../src/services/LLMProviderService.js';
import { LLMProviderType } from '../src/types/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  console.log('=== MISSI END-TO-END SMOKE TEST ===');

  // 1. Prerequisites Check
  const acceptEula = process.env.MISSI_ACCEPT_MINECRAFT_EULA === 'true';
  const apiKey = process.env.GEMINI_API_KEY;
  
  let javaAvailable = false;
  try {
    execSync('java -version', { stdio: 'ignore' });
    javaAvailable = true;
  } catch {
    javaAvailable = false;
  }

  const serverDir = path.resolve(process.cwd(), 'minecraft-server');
  const jarPath = path.join(serverDir, 'server.jar');
  let jarAvailable = false;
  try {
    await fs.access(jarPath);
    jarAvailable = true;
  } catch {}

  const missingPrereqs: string[] = [];
  if (!acceptEula) missingPrereqs.push('MISSI_ACCEPT_MINECRAFT_EULA=true');
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') missingPrereqs.push('GEMINI_API_KEY="your-key"');
  if (!javaAvailable) missingPrereqs.push('Java Runtime Environment (Java 17+)');
  if (!jarAvailable) missingPrereqs.push('minecraft-server/server.jar');

  if (missingPrereqs.length > 0) {
    console.error('\n[BLOCKED] END-TO-END TEST CANNOT BE RUN IN THIS ENVIRONMENT');
    console.error('The following prerequisites are missing:');
    missingPrereqs.forEach(p => console.error(`  - ${p}`));
    console.error('\nTo run end-to-end smoke test locally:');
    console.error('  1. Install Java 17+ and make sure "java" is in your PATH.');
    console.error('  2. Download server.jar into minecraft-server/ folder:');
    console.error('     wget https://piston-data.mojang.com/v1/objects/84194a5c4d6da61663047990dec7177b3c2e4070/server.jar -O minecraft-server/server.jar');
    console.error('  3. Run command:');
    console.error('     MISSI_ACCEPT_MINECRAFT_EULA=true GEMINI_API_KEY="your-key" tsx scripts/smoke-e2e.ts');
    process.exit(1);
  }

  console.log('All prerequisites met! Initializing end-to-end flow...');

  const e2ePort = 25585;
  const props = [
    `server-port=${e2ePort}`,
    `level-name=e2e_smoke_world`,
    `online-mode=false`,
    `spawn-protection=0`,
    `pvp=false`
  ];
  await fs.writeFile(path.join(serverDir, 'server.properties'), props.join('\n'));
  await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');

  console.log(`Spawning real Minecraft Java server on port ${e2ePort}...`);
  const serverProcess = spawn('java', ['-Xmx1024M', '-Xms1024M', '-jar', 'server.jar', 'nogui'], {
    cwd: serverDir,
  });

  let serverStarted = false;
  let botConnected = false;
  let actionCompleted = false;

  const cleanup = () => {
    console.log('Cleaning up processes...');
    serverProcess.kill('SIGKILL');
  };

  const failTimeout = setTimeout(() => {
    console.error('\n[FAILED] End-to-end smoke test timed out.');
    cleanup();
    process.exit(1);
  }, 90000);

  serverProcess.stdout?.on('data', async (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      console.log(`[MC Server] ${trimmed}`);

      if (trimmed.includes('Done (') && !serverStarted) {
        serverStarted = true;
        console.log('\n--- SERVER READY. SPAWNING MINEFLAYER BOT ---');
        
        try {
          const bot = mineflayer.createBot({
            host: '127.0.0.1',
            port: e2ePort,
            username: 'MissiE2EBot',
            version: '1.20.1',
          });

          bot.once('spawn', async () => {
            botConnected = true;
            console.log(`\n[Bot] MissiE2EBot spawned! Position: ${bot.entity.position}`);
            console.log('[Bot] Requesting decision from Google Gemini LLM API...');

            try {
              const systemInstruction = 
                "You are an active Minecraft automation agent. You must respond with valid JSON containing action parameters. " +
                "Response schema: {\"rationale\": \"string\", \"action\": \"chat\" | \"idle\", \"parameters\": {\"message\": \"string\"}}";
              const prompt = "The scenario is: Smoke test verify connection. Send a friendly greeting message to verified channel.";

              const responseSchema = {
                type: 'OBJECT',
                properties: {
                  rationale: { type: 'STRING' },
                  action: { type: 'STRING', enum: ['chat', 'idle'] },
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      message: { type: 'STRING' }
                    },
                    required: ['message']
                  }
                },
                required: ['rationale', 'action', 'parameters']
              };

              const decision = await LLMProviderService.getBotDecision(
                {
                  id: 'gemini',
                  type: LLMProviderType.GEMINI,
                  name: 'Google Gemini',
                  apiKey: apiKey!,
                  defaultModel: 'gemini-2.5-flash',
                },
                systemInstruction,
                prompt,
                responseSchema
              );

              console.log('\n--- LLM API RESPONSE ACQUIRED ---');
              console.log(JSON.stringify(decision, null, 2));

              if (decision.action === 'chat' && decision.parameters?.message) {
                console.log(`[Bot Action] Executing: chat -> "${decision.parameters.message}"`);
                bot.chat(decision.parameters.message);
                actionCompleted = true;
              } else {
                console.log('[Bot Action] Executing idle or unrecognized action.');
                actionCompleted = true;
              }

              // Let the action take effect in world logs
              setTimeout(async () => {
                console.log('Shutting down server cleanly...');
                clearTimeout(failTimeout);
                bot.quit();
                serverProcess.stdin?.write('stop\n');
              }, 3000);

            } catch (err: any) {
              console.error('[FAILED] End-to-end LLM/Bot cycle failed:', err.message || err);
              cleanup();
              process.exit(1);
            }
          });

          bot.on('error', (err) => {
            console.error('[Bot Error]', err);
            cleanup();
            process.exit(1);
          });

        } catch (botErr: any) {
          console.error('[FAILED] Failed to initialize mineflayer bot:', botErr.message || botErr);
          cleanup();
          process.exit(1);
        }
      }
    }
  });

  serverProcess.on('close', async (code) => {
    console.log(`Minecraft server process closed with code ${code}`);
    if (serverStarted && botConnected && actionCompleted) {
      console.log('\n=== END-TO-END SMOKE TEST SUCCESSFUL! ===');
      process.exit(0);
    } else {
      console.error('\n=== END-TO-END SMOKE TEST FAILED ===');
      process.exit(1);
    }
  });
}

run().catch((err) => {
  console.error('Fatal end-to-end smoke test crash:', err);
  process.exit(1);
});
