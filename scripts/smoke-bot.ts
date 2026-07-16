import net from 'net';
import mineflayer from 'mineflayer';

async function run() {
  console.log('=== MISSI SMOKE TEST: MINEFLAYER BOT ===');

  const host = '127.0.0.1';
  const port = 25565;

  console.log(`Checking if Minecraft server is running on ${host}:${port}...`);

  const serverOnline = await new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });

  if (!serverOnline) {
    console.error('\n[BLOCKED] LOCAL MINECRAFT SERVER OFFLINE');
    console.error(`No running Minecraft server was detected on ${host}:${port}.`);
    console.error('To run the bot smoke test:');
    console.error('  1. Accept EULA and start a server (e.g. via scripts/smoke-server.ts or "npm run dev")');
    console.error(`  2. Ensure it binds to port ${port} and has "online-mode=false" set in server.properties.`);
    console.error('  3. Run: tsx scripts/smoke-bot.ts');
    process.exit(1);
  }

  console.log('Server is online! Instantiating Mineflayer bot...');

  const bot = mineflayer.createBot({
    host: host,
    port: port,
    username: 'MissiSmokeBot',
    version: '1.20.1', // Or match server's version
  });

  bot.once('spawn', () => {
    console.log(`\n=== MINEFLAYER BOT SMOKE TEST SUCCESSFUL ===`);
    console.log(`Bot "${bot.username}" successfully spawned into the server world!`);
    console.log(`Current position: ${bot.entity.position}`);
    console.log('Gracefully disconnecting bot...');
    bot.quit();
    process.exit(0);
  });

  bot.on('error', (err) => {
    console.error('\n[FAILED] Mineflayer encountered an error connecting:', err);
    process.exit(1);
  });

  bot.on('kicked', (reason) => {
    console.warn('\n[FAILED] Mineflayer bot was kicked from server:', reason);
    process.exit(1);
  });

  // Safety timeout of 15 seconds
  setTimeout(() => {
    console.error('\n[FAILED] Mineflayer spawn timed out (15s).');
    try {
      bot.quit();
    } catch {}
    process.exit(1);
  }, 15000);
}

run().catch((err) => {
  console.error('Fatal smoke bot script crash:', err);
  process.exit(1);
});
