import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPassimMcpServer } from '../server.js';
import type { PassimInstance } from '../client.js';

function loadConfig(): PassimInstance[] {
  // Multi-instance: PASSIM_INSTANCES='[{"name":"home","url":"...","apiKey":"psk_..."}]'
  const instancesJson = process.env.PASSIM_INSTANCES;
  if (instancesJson) {
    try {
      const parsed = JSON.parse(instancesJson) as Array<{ name: string; url: string; apiKey: string }>;
      return parsed.map((p) => ({ name: p.name, url: p.url, apiKey: p.apiKey }));
    } catch (e) {
      console.error('Failed to parse PASSIM_INSTANCES:', e);
      process.exit(1);
    }
  }

  // Single instance: PASSIM_URL + PASSIM_API_KEY
  const url = process.env.PASSIM_URL;
  const apiKey = process.env.PASSIM_API_KEY;

  if (!url || !apiKey) {
    console.error(
      'Missing configuration. Set either:\n' +
        '  PASSIM_URL and PASSIM_API_KEY (single instance), or\n' +
        '  PASSIM_INSTANCES (JSON array for multi-instance)\n',
    );
    process.exit(1);
  }

  return [{ name: process.env.PASSIM_NAME || 'default', url, apiKey }];
}

async function main() {
  const instances = loadConfig();
  const { server, clients } = createPassimMcpServer(instances);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`Passim MCP server started with ${instances.length} instance(s): ${instances.map((i) => i.name).join(', ')}`);

  process.on('SIGINT', () => {
    clients.destroy();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
