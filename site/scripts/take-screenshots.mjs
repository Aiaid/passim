/**
 * Passim screenshot generator
 *
 * Starts the web/ Vite dev server, injects mock data via Playwright route
 * interception, then captures screenshots of key pages for the landing site.
 *
 * Usage:
 *   cd site && pnpm screenshots
 *
 * Prerequisites:
 *   pnpm install && npx playwright install chromium
 */

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = resolve(__dirname, '../../web')
const OUT_DIR = resolve(__dirname, '../public/screenshots')
const PORT = 5199
const BASE = `http://localhost:${PORT}`

mkdirSync(OUT_DIR, { recursive: true })

// ── Mock Data ──────────────────────────────────────────────

const mockStatus = {
  node: {
    id: 'node-sf-01',
    name: 'San Francisco',
    version: 'v1.2.0',
    uptime: 1209600,
    public_ip: '198.51.100.42',
    public_ip6: '',
    country: 'US',
    latitude: 37.7749,
    longitude: -122.4194,
  },
  system: {
    cpu: { usage_percent: 42.3, cores: 4, model: 'AMD EPYC 7763' },
    memory: {
      total_bytes: 8589934592,
      used_bytes: 5234491392,
      usage_percent: 60.9,
    },
    disk: {
      total_bytes: 107374182400,
      used_bytes: 29527900160,
      usage_percent: 27.5,
    },
    network: { rx_bytes: 1073741824, tx_bytes: 536870912 },
    load: { load1: 1.2, load5: 0.8, load15: 0.6 },
    os: 'Ubuntu 24.04 LTS',
    kernel: '6.8.0-45-generic',
  },
  containers: { running: 3, stopped: 1, total: 4 },
}

const mockMetrics = {
  cpu_percent: 42.3,
  mem_used: 5234491392,
  mem_total: 8589934592,
  disk_used: 29527900160,
  disk_total: 107374182400,
  net_bytes_sent: 536870912,
  net_bytes_recv: 1073741824,
}

const mockContainers = [
  {
    Id: 'a1b2c3d4e5f6',
    Names: ['/wireguard'],
    Image: 'ghcr.io/linuxserver/wireguard:latest',
    State: 'running',
    Status: 'Up 14 days',
    Created: 1709251200,
  },
  {
    Id: 'b2c3d4e5f6a1',
    Names: ['/webdav'],
    Image: 'ghcr.io/hacdias/webdav:latest',
    State: 'running',
    Status: 'Up 14 days',
    Created: 1709251200,
  },
  {
    Id: 'c3d4e5f6a1b2',
    Names: ['/passim'],
    Image: 'ghcr.io/aiaid/passim:v1.2.0',
    State: 'running',
    Status: 'Up 14 days',
    Created: 1709251200,
  },
  {
    Id: 'd4e5f6a1b2c3',
    Names: ['/v2ray'],
    Image: 'v2fly/v2fly-core:latest',
    State: 'exited',
    Status: 'Exited (0) 2 days ago',
    Created: 1708992000,
  },
]

const mockApps = [
  {
    id: 'app-wg-001',
    template: 'wireguard',
    settings: { peers: 3, port: 51820, dns: '1.1.1.1' },
    status: 'running',
    container_id: 'a1b2c3d4e5f6',
    deployed_at: '2025-03-07T10:00:00Z',
    updated_at: '2025-03-07T10:00:00Z',
  },
  {
    id: 'app-webdav-001',
    template: 'webdav',
    settings: { port: 8080, username: 'admin' },
    status: 'running',
    container_id: 'b2c3d4e5f6a1',
    deployed_at: '2025-03-07T10:30:00Z',
    updated_at: '2025-03-07T10:30:00Z',
  },
]

