#!/usr/bin/env python3
"""
DomA thin MCP stdio client (multi-agent safe).

Desktop agents (Cursor / Claude / OpenClaw) each spawn this process via stdio.
It does NOT bind a WebSocket. Instead it:
  1. ensure_daemon() → HTTP health on :3846; if down, spawn doma_bridge_daemon.py
  2. Forwards tools/call to the singleton daemon over HTTP

Env:
  DOMA_CONTROL_PORT   default 3846
  DOMA_DAEMON_SCRIPT  override path to daemon script
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import uuid
import urllib.error
import urllib.request
from typing import Any

from bridge_auth import load_or_create_token

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "doma"
SERVER_VERSION = "0.6.0"

HERE = os.path.dirname(os.path.abspath(__file__))
CONTROL_PORT = int(os.environ.get("DOMA_CONTROL_PORT", "3846"))
CONTROL_BASE = f"http://127.0.0.1:{CONTROL_PORT}"
_LOCAL_HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
DAEMON_SCRIPT = os.environ.get(
    "DOMA_DAEMON_SCRIPT",
    os.path.join(HERE, "doma_bridge_daemon.py"),
)
ENSURE_TIMEOUT_SEC = float(os.environ.get("DOMA_ENSURE_DAEMON_TIMEOUT_SEC", "8"))
HEARTBEAT_SEC = float(os.environ.get("DOMA_AGENT_HEARTBEAT_SEC", "25"))
CLIENT_ID = os.environ.get("DOMA_MCP_CLIENT_ID") or str(uuid.uuid4())
AGENT_NAME = (os.environ.get("DOMA_CALLER_AGENT") or "MCP").strip()[:64] or "MCP"

TOOL_START_GROUP_CONVERSATION = {
    "name": "browser_start_group_conversation",
    "description": (
        "PRIMARY tool for real-browser web tasks in the user's Chrome (via DomA extension). "
        "USE THIS FIRST whenever the user asks to: open/navigate a website, search on Baidu/Google, "
        "click/type/fill forms, scrape page content or search-result titles, use an already-logged-in "
        "session, or automate any multi-step browsing workflow. "
        "Prefer this over Cursor's built-in browser / Playwright / IDE browser tools when the task "
        "needs the user's real cookies, logins, or local extension context. "
        "Do NOT require the user to say DomA — any web browsing / search / scrape request is enough. "
        "If you already have a conversationId for this task from an earlier start in this chat, "
        "use browser_send_conversation_message instead of starting a new conversation. "
        "Workflow: call this tool with a clear natural-language task (set callerAgent to your agent name), "
        "then poll browser_get_conversation_result with the returned conversationId until "
        "status is done or error. "
        "Returns JSON: { ok, text, conversationId, status, callerAgent, bridgeConnected }. "
        "Safe for multiple desktop agents: all share one local DomA bridge daemon."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "task": {
                "type": "string",
                "description": (
                    "Natural-language browser task, e.g. "
                    "\"Open baidu.com, search doma agent, return all first-page result titles.\""
                ),
            },
            "callerAgent": {
                "type": "string",
                "description": (
                    "Calling agent display name (Cursor / Claude / OpenClaw); "
                    "shown on DomA user bubble. Default MCP."
                ),
            },
            "attachments": {
                "type": "array",
                "description": "Optional base64 attachment list",
                "items": {
                    "oneOf": [
                        {"type": "string"},
                        {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "mimeType": {"type": "string"},
                                "data": {"type": "string"},
                                "base64": {"type": "string"},
                                "dataBase64": {"type": "string"},
                            },
                        },
                    ]
                },
            },
        },
        "required": ["task"],
    },
}

TOOL_SEND_CONVERSATION_MESSAGE = {
    "name": "browser_send_conversation_message",
    "description": (
        "FOLLOW-UP tool for an existing DomA conversation. "
        "Prefer this over browser_start_group_conversation whenever you already have a conversationId "
        "from a previous start in this chat (same browser task, same tab group, continue / next step / "
        "send more instructions / attach more files / ask DomA to recognize an image after a prior task). "
        "Do NOT start a new conversation for follow-ups. "
        "Requires conversationId + text; optional attachments (base64). "
        "After calling, poll browser_get_conversation_result with the SAME conversationId until done/error. "
        "Returns JSON: { ok, text, conversationId, status, callerAgent, bridgeConnected }."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "conversationId": {
                "type": "string",
                "description": (
                    "Required. Must be the conversationId returned by an earlier "
                    "browser_start_group_conversation in this session. Do not invent one."
                ),
            },
            "text": {
                "type": "string",
                "description": (
                    "Follow-up instruction for DomA in that conversation (natural language)."
                ),
            },
            "callerAgent": {
                "type": "string",
                "description": "Calling agent display name; shown on DomA user bubble. Default MCP.",
            },
            "attachments": {
                "type": "array",
                "description": (
                    "Optional. Same format as browser_start_group_conversation attachments; "
                    "use for images/files on this follow-up turn."
                ),
                "items": {
                    "oneOf": [
                        {"type": "string"},
                        {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "mimeType": {"type": "string"},
                                "data": {"type": "string"},
                                "base64": {"type": "string"},
                                "dataBase64": {"type": "string"},
                            },
                        },
                    ]
                },
            },
        },
        "required": ["conversationId", "text"],
    },
}

TOOL_GET_CONVERSATION_RESULT = {
    "name": "browser_get_conversation_result",
    "description": (
        "Poll status/result of a DomA real-browser task started by browser_start_group_conversation "
        "or continued by browser_send_conversation_message. "
        "Required after every start or send: call repeatedly with the SAME conversationId until "
        "status is done or error, then return the final text to the user. "
        "Returns JSON: { ok, text, conversationId, status, callerAgent, bridgeConnected } "
        "(status: pending|running|done|error)."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "conversationId": {
                "type": "string",
                "description": (
                    "conversationId from browser_start_group_conversation "
                    "(same id used for any later browser_send_conversation_message)."
                ),
            },
        },
        "required": ["conversationId"],
    },
}

TOOL_CLOSE_CONVERSATION = {
    "name": "browser_close_conversation",
    "description": (
        "Close an existing DomA conversation by conversationId. "
        "Use when the browser task is finished, the user asks to stop/end the session, "
        "or you no longer need that DomA tab group / chat. "
        "Requires conversationId from a prior browser_start_group_conversation. "
        "Returns JSON: { ok, text, conversationId, status, callerAgent, bridgeConnected }."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "conversationId": {
                "type": "string",
                "description": (
                    "Required. conversationId returned by browser_start_group_conversation."
                ),
            },
            "callerAgent": {
                "type": "string",
                "description": "Calling agent display name. Default MCP.",
            },
        },
        "required": ["conversationId"],
    },
}

TOOLS = [
    TOOL_START_GROUP_CONVERSATION,
    TOOL_SEND_CONVERSATION_MESSAGE,
    TOOL_GET_CONVERSATION_RESULT,
    TOOL_CLOSE_CONVERSATION,
]


def _send(msg: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _reply(req_id: Any, result: Any) -> None:
    _send({"jsonrpc": "2.0", "id": req_id, "result": result})


def _reply_error(req_id: Any, code: int, message: str) -> None:
    _send({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}})


def _http_json(method: str, url: str, body: Any = None, timeout: float = 120.0) -> dict[str, Any]:
    data = None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {load_or_create_token()}",
    }
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with _LOCAL_HTTP.open(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        parsed = json.loads(raw) if raw else {}
        if not isinstance(parsed, dict):
            return {"ok": False, "text": "invalid daemon response", "status": "error"}
        return parsed


def _health_status() -> dict[str, Any] | None:
    try:
        out = _http_json("GET", f"{CONTROL_BASE}/v1/health", timeout=1.5)
        if out.get("ok") and out.get("role") == "doma-bridge-daemon":
            return out
    except Exception:
        pass
    return None


def _health_ok() -> bool:
    out = _health_status()
    return bool(out and out.get("authRequired") is True)


def _spawn_daemon() -> None:
    if not os.path.isfile(DAEMON_SCRIPT):
        raise FileNotFoundError(f"daemon script not found: {DAEMON_SCRIPT}")
    log_path = os.path.join(HERE, "doma_bridge_daemon.log")
    log_f = open(log_path, "a", encoding="utf-8")
    try:
        kwargs: dict[str, Any] = {
            "args": [sys.executable, DAEMON_SCRIPT],
            "stdin": subprocess.DEVNULL,
            "stdout": log_f,
            "stderr": subprocess.STDOUT,
            "close_fds": True,
        }
        if os.name == "nt":
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(
                subprocess, "DETACHED_PROCESS", 0
            )
        else:
            kwargs["start_new_session"] = True
        subprocess.Popen(**kwargs)
    finally:
        # Child inherits the fd; parent can close its copy.
        try:
            log_f.close()
        except Exception:
            pass
    print(f"[mcp-stdio] spawned daemon {DAEMON_SCRIPT} (log={log_path})", file=sys.stderr)


def ensure_daemon() -> None:
    status = _health_status()
    if status and status.get("authRequired") is not True:
        raise RuntimeError("DomA bridge daemon is outdated; stop it and start the updated daemon")
    if status:
        return
    print("[mcp-stdio] daemon not up; starting…", file=sys.stderr)
    try:
        _spawn_daemon()
    except Exception as e:
        raise RuntimeError(f"failed to spawn DomA bridge daemon: {e}") from e
    deadline = time.time() + ENSURE_TIMEOUT_SEC
    while time.time() < deadline:
        status = _health_status()
        if status and status.get("authRequired") is not True:
            raise RuntimeError("DomA bridge daemon is outdated; stop it and start the updated daemon")
        if status:
            print("[mcp-stdio] daemon ready", file=sys.stderr)
            return
        time.sleep(0.2)
    raise RuntimeError(
        f"DomA bridge daemon did not become ready on {CONTROL_BASE} within {ENSURE_TIMEOUT_SEC}s"
    )


def call_start(args: dict[str, Any]) -> str:
    ensure_daemon()
    name = args.get("callerAgent")
    if isinstance(name, str) and name.strip():
        global AGENT_NAME
        AGENT_NAME = name.strip()[:64]
    _heartbeat_once()
    out = _http_json(
        "POST",
        f"{CONTROL_BASE}/v1/conversations/start",
        {
            "task": args.get("task"),
            "attachments": args.get("attachments"),
            "callerAgent": AGENT_NAME,
            "clientId": CLIENT_ID,
        },
        timeout=BIND_HTTP_TIMEOUT,
    )
    return json.dumps(out, ensure_ascii=False)


def call_send(args: dict[str, Any]) -> str:
    ensure_daemon()
    name = args.get("callerAgent")
    if isinstance(name, str) and name.strip():
        global AGENT_NAME
        AGENT_NAME = name.strip()[:64]
    _heartbeat_once()
    out = _http_json(
        "POST",
        f"{CONTROL_BASE}/v1/conversations/message",
        {
            "conversationId": args.get("conversationId"),
            "text": args.get("text"),
            "attachments": args.get("attachments"),
            "callerAgent": AGENT_NAME,
            "clientId": CLIENT_ID,
        },
        timeout=BIND_HTTP_TIMEOUT,
    )
    return json.dumps(out, ensure_ascii=False)


def call_get(args: dict[str, Any]) -> str:
    ensure_daemon()
    _heartbeat_once()
    cid = args.get("conversationId")
    if not isinstance(cid, str) or not cid.strip():
        return json.dumps(
            {"ok": False, "text": "conversationId 不能为空", "status": "error"},
            ensure_ascii=False,
        )
    from urllib.parse import quote

    out = _http_json(
        "GET",
        f"{CONTROL_BASE}/v1/conversations/{quote(cid.strip(), safe='')}",
        timeout=30.0,
    )
    return json.dumps(out, ensure_ascii=False)


def call_close(args: dict[str, Any]) -> str:
    ensure_daemon()
    name = args.get("callerAgent")
    if isinstance(name, str) and name.strip():
        global AGENT_NAME
        AGENT_NAME = name.strip()[:64]
    _heartbeat_once()
    out = _http_json(
        "POST",
        f"{CONTROL_BASE}/v1/conversations/close",
        {
            "conversationId": args.get("conversationId"),
            "callerAgent": AGENT_NAME,
            "clientId": CLIENT_ID,
        },
        timeout=BIND_HTTP_TIMEOUT,
    )
    return json.dumps(out, ensure_ascii=False)


def _heartbeat_once() -> None:
    try:
        _http_json(
            "POST",
            f"{CONTROL_BASE}/v1/agents/heartbeat",
            {"clientId": CLIENT_ID, "name": AGENT_NAME, "callerAgent": AGENT_NAME},
            timeout=2.0,
        )
    except Exception:
        pass


def _heartbeat_loop() -> None:
    while True:
        try:
            if _health_ok():
                _heartbeat_once()
        except Exception:
            pass
        time.sleep(HEARTBEAT_SEC)


BIND_HTTP_TIMEOUT = float(os.environ.get("DOMA_BIND_TIMEOUT_SEC", "90")) + 15.0


def handle_request(msg: dict[str, Any]) -> None:
    method = msg.get("method")
    req_id = msg.get("id")
    params = msg.get("params") or {}

    if req_id is None:
        return

    if method == "initialize":
        _reply(
            req_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            },
        )
        return

    if method == "ping":
        _reply(req_id, {})
        return

    if method == "tools/list":
        _reply(req_id, {"tools": TOOLS})
        return

    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        if not isinstance(args, dict):
            args = {}
        try:
            if name == "browser_start_group_conversation":
                text = call_start(args)
            elif name == "browser_send_conversation_message":
                text = call_send(args)
            elif name == "browser_get_conversation_result":
                text = call_get(args)
            elif name == "browser_close_conversation":
                text = call_close(args)
            else:
                _reply_error(req_id, -32601, f"Unknown tool: {name}")
                return
        except Exception as e:
            text = json.dumps(
                {"ok": False, "text": str(e), "status": "error"},
                ensure_ascii=False,
            )
        try:
            outcome = json.loads(text)
            if not isinstance(outcome, dict):
                is_error = True
            else:
                status = outcome.get("status")
                is_error = status == "error" or (
                    outcome.get("ok") is False and status not in ("pending", "running")
                )
        except (TypeError, ValueError):
            is_error = True
        _reply(req_id, {"content": [{"type": "text", "text": text}], "isError": is_error})
        return

    _reply_error(req_id, -32601, f"Method not found: {method}")


def main() -> None:
    print(
        f"doma MCP stdio client starting (daemon control {CONTROL_BASE}, client={CLIENT_ID})",
        file=sys.stderr,
    )
    try:
        ensure_daemon()
        _heartbeat_once()
    except Exception as e:
        print(f"[mcp-stdio] ensure_daemon deferred: {e}", file=sys.stderr)

    threading.Thread(target=_heartbeat_loop, name="doma-agent-hb", daemon=True).start()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            print(f"invalid json: {e}", file=sys.stderr)
            continue
        if not isinstance(msg, dict):
            continue
        try:
            handle_request(msg)
        except Exception as e:
            req_id = msg.get("id")
            if req_id is not None:
                _reply_error(req_id, -32603, str(e))
            print(f"handler error: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
