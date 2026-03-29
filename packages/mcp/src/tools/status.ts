import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ClientManager } from '../client.js';

export function registerStatusTools(server: McpServer, clients: ClientManager) {
  server.tool(
    'passim_status',
    'Get system status of a Passim node: CPU, memory, disk, network, container summary, public IP, and geo location.',
    {
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
    },
    async ({ instance }) => {
      const client = clients.get(instance);
      const status = await client.api.getStatus();
      const { node, system, containers } = status;

      const lines = [
        `Node: ${node.name} (${node.version})`,
        `Uptime: ${Math.floor(node.uptime / 3600)}h ${Math.floor((node.uptime % 3600) / 60)}m`,
        node.public_ip ? `Public IP: ${node.public_ip}${node.country ? ` (${node.country})` : ''}` : null,
        '',
        `CPU: ${system.cpu.usage_percent.toFixed(1)}% (${system.cpu.cores} cores, ${system.cpu.model})`,
        `Memory: ${fmt(system.memory.used_bytes)} / ${fmt(system.memory.total_bytes)} (${system.memory.usage_percent.toFixed(1)}%)`,
        `Disk: ${fmt(system.disk.used_bytes)} / ${fmt(system.disk.total_bytes)} (${system.disk.usage_percent.toFixed(1)}%)`,
        `Network: ↓${fmtRate(system.network.rx_rate)} ↑${fmtRate(system.network.tx_rate)}`,
        `Load: ${system.load.load1} / ${system.load.load5} / ${system.load.load15}`,
        `OS: ${system.os} (${system.kernel})`,
        '',
        `Containers: ${containers.running} running, ${containers.stopped} stopped, ${containers.total} total`,
      ].filter((l) => l !== null);

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'passim_version',
    'Get version info and check for available updates.',
    {
      instance: z.string().optional().describe('Passim instance name. Omit for default.'),
      check_update: z.boolean().optional().describe('Also check for available updates. Default: true.'),
    },
    async ({ instance, check_update }) => {
      const client = clients.get(instance);
      const version = await client.api.getVersion();

      const lines = [
        `Version: ${version.version}`,
        `Commit: ${version.commit}`,
        `Build Time: ${version.build_time}`,
      ];

      if (check_update !== false) {
        try {
          const update = await client.api.checkUpdate({ force: true });
          if (update.available) {
            lines.push('', `Update available: ${update.latest}`);
            if (update.changelog) lines.push(`Changelog: ${update.changelog}`);
          } else {
            lines.push('', 'Already up to date.');
          }
        } catch {
          lines.push('', 'Could not check for updates.');
        }
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );
}

function fmt(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

function fmtRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1e9) return `${(bytesPerSec / 1e9).toFixed(1)} GB/s`;
  if (bytesPerSec >= 1e6) return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1e3) return `${(bytesPerSec / 1e3).toFixed(1)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}