const templateSettings = {
  wireguard: [
    {
      key: 'peers',
      type: 'number',
      label: { en: 'Number of Peers', zh: '客户端数量' },
      default: 1,
      min: 1,
      max: 254,
    },
    {
      key: 'port',
      type: 'number',
      label: { en: 'Listen Port', zh: '监听端口' },
      default: 51820,
    },
    {
      key: 'dns',
      type: 'text',
      label: { en: 'DNS Server', zh: 'DNS 服务器' },
      default: '1.1.1.1',
    },
  ],
  l2tp: [
    {
      key: 'psk',
      type: 'text',
      label: { en: 'Pre-shared Key', zh: '预共享密钥' },
      default: '',
    },
    {
      key: 'username',
      type: 'text',
      label: { en: 'Username', zh: '用户名' },
      default: 'vpnuser',
    },
  ],
  hysteria: [
    {
      key: 'port',
      type: 'number',
      label: { en: 'Port', zh: '端口' },
      default: 443,
    },
  ],
  v2ray: [
    {
      key: 'port',
      type: 'number',
      label: { en: 'Port', zh: '端口' },
      default: 10086,
    },
    {
      key: 'protocol',
      type: 'select',
      label: { en: 'Protocol', zh: '协议' },
      default: 'vmess',
      options: [
        { value: 'vmess', label: { en: 'VMess', zh: 'VMess' } },
        { value: 'vless', label: { en: 'VLESS', zh: 'VLESS' } },
      ],
    },
  ],
  webdav: [
    {
      key: 'port',
      type: 'number',
      label: { en: 'Port', zh: '端口' },
      default: 8080,
    },
    {
      key: 'username',
      type: 'text',
      label: { en: 'Username', zh: '用户名' },
      default: 'admin',
    },
  ],
  samba: [
    {
      key: 'username',
      type: 'text',
      label: { en: 'Username', zh: '用户名' },
      default: 'samba',
    },
  ],
  rdesktop: [
    {
      key: 'port',
      type: 'number',
      label: { en: 'Port', zh: '端口' },
      default: 3389,
    },
  ],
}

const mockTemplates = [
  {
    name: 'wireguard',
    category: 'vpn',
    icon: 'shield',
    description: {
      en: 'High-performance peer-to-peer VPN using modern cryptography',
      zh: '使用现代加密技术的高性能点对点 VPN',
    },
    settings: templateSettings.wireguard,
  },
  {
    name: 'l2tp',
    category: 'vpn',
    icon: 'lock',
    description: {
      en: 'Classic VPN protocol compatible with all devices',
      zh: '兼容所有设备的经典 VPN 协议',
    },
    settings: templateSettings.l2tp,
  },
  {
    name: 'hysteria',
    category: 'proxy',
    icon: 'zap',
    description: {
      en: 'High-speed UDP-based proxy protocol',
      zh: '基于 UDP 的高速代理协议',
    },
    settings: templateSettings.hysteria,
  },
  {
    name: 'v2ray',
    category: 'proxy',
    icon: 'globe',
    description: {
      en: 'Versatile multi-protocol proxy platform',
      zh: '多协议代理平台',
    },
    settings: templateSettings.v2ray,
  },
  {
    name: 'webdav',
    category: 'storage',
    icon: 'folder',
    description: {
      en: 'Access and manage files via HTTP/WebDAV',
      zh: '通过 HTTP/WebDAV 访问和管理文件',
    },
    settings: templateSettings.webdav,
  },
  {
    name: 'samba',
    category: 'storage',
    icon: 'hard-drive',
    description: {
      en: 'Windows-compatible network file sharing',
      zh: 'Windows 兼容的网络文件共享',
    },
    settings: templateSettings.samba,
  },
  {
    name: 'rdesktop',
    category: 'remote-desktop',
    icon: 'monitor',
    description: {
      en: 'Remote desktop access in the browser',
      zh: '浏览器内远程桌面访问',
    },
    settings: templateSettings.rdesktop,
  },
]

