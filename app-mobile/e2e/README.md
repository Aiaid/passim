# E2E Tests (Maestro)

Maestro flow-based E2E tests for the Passim mobile app, covering Epic 10 user stories.

## Setup

1. Install Maestro: `curl -fsSL "https://get.maestro.mobile.dev" | bash`
2. Start the app: `cd app-mobile && pnpm start`
3. Run on iOS Simulator or Android Emulator

## Run all tests

```bash
maestro test e2e/
```

## Run a single test

```bash
maestro test e2e/01-welcome.yaml
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_HOST` | `localhost:8443` | Passim node address |
| `TEST_API_KEY` | *(none)* | API key for the test node |

Export them before running:

```bash
export TEST_HOST=192.168.1.100:8443
export TEST_API_KEY=your-api-key-here
maestro test e2e/
```

## Test inventory

| File | User story | Description |
|------|-----------|-------------|
| `01-welcome.yaml` | US-10.1 | Welcome screen on first launch |
| `02-add-node-manual.yaml` | US-10.1 | Add node via manual entry |
| `03-dashboard-overview.yaml` | US-10.2 | Dashboard displays metrics |
| `04-navigate-tabs.yaml` | US-10.2/10.3 | Tab navigation works |
| `05-apps-list.yaml` | US-10.3 | Apps list screen |
| `06-deploy-flow.yaml` | US-10.3 | Deploy app from marketplace |
| `07-app-detail.yaml` | US-10.3 | App detail and actions |
| `08-nodes-screen.yaml` | US-10.1/10.2 | Nodes screen |
| `09-settings.yaml` | US-10.4 | Settings screen verification |
| `10-settings-interactions.yaml` | US-10.4 | Settings interactions |
| `helpers/setup-node.yaml` | — | Reusable subflow: add a test node |
