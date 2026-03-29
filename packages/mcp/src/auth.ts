/**
 * Handles API Key → JWT authentication with automatic refresh.
 */
export class AuthManager {
  private token: string | null = null;
  private expiresAt: number = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - 60_000) {
      return this.token;
    }
    if (this.token) {
      return this.refresh();
    }
    return this.login();
  }

  private async login(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey }),
    });
    if (!res.ok) {
      throw new Error(`Login failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { token: string; expires_at: string };
    this.setToken(data.token, data.expires_at);
    return this.token!;
  }

  private async refresh(): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token }),
      });
      if (!res.ok) {
        return this.login();
      }
      const data = (await res.json()) as { token: string; expires_at: string };
      this.setToken(data.token, data.expires_at);
      return this.token!;
    } catch {
      return this.login();
    }
  }

  private setToken(token: string, expiresAt: string) {
    this.token = token;
    this.expiresAt = new Date(expiresAt).getTime();
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const refreshIn = this.expiresAt - Date.now() - 5 * 60_000;
    if (refreshIn > 0) {
      this.refreshTimer = setTimeout(() => void this.refresh(), refreshIn);
    }
  }

  destroy() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }
}