const mockNodes = [
  {
    id: 'node-tokyo-01',
    name: 'Tokyo',
    address: 'https://203.0.113.10:8443',
    status: 'connected',
    version: 'v1.2.0',
    country: 'JP',
    latitude: 35.6762,
    longitude: 139.6503,
    last_seen: '2026-03-21T12:00:00Z',
    created_at: '2026-03-01T00:00:00Z',
    metrics: {
      cpu_percent: 23.5,
      memory_percent: 45.2,
      disk_percent: 31.0,
      containers: { running: 2, total: 2 },
    },
  },
  {
    id: 'node-fra-01',
    name: 'Frankfurt',
    address: 'https://198.51.100.20:8443',
    status: 'connected',
    version: 'v1.2.0',
    country: 'DE',
    latitude: 50.1109,
    longitude: 8.6821,
    last_seen: '2026-03-21T12:00:00Z',
    created_at: '2026-02-15T00:00:00Z',
    metrics: {
      cpu_percent: 15.8,
      memory_percent: 38.7,
      disk_percent: 22.4,
      containers: { running: 1, total: 1 },
    },
  },
  {
    id: 'node-sgp-01',
    name: 'Singapore',
    address: 'https://203.0.113.30:8443',
    status: 'connected',
    version: 'v1.2.0',
    country: 'SG',
    latitude: 1.3521,
    longitude: 103.8198,
    last_seen: '2026-03-21T12:00:00Z',
    created_at: '2026-02-20T00:00:00Z',
    metrics: {
      cpu_percent: 35.1,
      memory_percent: 52.8,
      disk_percent: 40.2,
      containers: { running: 3, total: 3 },
    },
  },
]

const mockSettings = { node_name: 'San Francisco' }

const mockSSL = {
  mode: 'letsencrypt',
  valid: true,
  domain: 'sf.passim.io',
  expires_at: '2026-06-19T00:00:00Z',
  issuer: "Let's Encrypt",
}

const mockVersion = {
  version: 'v1.2.0',
  commit: 'abc1234',
  build_time: '2026-03-15T10:00:00Z',
}

const mockVersionCheck = {
  current: 'v1.2.0',
  latest: 'v1.2.0',
  available: false,
}

const mockPasskeys = [
  {
    id: 'pk-001',
    name: 'MacBook Pro Touch ID',
    created_at: '2026-02-01T00:00:00Z',
    last_used_at: '2026-03-21T08:00:00Z',
  },
]

const mockIperfStatus = { status: 'stopped' }

// ── SSE Helper ─────────────────────────────────────────────

function buildSSE(events) {
  return events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n`)
    .join('\n')
}

// ── Route Setup ────────────────────────────────────────────

async function setupMocks(page) {
  // Catch-all FIRST (lowest priority — Playwright uses LIFO)
  await page.route('**/api/**', (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    })
  })

  // Auth: always return valid
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'mock-screenshot-token',
        expires_at: '2099-12-31T23:59:59Z',
      }),
    }),
  )

  await page.route('**/api/auth/passkeys/exists', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ exists: true }),
    }),
  )

  await page.route('**/api/auth/passkeys', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockPasskeys),
    }),
  )

  // Status
  await page.route('**/api/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockStatus),
    }),
  )

  // Containers
  await page.route('**/api/containers', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockContainers),
      })
    }
    return route.continue()
  })

  // Apps
  await page.route('**/api/apps', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockApps),
      })
    }
    return route.continue()
  })

  // Templates
  await page.route('**/api/templates', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTemplates),
    }),
  )

  // Nodes
  await page.route('**/api/nodes', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockNodes),
      })
    }
    return route.continue()
  })

  // Settings
  await page.route('**/api/settings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSettings),
    }),
  )

  // SSL
  await page.route('**/api/ssl/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSSL),
    }),
  )

  // Version
  await page.route('**/api/version/check**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockVersionCheck),
    }),
  )

  await page.route('**/api/version', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockVersion),
    }),
  )

  // Speedtest
  await page.route('**/api/speedtest/iperf/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockIperfStatus),
    }),
  )

  // SSE stream — send initial events with long retry to prevent reconnect spam
  await page.route('**/api/stream**', (route) => {
    const events = [
      ['status', mockStatus],
      ['metrics', mockMetrics],
      ['containers', mockContainers],
      ['apps', mockApps],
      ['nodes', mockNodes],
    ]
    const sseBody =
      'retry: 999999\n\n' +
      events
        .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n`)
        .join('\n')

    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: sseBody,
    })
  })

}

// ── Main ───────────────────────────────────────────────────

