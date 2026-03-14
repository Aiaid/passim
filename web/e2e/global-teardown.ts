import fs from 'fs';

async function globalTeardown() {
  try {
    const info = JSON.parse(
      fs.readFileSync('/tmp/passim-e2e-info.json', 'utf8')
    );
    if (info.pid) {
      process.kill(info.pid, 'SIGTERM');
    }
  } catch {
    // Server already stopped
  }
  try {
    fs.unlinkSync('/tmp/passim-e2e-info.json');
  } catch {
    // Cleanup best effort
  }
  try {
    fs.unlinkSync('/tmp/passim-e2e');
  } catch {
    // Cleanup best effort
  }
}

export default globalTeardown;
