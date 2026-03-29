import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ClientManager } from '../client.js';

export function registerContainerTools(server: McpServer, clients: ClientManager) {
  server.tool(
    'passim_containers_list',
    'List all Docker containers on a Passim node with their ID, name, image, state, and status.',
    {
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
      node_id: z.string().optional().describe('Remote node ID. Omit for local node.'),
    },
    async ({ instance, node_id }) => {
      const client = clients.get(instance);
      const containers = node_id
        ? await client.api.getNodeContainers(node_id)
        : await client.api.getContainers();

      if (containers.length === 0) {
        return { content: [{ type: 'text', text: 'No containers found.' }] };
      }

      const lines = containers.map((c) => {
        const name = c.Names?.[0]?.replace(/^\//, '') ?? 'unnamed';
        return `[${c.State}] ${name} (${c.Id.slice(0, 12)}) — ${c.Image} — ${c.Status}`;
      });

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'passim_container_action',
    'Start, stop, or restart a Docker container.',
    {
      container_id: z.string().describe('Container ID (short or full) or name.'),
      action: z.enum(['start', 'stop', 'restart']).describe('Action to perform.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
      node_id: z.string().optional().describe('Remote node ID. Omit for local node.'),
    },
    async ({ container_id, action, instance, node_id }) => {
      const client = clients.get(instance);

      if (node_id) {
        const fn = {
          start: client.api.nodeStartContainer,
          stop: client.api.nodeStopContainer,
          restart: client.api.nodeRestartContainer,
        }[action];
        await fn(node_id, container_id);
      } else {
        const fn = {
          start: client.api.startContainer,
          stop: client.api.stopContainer,
          restart: client.api.restartContainer,
        }[action];
        await fn(container_id);
      }

      return { content: [{ type: 'text', text: `Container ${container_id} ${action}ed successfully.` }] };
    },
  );

  server.tool(
    'passim_container_logs',
    'Get recent logs from a Docker container.',
    {
      container_id: z.string().describe('Container ID (short or full) or name.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
      node_id: z.string().optional().describe('Remote node ID. Omit for local node.'),
    },
    async ({ container_id, instance, node_id }) => {
      const client = clients.get(instance);
      const result = node_id
        ? await client.api.getNodeContainerLogs(node_id, container_id)
        : await client.api.getContainerLogs(container_id);

      return { content: [{ type: 'text', text: result.logs || '(no logs)' }] };
    },
  );

  server.tool(
    'passim_container_remove',
    'Remove a Docker container. This is a destructive action — the container and its data will be lost.',
    {
      container_id: z.string().describe('Container ID (short or full) or name.'),
      confirm: z.boolean().describe('Must be true to confirm deletion.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
      node_id: z.string().optional().describe('Remote node ID. Omit for local node.'),
    },
    async ({ container_id, confirm, instance, node_id }) => {
      if (!confirm) {
        return {
          content: [{ type: 'text', text: 'Aborted: set confirm=true to remove the container.' }],
          isError: true,
        };
      }

      const client = clients.get(instance);
      if (node_id) {
        await client.api.nodeRemoveContainer(node_id, container_id);
      } else {
        await client.api.removeContainer(container_id);
      }

      return { content: [{ type: 'text', text: `Container ${container_id} removed.` }] };
    },
  );
}