async function main() {
  console.log('Starting web/ dev server on port', PORT, '...')

  const vite = spawn('pnpm', ['dev', '--port', String(PORT)], {
    cwd: WEB_DIR,
    stdio: 'pipe',
    env: { ...process.env, BROWSER: 'none' },
  })

  // Wait for Vite to be ready
  await new Promise((res, rej) => {
    const timeout = setTimeout(
      () => rej(new Error('Vite startup timeout')),
      30000,
    )
    const onData = (chunk) => {
      const text = chunk.toString()
      if (text.includes('ready') || text.includes('Local:')) {
        clearTimeout(timeout)
        res()
      }
    }
    vite.stdout.on('data', onData)
    vite.stderr.on('data', onData)
    vite.on('error', rej)
  })

  console.log('Vite dev server ready.')

  // Use headed mode with GPU for WebGL (Three.js globe)
  const browser = await chromium.launch({
    headless: false,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  })

  const page = await context.newPage()

  // Inject auth token before any page loads
  await page.addInitScript(() => {
    // Auth store (Zustand persist)
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: {
          token: 'mock-screenshot-token',
          expiresAt: '2099-12-31T23:59:59Z',
          isAuthenticated: true,
        },
        version: 0,
      }),
    )
    // Also set the raw token used by API client
    localStorage.setItem('auth-token', 'mock-screenshot-token')
    // Preferences store (Zustand persist) — dark mode, Chinese
    localStorage.setItem(
      'preferences-storage',
      JSON.stringify({
        state: {
          theme: 'dark',
          language: 'zh-CN',
          sidebarCollapsed: false,
        },
        version: 0,
      }),
    )
  })

  // Only log critical errors (skip SSE reconnect noise)
  page.on('pageerror', (err) => {
    if (!err.message.includes('send was called'))
      console.log(`  [ERROR] ${err.message}`)
  })

  await setupMocks(page)

  // First navigate to set localStorage, then reload
  await page.goto(BASE, { waitUntil: 'commit' })
  await page.evaluate(() => {
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: {
          token: 'mock-screenshot-token',
          expiresAt: '2099-12-31T23:59:59Z',
          isAuthenticated: true,
        },
        version: 0,
      }),
    )
    localStorage.setItem('auth-token', 'mock-screenshot-token')
    localStorage.setItem(
      'preferences-storage',
      JSON.stringify({
        state: {
          theme: 'dark',
          language: 'zh-CN',
          sidebarCollapsed: false,
        },
        version: 0,
      }),
    )
  })

  const pages = [
    { name: 'dashboard', path: '/', waitFor: 8000 },
    { name: 'marketplace', path: '/apps/new', waitFor: 2000 },
    { name: 'containers', path: '/containers', waitFor: 2000 },
    { name: 'nodes', path: '/nodes', waitFor: 3000 },
    { name: 'settings', path: '/settings', waitFor: 2000 },
  ]

  const locales = [
    { code: 'zh-CN', dir: 'zh' },
    { code: 'en-US', dir: 'en' },
  ]

  for (const locale of locales) {
    console.log(`\n── ${locale.dir.toUpperCase()} ──`)
    const localeDir = `${OUT_DIR}/${locale.dir}`
    mkdirSync(localeDir, { recursive: true })

    // Switch language
    await page.evaluate((lang) => {
      localStorage.setItem(
        'preferences-storage',
        JSON.stringify({
          state: {
            theme: 'dark',
            language: lang,
            sidebarCollapsed: false,
          },
          version: 0,
        }),
      )
      localStorage.setItem('language', lang)
    }, locale.code)

    for (const pg of pages) {
      console.log(`Capturing ${pg.name}...`)
      await page.goto(`${BASE}${pg.path}`, { waitUntil: 'load' })
      await page.waitForTimeout(pg.waitFor)
      await page.screenshot({
        path: `${localeDir}/${pg.name}.png`,
        fullPage: false,
      })
      console.log(`  → saved ${locale.dir}/${pg.name}.png`)
    }
  }

  await browser.close()
  vite.kill('SIGTERM')

  console.log('\nDone! Screenshots saved to site/public/screenshots/')
}

main().catch((err) => {
  console.error('Screenshot generation failed:', err)
  process.exit(1)
})
