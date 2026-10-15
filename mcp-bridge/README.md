# DomA MCP bridge (multi-agent)

## Architecture

```
Codex / Cursor / Claude / OpenClaw  ──stdio──►  doma_mcp_stdio.py  (many)
                                              │ HTTP :3846
                                              ▼
                                    doma_bridge_daemon.py  (one)
                                              │ WS :3847
                                              ▼
                                         DomA extension
```

## Install (end users)

```bash
curl -fsSL https://res.stayfork.app/d/install-doma-mcp.sh | bash
```

Installs into `~/.doma/mcp/` and prints MCP JSON to paste into Cursor / other agents.

On **Windows**, run the same command in Git Bash. The installer looks for `python3`, `python`, or `py -3` (Windows Python often does not provide `python3`). Restart Git Bash after installing Python so PATH is picked up.

Upload these four files to `https://res.stayfork.app/d/`:

- `install-doma-mcp.sh`
- `doma_mcp_stdio.py`
- `doma_bridge_daemon.py`
- `bridge_auth.py`

The stdio client and daemon share a per-user token in `~/.doma/mcp/bridge-auth-token`.
The file is created on first use and must remain private. Existing daemon processes
from older releases must be stopped before using the updated client. The control
HTTP endpoint accepts authenticated local clients only; browser pages cannot call it.
WebSocket connections are limited to browser extension origins.
This Origin check blocks ordinary web pages, but it does not authenticate the
extension: another extension or a local process can still connect. Pairing the
extension with the daemon would require a separate protocol change.

Requests larger than 32 MiB are rejected. Increase this limit in the bridge source
only if a documented attachment workflow requires larger payloads.

## Ports

| Port | Role |
|------|------|
| `3846` | Control HTTP (`/v1/health`, `/v1/conversations/...`, `/v1/agents/heartbeat`) |
| `3847` | Extension WebSocket (fixed) |

## Cursor / other agents

The installer prints a ready-to-paste JSON block. On Windows the `command` is often `python.exe` or `py.exe` with `args` like `["-3", "C:\\Users\\...\\doma_mcp_stdio.py"]` (native paths). On macOS / Linux it looks like:

```json
{
  "mcpServers": {
    "DomA": {
      "command": "python3",
      "args": ["/absolute/path/to/.doma/mcp/doma_mcp_stdio.py"]
    }
  }
}
```

For Codex, allow enough time for DomA to create the conversation (the bridge can
wait up to 90 seconds before returning its ID):

```toml
[mcp_servers.DomA]
command = "python3"
args = ["/absolute/path/to/.doma/mcp/doma_mcp_stdio.py"]
tool_timeout_sec = 120
```

On Windows, use your installed Python command and an absolute Windows script path.

## Manual daemon (optional)

```bash
python3 mcp-bridge/doma_bridge_daemon.py
```

If already running, a second start exits quietly (control port busy).

## DomA CLI (separate track)

CLI is installed only via [`../cli-runner/`](../cli-runner/) / [`../doma-cli/`](../doma-cli/). It uses **`:3856` / `:3857`** and CDN object `doma_cli_bridge_daemon.py` — not this MCP package. The extension connects to both WS ports (`:3847` MCP + `:3857` CLI).
