import { createApi } from '@passim/shared/api';
import type { PassimApi } from '@passim/shared/api';
import { AuthManager } from './auth.js';

export interface PassimInstance {
  name: string;
  url: string;
  apiKey: string;
}

export interface PassimClient {
  name: string;
  api: PassimApi;
  auth: AuthManager;
}

export function createPassimClient(instance: PassimInstance): PassimClient {
  const auth = new AuthManager(instance.url, instance.apiKey);

  const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
    const token = await auth.getToken();
    const res = await fetch(`${instance.url}/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Passim API error ${res.status}: ${text}`);
    }
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  };

  return {
    name: instance.name,
    api: createApi(request),
    auth,
  };
}

export class ClientManager {
  private clients: Map<string, PassimClient> = new Map();
  private defaultName: string | null = null;

  add(instance: PassimInstance) {
    const client = createPassimClient(instance);
    this.clients.set(instance.name, client);
    if (!this.defaultName) this.defaultName = instance.name;
  }

  get(name?: string): PassimClient {
    const key = name ?? this.defaultName;
    if (!key) throw new Error('No Passim instance configured');
    const client = this.clients.get(key);
    if (!client) throw new Error(`Passim instance "${key}" not found`);
    return client;
  }

  list(): string[] {
    return [...this.clients.keys()];
  }

  destroy() {
    for (const client of this.clients.values()) {
      client.auth.destroy();
    }
  }
}
