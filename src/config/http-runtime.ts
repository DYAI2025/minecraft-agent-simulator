export interface HttpRuntimeConfig {
  port: number;
  host: string;
}

export function getHttpRuntimeConfig(): HttpRuntimeConfig {
  const portString = process.env.PORT;
  let port = 3000;

  if (portString) {
    const parsedPort = parseInt(portString, 10);
    if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
      port = parsedPort;
    } else {
      console.warn(`Invalid PORT environment variable value: ${portString}. Falling back to default.`);
    }
  }

  const host = process.env.HOST || '0.0.0.0';

  return { port, host };
}
