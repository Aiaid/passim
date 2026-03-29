import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ClientManager } from '../client.js';

export function registerTaskTools(server: McpServer, clients: ClientManager) {
  server.tool(
    'passim_tasks_list',
    'List async tasks (deployments, updates, etc.) and their status.',
    {
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ instance }) => {
      const client = clients.get(instance);
      const tasks = await client.api.getTasks();

      if (tasks.length === 0) {
        return { content: [{ type: 'text', text: 'No tasks.' }] };
      }

      const lines = tasks.map((t) => {
        return `[${t.status}] ${t.id} — ${t.type ?? 'unknown'} — ${t.created_at}`;
      });

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'passim_task_detail',
    'Get detailed status and progress of an async task.',
    {
      task_id: z.string().describe('Task ID.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ task_id, instance }) => {
      const client = clients.get(instance);
      const task = await client.api.getTask(task_id);
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );
}
