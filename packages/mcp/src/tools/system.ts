import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ClientManager } from '../client.js';

export function registerSystemTools(server: McpServer, clients: ClientManager) {
  server.tool(
    'passim_update',
    'Update Passim to a specific version. This restarts the server. Use passim_version with check_update=true first to see available versions.',
    {
      version: z.string().describe('Target version (e.g. "v1.2.0").'),
      confirm: z.boolean().describe('Must be true to confirm the update.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ version, confirm, instance }) => {
      if (!confirm) {
        return {
          content: [{ type: 'text', text: 'Aborted: set confirm=true to proceed with the update.' }],
          isError: true,
        };
      }
      const client = clients.get(instance);
      const result = await client.api.performUpdate(version);
      return { content: [{ type: 'text', text: `Update initiated: ${result.message}` }] };
    },
  );

  server.tool(
    'passim_ssl_status',
    'Get SSL/TLS certificate status.',
    {
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ instance }) => {
      const client = clients.get(instance);
      const status = await client.api.getSSLStatus();
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    },
  );

  server.tool(
    'passim_settings',
    'Get or update node settings (e.g. node name).',
    {
      node_name: z.string().optional().describe('Set a new node name. Omit to just read current settings.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ node_name, instance }) => {
      const client = clients.get(instance);

      if (node_name) {
        await client.api.updateSettings({ node_name });
        return { content: [{ type: 'text', text: `Node name updated to "${node_name}".` }] };
      }

      const settings = await client.api.getSettings();
      return { content: [{ type: 'text', text: `Node name: ${settings.node_name}` }] };
    },
  );
}
