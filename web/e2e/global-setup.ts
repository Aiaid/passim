import { execSync, spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

let serverProcess: ChildProcess | null = null;

async function globalSetup() {
  const passimDir = path.resolve(__dirname, '../../passim');

  // Build the e2e server
  execSync('go build -o /tmp/passim-e2e ./cmd/e2eserver/', {
    cwd: passimDir,
    stdio: 'pipe',
  });

  // Start it
  serverProcess = spawn('/tmp/passim-e2e', [], {
    env: { ...process.env, PORT: '9876' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Read the first line of stdout to get port and api_key
  const serverInfo = await new Promise<{ port: string; api_key: string }>(
    (resolve, reject) => {
      let data = '';
      const timeout = setTimeout(
        () => reject(new Error('Server start timeout')),
        15000
      );
      serverProcess!.stdout!.on('data', (chunk) => {
        data += chunk.toString();
        const newlineIdx = data.indexOf('\n');
        if (newlineIdx !== -1) {
          clearTimeout(timeout);
          const line = data.substring(0, newlineIdx).trim();
          try {
            resolve(JSON.parse(line));
          } catch (e) {
            reject(new Error(`Failed to parse server output: ${line}`));
          }
        }
      });
      serverProcess!.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    }
  );

  // Store for tests to use
  process.env.E2E_API_KEY = serverInfo.api_key;
  process.env.E2E_API_PORT = String(serverInfo.port);
  process.env.E2E_API_URL = `http://localhost:${serverInfo.port}`;

  // Write to a temp file for globalTeardown and tests
  fs.writeFileSync(
    '/tmp/passim-e2e-info.json',
    JSON.stringify({
      pid: serverProcess.pid,
      ...serverInfo,
    })
  );
}

export default globalSetup;
