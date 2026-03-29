import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ClientManager, type PassimInstance } from './client.js';
import { registerStatusTools } from './tools/status.js';
import { registerContainerTools } from './tools/containers.js';
import { registerAppTools } from './tools/apps.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerNodeTools } from './tools/nodes.js';
import { registerSystemTools } from './tools/system.js';

export function createPassimMcpServer(instances: PassimInstance[]) {
  const clients = new ClientManager();
  for (const inst of instances) {
    clients.add(inst);
  }

  const server = new McpServer({
    name: 'passim',
    version: '0.1.0',
  });

  registerStatusTools(server, clients);
  registerContainerTools(server, clients);
  registerAppTools(server, clients);
  registerTaskTools(server, clients);
  registerNodeTools(server, clients);
  registerSystemTools(server, clients);

  return { server, clients };
}
