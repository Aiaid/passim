# Mobile Deploy Target Selection & Batch Deployment

## Overview

Extends the mobile app deploy wizard to support selecting deployment targets (local node + remote nodes) and deploying the same app to multiple nodes simultaneously.

## Design

### Deploy Wizard Steps

| Step | Title | Description |
|------|-------|-------------|
| 1 | Choose Template | Unchanged from current |
| 2 | Configure | Unchanged from current |
| 3 | Select Targets | New - only shown when remote nodes exist |
| progress | Deploy Progress | New - per-node deployment status |

When only one node exists (no remotes), step 3 is skipped and the deploy button in step 2 triggers a single deploy (original behavior preserved).

### Target Selection (Step 3)

- Lists all nodes from the node store
- Each node shows: name, host, connection status (via SSE), LOCAL badge for the first node
- Checkbox-style selection
- Default: active/local node pre-selected
- "Select All" / "Deselect All" toggle
- Offline nodes are shown but not selectable (dimmed)
- Deploy button shows count when multiple targets selected

### Batch Deployment (Progress Screen)

Each target is deployed to in parallel:
- **Local node**: Direct `POST /api/apps` via the active node's API
- **Remote nodes**: Via Hub using `POST /api/nodes/{id}/apps` endpoint

Per-node status tracking:
- pending -> deploying -> success | failed
- Progress bar with overall completion
- Color coding: green = success, red = failed, purple = in-progress
- Haptic feedback on completion

### Error Handling

- Partial failures are handled gracefully
- Each node's deployment is independent
- Failed deployments can be retried via "Retry Failed" button
- Success message when all nodes succeed
- Warning message listing failures with retry option

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /api/apps` | Deploy to local node |
| `POST /api/nodes/{id}/apps` | Deploy to remote node via Hub |
| `POST /api/batch/deploy` | Batch deploy (available but not used; parallel individual deploys preferred for better UX) |

## i18n Keys Added

Both `en-US.json` and `zh-CN.json` under the `mobile.*` namespace:
- `select_targets`, `deploy_targets`, `deploy_to_nodes`
- `local_server`, `select_all`, `deselect_all`
- `no_targets_selected`, `deploying_to_nodes`
- `deploy_progress`, `deploy_pending`, `deploy_in_progress`
- `deploy_succeeded`, `deploy_node_failed`
- `overall_progress`, `retry_failed`
- `all_succeeded`, `some_failed`
- `done`, `view_apps`, `node_offline`
