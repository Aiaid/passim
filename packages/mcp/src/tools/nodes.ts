import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ClientManager } from '../client.js';

export function registerNodeTools(server: McpServer, clients: ClientManager) {
  server.tool(
    'passim_nodes_list',
    'List all remote nodes managed by this Passim instance.',
    {
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ instance }) => {
      const client = clients.get(instance);
      const nodes = await client.api.getNodes();

      if (nodes.length === 0) {
        return { content: [{ type: 'text', text: 'No remote nodes configured.' }] };
      }

      const lines = nodes.map((n) => {
        return `${n.name || 'unnamed'} (${n.id}) — ${n.address} — ${n.status}${n.country ? ` (${n.country})` : ''}`;
      });

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'passim_node_add',
    'Add a remote Passim node to manage.',
    {
      address: z.string().describe('Node URL (e.g. "https://tokyo.example.com:8443").'),
      api_key: z.string().describe('API key of the remote node (psk_...).'),
      name: z.string().optional().describe('Friendly name for the node.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ address, api_key, name, instance }) => {
      const client = clients.get(instance);
      const node = await client.api.addNode({ address, api_key, name });
      return { content: [{ type: 'text', text: `Node added: ${node.name || node.id} (${node.address})` }] };
    },
  );

  server.tool(
    'passim_node_remove',
    'Remove a remote node. This only removes it from management — the node itself keeps running.',
    {
      node_id: z.string().describe('Node ID.'),
      confirm: z.boolean().describe('Must be true to confirm removal.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ node_id, confirm, instance }) => {
      if (!confirm) {
        return {
          content: [{ type: 'text', text: 'Aborted: set confirm=true to remove the node.' }],
          isError: true,
        };
      }
      const client = clients.get(instance);
      await client.api.removeNode(node_id);
      return { content: [{ type: 'text', text: `Node ${node_id} removed from management.` }] };
    },
  );

  server.tool(
    'passim_node_status',
    'Get system status of a remote node (CPU, memory, disk, containers).',
    {
      node_id: z.string().describe('Node ID.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ node_id, instance }) => {
      const client = clients.get(instance);
      const status = await client.api.getNodeStatus(node_id);
      const { node, system, containers } = status;

      const lines = [
        `Node: ${node.name} (${node.version})`,
        node.public_ip ? `Public IP: ${node.public_ip}${node.country ? ` (${node.country})` : ''}` : null,
        `CPU: ${system.cpu.usage_percent.toFixed(1)}% (${system.cpu.cores} cores)`,
        `Memory: ${(system.memory.used_bytes / 1e9).toFixed(1)}/${(system.memory.total_bytes / 1e9).toFixed(1)} GB (${system.memory.usage_percent.toFixed(1)}%)`,
        `Disk: ${(system.disk.used_bytes / 1e9).toFixed(1)}/${(system.disk.total_bytes / 1e9).toFixed(1)} GB (${system.disk.usage_percent.toFixed(1)}%)`,
        `Containers: ${containers.running} running, ${containers.stopped} stopped`,
      ].filter((l) => l !== null);

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'passim_batch_deploy',
    'Deploy an application template to multiple nodes at once.',
    {
      template: z.string().describe('Template name.'),
      settings: z.record(z.string(), z.unknown()).optional().describe('Template settings.'),
      targets: z.array(z.string()).describe('List of target IDs. Use "local" for the local node, or node IDs for remote nodes.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ template, settings, targets, instance }) => {
      const client = clients.get(instance);
      const result = await client.api.batchDeploy({
        template,
        settings: settings ?? {},
        targets,
      });
      return { content: [{ type: 'text', text: `Batch deployment started. Task ID: ${result.task_id}` }] };
    },
  );
}
