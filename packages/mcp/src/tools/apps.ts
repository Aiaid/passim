import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ClientManager } from '../client.js';

export function registerAppTools(server: McpServer, clients: ClientManager) {
  server.tool(
    'passim_templates_list',
    'List available application templates that can be deployed (e.g. WireGuard, Nextcloud).',
    {
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ instance }) => {
      const client = clients.get(instance);
      const templates = await client.api.getTemplates();

      if (templates.length === 0) {
        return { content: [{ type: 'text', text: 'No templates available.' }] };
      }

      const lines = templates.map((t) => {
        const desc = t.description?.['en-US'] || t.description?.['zh-CN'] || '';
        const settings = t.settings?.map((s) => s.key).join(', ') || 'none';
        return `${t.name} [${t.category}] — ${desc}\n  Settings: ${settings}`;
      });

      return { content: [{ type: 'text', text: lines.join('\n\n') }] };
    },
  );

  server.tool(
    'passim_template_detail',
    'Get detailed info about a template including all configurable settings, their defaults, and descriptions.',
    {
      template: z.string().describe('Template name (e.g. "wireguard").'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ template, instance }) => {
      const client = clients.get(instance);
      const detail = await client.api.getTemplate(template);

      const lines = [
        `Template: ${detail.name} [${detail.category}]`,
        `Version: ${detail.version}`,
        `Description: ${detail.description?.['en-US'] || detail.description?.['zh-CN'] || 'N/A'}`,
      ];

      if (detail.settings?.length) {
        lines.push('', 'Settings:');
        for (const s of detail.settings) {
          const desc = s.label?.['en-US'] || s.label?.['zh-CN'] || s.key;
          const def = s.default;
          lines.push(`  ${s.key} (${s.type}): ${desc}${def !== undefined ? ` [default: ${def}]` : ''}`);
          if (s.options?.length) {
            lines.push(`    options: ${s.options.map((o) => `${o.value}`).join(', ')}`);
          }
        }
      }

      if (detail.guide?.setup) {
        const setup = detail.guide.setup['en-US'] || detail.guide.setup['zh-CN'];
        if (setup) lines.push('', `Setup guide: ${setup}`);
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'passim_apps_list',
    'List all deployed applications on a Passim node.',
    {
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
      node_id: z.string().optional().describe('Remote node ID. Omit for local node.'),
    },
    async ({ instance, node_id }) => {
      const client = clients.get(instance);
      const apps = node_id
        ? await client.api.getNodeApps(node_id)
        : await client.api.getApps();

      if (apps.length === 0) {
        return { content: [{ type: 'text', text: 'No apps deployed.' }] };
      }

      const lines = apps.map((a) => {
        return `[${a.status}] ${a.template} (${a.id}) — deployed ${a.deployed_at}`;
      });

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'passim_app_detail',
    'Get detailed info about a deployed application.',
    {
      app_id: z.string().describe('Application ID.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ app_id, instance }) => {
      const client = clients.get(instance);
      const app = await client.api.getApp(app_id);
      return { content: [{ type: 'text', text: JSON.stringify(app, null, 2) }] };
    },
  );

  server.tool(
    'passim_app_deploy',
    'Deploy a new application from a template. Use passim_templates_list to see available templates and passim_template_detail to check required settings.',
    {
      template: z.string().describe('Template name (e.g. "wireguard").'),
      settings: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Template-specific settings. Use passim_template_detail to see options.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
      node_id: z.string().optional().describe('Deploy on a remote node. Omit for local.'),
    },
    async ({ template, settings, instance, node_id }) => {
      const client = clients.get(instance);

      if (node_id) {
        const result = await client.api.deployNodeApp(node_id, { template, settings: settings ?? {} });
        return { content: [{ type: 'text', text: `App deployed on node ${node_id}: ${JSON.stringify(result)}` }] };
      }

      const result = await client.api.deployApp(template, settings ?? {});
      const lines = [`App deployment started: ${result.id}`];
      if (result.task_id) {
        lines.push(`Task ID: ${result.task_id} — use passim_task_detail to track progress.`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'passim_app_update',
    'Update settings of a deployed application.',
    {
      app_id: z.string().describe('Application ID.'),
      settings: z.record(z.string(), z.unknown()).describe('New settings to apply.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ app_id, settings, instance }) => {
      const client = clients.get(instance);
      const result = await client.api.updateApp(app_id, settings);
      const lines = [`App ${app_id} updated. Status: ${result.status}`];
      if (result.task_id) {
        lines.push(`Task ID: ${result.task_id} — use passim_task_detail to track progress.`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'passim_app_delete',
    'Delete a deployed application. This is destructive — the app and its data will be removed.',
    {
      app_id: z.string().describe('Application ID.'),
      confirm: z.boolean().describe('Must be true to confirm deletion.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ app_id, confirm, instance }) => {
      if (!confirm) {
        return {
          content: [{ type: 'text', text: 'Aborted: set confirm=true to delete the app.' }],
          isError: true,
        };
      }
      const client = clients.get(instance);
      await client.api.deleteApp(app_id);
      return { content: [{ type: 'text', text: `App ${app_id} deleted.` }] };
    },
  );

  server.tool(
    'passim_app_client_config',
    'Get client connection configuration for an app (e.g. WireGuard config file, credentials, connection URL).',
    {
      app_id: z.string().describe('Application ID.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
      node_id: z.string().optional().describe('Remote node ID if app is on a remote node.'),
    },
    async ({ app_id, instance, node_id }) => {
      const client = clients.get(instance);
      const config = node_id
        ? await client.api.getNodeAppClientConfig(node_id, app_id)
        : await client.api.getAppClientConfig(app_id);
      return { content: [{ type: 'text', text: JSON.stringify(config, null, 2) }] };
    },
  );

  server.tool(
    'passim_app_share',
    'Create or revoke a share link for an application.',
    {
      app_id: z.string().describe('Application ID.'),
      action: z.enum(['create', 'revoke']).describe('Create or revoke the share link.'),
      user_index: z.number().optional().describe('User index for per-user sharing. Default: 0.'),
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ app_id, action, user_index, instance }) => {
      const client = clients.get(instance);
      if (action === 'create') {
        const result = await client.api.createShare(app_id, user_index);
        return { content: [{ type: 'text', text: `Share URL: ${result.url}\nToken: ${result.token}` }] };
      }
      await client.api.revokeShare(app_id, user_index);
      return { content: [{ type: 'text', text: `Share for app ${app_id} revoked.` }] };
    },
  );
}
