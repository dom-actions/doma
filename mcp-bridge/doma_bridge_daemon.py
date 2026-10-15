#!/usr/bin/env python3
"""
DomA bridge daemon (singleton).

- Control HTTP: 127.0.0.1:3846  (thin MCP clients)
- Extension WS:  127.0.0.1:3847  (DomA sidepanel WebSocket when MCP bridge enabled)

Only one instance should run. Binding control port fails → exit.
Spawned by doma_mcp_stdio.py via ensure_daemon(), or run manually.

Env:
  DOMA_CONTROL_PORT   default 3846
  DOMA_BRIDGE_PORT    default 3847 (fixed; no port scan)
  DOMA_BIND_TIMEOUT_SEC  wait for extension conversationId (default 90)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import struct
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Optional
from urllib.parse import unquote, urlsplit
from xml.sax.saxutils import escape as xml_escape

from bridge_auth import load_or_create_token

SERVER_VERSION = "0.6.2"
CONTROL_PORT = int(os.environ.get("DOMA_CONTROL_PORT", "3846"))
BRIDGE_PORT = int(os.environ.get("DOMA_BRIDGE_PORT", "3847"))
BIND_TIMEOUT_SEC = float(os.environ.get("DOMA_BIND_TIMEOUT_SEC", "90"))
MAX_BRIDGE_MESSAGE_BYTES = 32 * 1024 * 1024

_TASKS: dict[str, dict[str, Any]] = {}
_REQUESTS: dict[str, dict[str, Any]] = {}
_REQUEST_TO_CONVERSATION: dict[str, str] = {}
_TASKS_LOCK = threading.Lock()

_CLIENTS: list[Any] = []
_CLIENTS_LOCK = threading.Lock()

# Desktop MCP stdio clients (Cursor / Claude / …) heartbeats
_AGENTS: dict[str, dict[str, Any]] = {}
_AGENTS_LOCK = threading.Lock()
AGENT_TTL_SEC = float(os.environ.get("DOMA_AGENT_TTL_SEC", "90"))


def _touch_agent(client_id: Any, name: Any = None) -> None:
    cid = client_id.strip() if isinstance(client_id, str) else ""
    if not cid:
        return
    label = name.strip()[:64] if isinstance(name, str) and name.strip() else "MCP"
    now = time.time()
    with _AGENTS_LOCK:
        _AGENTS[cid] = {"id": cid, "name": label, "lastSeen": now}


def _prune_agents() -> list[dict[str, Any]]:
    now = time.time()
    with _AGENTS_LOCK:
        dead = [k for k, v in _AGENTS.items() if now - float(v.get("lastSeen") or 0) > AGENT_TTL_SEC]
        for k in dead:
            _AGENTS.pop(k, None)
        return [
            {"id": v["id"], "name": v.get("name") or "MCP", "lastSeen": v.get("lastSeen")}
            for v in _AGENTS.values()
        ]


def _agent_snapshot() -> dict[str, Any]:
    agents = _prune_agents()
    return {"agentCount": len(agents), "agents": agents}


def _decode_attachment(item: Any, index: int) -> dict[str, Any]:
    if isinstance(item, str):
        raw = item.strip()
        mime = None
        if raw.startswith("data:") and "," in raw:
            header, raw = raw.split(",", 1)
            mime = header[5:].split(";")[0] if header.startswith("data:") else None
        try:
            data = base64.b64decode(raw, validate=False)
        except Exception as e:
            raise ValueError(f"attachments[{index}]: invalid base64 ({e})") from e
        return {
            "name": f"attachment-{index}",
            "mimeType": mime,
            "size": len(data),
            "dataBase64": raw,
        }

    if isinstance(item, dict):
        raw = item.get("data") or item.get("base64") or item.get("dataBase64")
        if not isinstance(raw, str) or not raw.strip():
            raise ValueError(f"attachments[{index}]: missing base64 data")
        raw = raw.strip()
        mime_default = None
        if raw.startswith("data:") and "," in raw:
            header, raw = raw.split(",", 1)
            mime_default = header[5:].split(";")[0] if header.startswith("data:") else None
        try:
            data = base64.b64decode(raw, validate=False)
        except Exception as e:
            raise ValueError(f"attachments[{index}]: invalid base64 ({e})") from e
        name = item.get("name") or item.get("fileName") or f"attachment-{index}"
        mime = item.get("mimeType") or item.get("type") or mime_default
        return {
            "name": str(name),
            "mimeType": mime,
            "size": len(data),
            "dataBase64": raw,
        }

    raise ValueError(f"attachments[{index}]: expected string or object")


def _payload(ok: bool, text: str, **extra: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"ok": ok, "text": text}
    out.update(extra)
    return out


def _valid_loopback_host(host: str, port: int) -> bool:
    return host.lower() in (f"127.0.0.1:{port}", f"localhost:{port}")


def _valid_extension_origin(origin: str) -> bool:
    try:
        parsed = urlsplit(origin)
        port = parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme in ("chrome-extension", "moz-extension", "safari-web-extension")
        and bool(parsed.hostname)
        and not parsed.path
        and not parsed.query
        and not parsed.fragment
        and parsed.username is None
        and parsed.password is None
        and port is None
    )


def build_mcp_send_text(task: str, caller_agent: str) -> str:
    label = xml_escape(caller_agent.strip() or "MCP")
    block = f"<interactionBlock>\n<mcpCall>{label}</mcpCall>\n</interactionBlock>"
    body = task.strip()
    return f"{block}\n{body}" if body else block


def _normalize_caller_agent(value: Any) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()[:64]
    return "MCP"


def _update_task(conversation_id: str, **fields: Any) -> None:
    with _TASKS_LOCK:
        rec = _TASKS.get(conversation_id)
        if not rec:
            return
        rec.update(fields)
        rec["updatedAt"] = time.time()


def _extension_connected() -> bool:
    with _CLIENTS_LOCK:
        return len(_CLIENTS) > 0


def _broadcast_task(payload: dict[str, Any]) -> int:
    raw = json.dumps(payload, ensure_ascii=False)
    dead: list[Any] = []
    sent = 0
    with _CLIENTS_LOCK:
        clients = list(_CLIENTS)
    for client in clients:
        try:
            client.send_text(raw)
            sent += 1
        except Exception as e:
            print(f"[daemon] send failed: {e}", file=sys.stderr)
            dead.append(client)
    if dead:
        with _CLIENTS_LOCK:
            for c in dead:
                if c in _CLIENTS:
                    _CLIENTS.remove(c)
    return sent


def _bind_conversation(request_id: str, conversation_id: str) -> None:
    rid = request_id.strip()
    cid = conversation_id.strip()
    if not rid or not cid:
        return
    with _TASKS_LOCK:
        req = _REQUESTS.get(rid)
        if not req:
            return
        existing = req.get("conversationId")
        if isinstance(existing, str) and existing.strip() and existing.strip() != cid:
            print(
                f"[daemon] request {rid} already bound to {existing}, ignore {cid}",
                file=sys.stderr,
            )
            return
        now = time.time()
        req["conversationId"] = cid
        req["status"] = "running"
        req["text"] = "DomA 已创建会话并开始执行"
        req["updatedAt"] = now
        _REQUEST_TO_CONVERSATION[rid] = cid
        _TASKS[cid] = {
            "conversationId": cid,
            "requestId": rid,
            "status": "running",
            "ok": False,
            "text": req.get("text") or "DomA 已创建会话并开始执行",
            "callerAgent": req.get("callerAgent"),
            "sendText": req.get("sendText"),
            "createdAt": req.get("createdAt", now),
            "updatedAt": now,
        }
        event = req.get("event")
    if isinstance(event, threading.Event):
        event.set()


def _fail_request(request_id: str, text: str) -> None:
    rid = request_id.strip()
    if not rid:
        return
    with _TASKS_LOCK:
        req = _REQUESTS.get(rid)
        if not req:
            return
        req["status"] = "error"
        req["ok"] = False
        req["error"] = text
        req["text"] = text
        req["updatedAt"] = time.time()
        event = req.get("event")
        cid = req.get("conversationId")
        if isinstance(cid, str) and cid.strip():
            rec = _TASKS.get(cid.strip())
            if rec:
                rec.update(status="error", ok=False, text=text, updatedAt=time.time())
    if isinstance(event, threading.Event):
        event.set()


def _resolve_conversation_id(msg: dict[str, Any]) -> Optional[str]:
    cid = msg.get("conversationId")
    if isinstance(cid, str) and cid.strip():
        return cid.strip()
    rid = msg.get("requestId")
    if isinstance(rid, str) and rid.strip():
        with _TASKS_LOCK:
            mapped = _REQUEST_TO_CONVERSATION.get(rid.strip())
            if mapped:
                return mapped
            req = _REQUESTS.get(rid.strip())
            if req:
                existing = req.get("conversationId")
                if isinstance(existing, str) and existing.strip():
                    return existing.strip()
    return None


def dispatch_to_doma(
    request_id: str,
    send_text: str,
    attachments: list[dict[str, Any]],
    caller_agent: str,
    *,
    msg_type: str = "task",
    conversation_id: str | None = None,
) -> dict[str, Any]:
    if not _extension_connected():
        return {
            "ok": False,
            "text": (
                "DomA 侧栏未连接本机桥。"
                f"请打开 DomA 侧栏并启用「MCP 桥接」（桥端口 {BRIDGE_PORT}）。"
            ),
            "status": "error",
            "bridgeConnected": False,
            "attachmentCount": len(attachments),
        }

    payload: dict[str, Any] = {
        "type": msg_type,
        "requestId": request_id,
        "sendText": send_text,
        "callerAgent": caller_agent,
        "attachments": [
            {
                "name": a["name"],
                "mimeType": a.get("mimeType"),
                "size": a.get("size"),
                "dataBase64": a.get("dataBase64"),
            }
            for a in attachments
        ],
    }
    if conversation_id:
        payload["conversationId"] = conversation_id

    n = _broadcast_task(payload)
    if n <= 0:
        return {
            "ok": False,
            "text": "扩展曾连接但发送失败，请重试",
            "status": "error",
            "bridgeConnected": False,
        }

    return {
        "ok": True,
        "text": (
            "已提交到 DomA，等待扩展确认…"
            if msg_type == "message"
            else "已提交到 DomA，等待扩展创建会话…"
        ),
        "status": "pending",
        "bridgeConnected": True,
        "clients": n,
        "attachmentCount": len(attachments),
    }


def dispatch_close_to_doma(
    request_id: str,
    conversation_id: str,
    caller_agent: str,
) -> dict[str, Any]:
    if not _extension_connected():
        return {
            "ok": False,
            "text": (
                "DomA 侧栏未连接本机桥。"
                f"请打开 DomA 侧栏并启用「MCP 桥接」（桥端口 {BRIDGE_PORT}）。"
            ),
            "status": "error",
            "bridgeConnected": False,
        }

    payload: dict[str, Any] = {
        "type": "close",
        "requestId": request_id,
        "conversationId": conversation_id,
        "callerAgent": caller_agent,
    }
    n = _broadcast_task(payload)
    if n <= 0:
        return {
            "ok": False,
            "text": "扩展曾连接但发送失败，请重试",
            "status": "error",
            "bridgeConnected": False,
        }

    return {
        "ok": True,
        "text": "已提交关闭会话到 DomA，等待扩展确认…",
        "status": "pending",
        "bridgeConnected": True,
        "clients": n,
    }


def start_group_conversation(
    task: Any,
    attachments: Any = None,
    caller_agent: Any = None,
) -> dict[str, Any]:
    if not isinstance(task, str) or not task.strip():
        return _payload(False, "task 不能为空", status="error")

    normalized: list[dict[str, Any]] = []
    if attachments is not None:
        if not isinstance(attachments, list):
            return _payload(False, "attachments 必须是数组", status="error")
        try:
            for i, item in enumerate(attachments):
                normalized.append(_decode_attachment(item, i))
        except ValueError as e:
            return _payload(False, str(e), status="error")

    caller = _normalize_caller_agent(caller_agent)
    request_id = str(uuid.uuid4())
    send_text = build_mcp_send_text(task.strip(), caller)
    now = time.time()
    event = threading.Event()
    with _TASKS_LOCK:
        _REQUESTS[request_id] = {
            "requestId": request_id,
            "conversationId": None,
            "status": "pending",
            "ok": False,
            "text": "",
            "error": None,
            "callerAgent": caller,
            "sendText": send_text,
            "createdAt": now,
            "updatedAt": now,
            "event": event,
        }

    try:
        out = dispatch_to_doma(request_id, send_text, normalized, caller)
        if not out.get("ok"):
            _fail_request(request_id, str(out.get("text") or "提交失败"))
            return _payload(
                False,
                str(out.get("text") or "提交失败"),
                status="error",
                callerAgent=caller,
                bridgeConnected=bool(out.get("bridgeConnected")),
            )

        if not event.wait(BIND_TIMEOUT_SEC):
            _fail_request(request_id, "等待 DomA 创建会话超时")
            return _payload(
                False,
                "等待 DomA 创建会话超时（侧栏未打开或 startGroupSession 失败）",
                status="error",
                callerAgent=caller,
                bridgeConnected=True,
            )

        with _TASKS_LOCK:
            req = _REQUESTS.get(request_id) or {}
            cid = req.get("conversationId")
            err = req.get("error")
            status = str(req.get("status") or "pending")

        if not isinstance(cid, str) or not cid.strip():
            return _payload(
                False,
                str(err or "扩展未返回 conversationId"),
                status="error",
                callerAgent=caller,
                bridgeConnected=True,
            )

        cid = cid.strip()
        return _payload(
            True,
            f"已创建会话并开始执行（conversationId={cid}）。"
            "请用 browser_get_conversation_result 查询进度。",
            conversationId=cid,
            status="running" if status != "error" else "error",
            callerAgent=caller,
            bridgeConnected=True,
        )
    except Exception as e:
        _fail_request(request_id, f"执行失败: {e}")
        return _payload(False, f"执行失败: {e}", status="error", callerAgent=caller)


def send_conversation_message(
    conversation_id: Any,
    text: Any,
    attachments: Any = None,
    caller_agent: Any = None,
) -> dict[str, Any]:
    if not isinstance(conversation_id, str) or not conversation_id.strip():
        return _payload(False, "conversationId 不能为空", status="error")
    if not isinstance(text, str) or not text.strip():
        return _payload(False, "text 不能为空", status="error")

    cid = conversation_id.strip()
    normalized: list[dict[str, Any]] = []
    if attachments is not None:
        if not isinstance(attachments, list):
            return _payload(False, "attachments 必须是数组", status="error")
        try:
            for i, item in enumerate(attachments):
                normalized.append(_decode_attachment(item, i))
        except ValueError as e:
            return _payload(False, str(e), status="error")

    caller = _normalize_caller_agent(caller_agent)
    request_id = str(uuid.uuid4())
    send_text = build_mcp_send_text(text.strip(), caller)
    now = time.time()
    event = threading.Event()
    with _TASKS_LOCK:
        _REQUESTS[request_id] = {
            "requestId": request_id,
            "conversationId": cid,
            "status": "pending",
            "ok": False,
            "text": "",
            "error": None,
            "callerAgent": caller,
            "sendText": send_text,
            "createdAt": now,
            "updatedAt": now,
            "event": event,
        }
        _REQUEST_TO_CONVERSATION[request_id] = cid

    try:
        out = dispatch_to_doma(
            request_id,
            send_text,
            normalized,
            caller,
            msg_type="message",
            conversation_id=cid,
        )
        if not out.get("ok"):
            _fail_request(request_id, str(out.get("text") or "提交失败"))
            return _payload(
                False,
                str(out.get("text") or "提交失败"),
                conversationId=cid,
                status="error",
                callerAgent=caller,
                bridgeConnected=bool(out.get("bridgeConnected")),
            )

        if not event.wait(BIND_TIMEOUT_SEC):
            _fail_request(request_id, "等待 DomA 确认消息超时")
            return _payload(
                False,
                "等待 DomA 确认消息超时（侧栏未打开或会话不存在）",
                conversationId=cid,
                status="error",
                callerAgent=caller,
                bridgeConnected=True,
            )

        with _TASKS_LOCK:
            req = _REQUESTS.get(request_id) or {}
            err = req.get("error")
            status = str(req.get("status") or "pending")

        if status == "error":
            return _payload(
                False,
                str(err or req.get("text") or "发送失败"),
                conversationId=cid,
                status="error",
                callerAgent=caller,
                bridgeConnected=True,
            )

        return _payload(
            True,
            f"已向会话发送消息（conversationId={cid}）。"
            "请用 browser_get_conversation_result 查询进度。",
            conversationId=cid,
            status="running",
            callerAgent=caller,
            bridgeConnected=True,
        )
    except Exception as e:
        _fail_request(request_id, f"执行失败: {e}")
        return _payload(
            False,
            f"执行失败: {e}",
            conversationId=cid,
            status="error",
            callerAgent=caller,
        )


def close_conversation(
    conversation_id: Any,
    caller_agent: Any = None,
) -> dict[str, Any]:
    if not isinstance(conversation_id, str) or not conversation_id.strip():
        return _payload(False, "conversationId 不能为空", status="error")

    cid = conversation_id.strip()
    caller = _normalize_caller_agent(caller_agent)
    request_id = str(uuid.uuid4())
    now = time.time()
    event = threading.Event()
    with _TASKS_LOCK:
        _REQUESTS[request_id] = {
            "requestId": request_id,
            "conversationId": cid,
            "status": "pending",
            "ok": False,
            "text": "",
            "error": None,
            "callerAgent": caller,
            "sendText": "",
            "createdAt": now,
            "updatedAt": now,
            "event": event,
        }
        _REQUEST_TO_CONVERSATION[request_id] = cid

    try:
        out = dispatch_close_to_doma(request_id, cid, caller)
        if not out.get("ok"):
            _fail_request(request_id, str(out.get("text") or "提交失败"))
            return _payload(
                False,
                str(out.get("text") or "提交失败"),
                conversationId=cid,
                status="error",
                callerAgent=caller,
                bridgeConnected=bool(out.get("bridgeConnected")),
            )

        if not event.wait(BIND_TIMEOUT_SEC):
            _fail_request(request_id, "等待 DomA 关闭会话超时")
            return _payload(
                False,
                "等待 DomA 关闭会话超时（侧栏未打开或会话不存在）",
                conversationId=cid,
                status="error",
                callerAgent=caller,
                bridgeConnected=True,
            )

        with _TASKS_LOCK:
            req = _REQUESTS.get(request_id) or {}
            err = req.get("error")
            status = str(req.get("status") or "pending")

        if status == "error":
            return _payload(
                False,
                str(err or req.get("text") or "关闭失败"),
                conversationId=cid,
                status="error",
                callerAgent=caller,
                bridgeConnected=True,
            )

        _update_task(
            cid,
            status="done",
            ok=True,
            text=f"会话已关闭（conversationId={cid}）",
        )
        return _payload(
            True,
            f"会话已关闭（conversationId={cid}）",
            conversationId=cid,
            status="done",
            callerAgent=caller,
            bridgeConnected=True,
        )
    except Exception as e:
        _fail_request(request_id, f"执行失败: {e}")
        return _payload(
            False,
            f"执行失败: {e}",
            conversationId=cid,
            status="error",
            callerAgent=caller,
        )


def get_conversation_result(conversation_id: Any) -> dict[str, Any]:
    if not isinstance(conversation_id, str) or not conversation_id.strip():
        return _payload(False, "conversationId 不能为空", status="error")
    cid = conversation_id.strip()
    with _TASKS_LOCK:
        rec = _TASKS.get(cid)
        if rec is None:
            return _payload(
                False,
                f"未知 conversationId: {cid}",
                conversationId=cid,
                status="error",
            )
        snapshot = dict(rec)
    return _payload(
        bool(snapshot.get("ok")),
        str(snapshot.get("text") or ""),
        conversationId=cid,
        status=str(snapshot.get("status") or "pending"),
        callerAgent=snapshot.get("callerAgent"),
        bridgeConnected=_extension_connected(),
    )


def _apply_extension_result(msg: dict[str, Any]) -> None:
    status = msg.get("status")
    if status not in ("done", "error", "running", "pending"):
        status = "done" if msg.get("ok") else "error"
    text = msg.get("text")
    if not isinstance(text, str):
        text = ""
    ok = bool(msg.get("ok")) if status == "done" else False

    cid = _resolve_conversation_id(msg)
    if cid:
        if status == "running":
            _update_task(cid, status="running", text=text or "DomA 执行中…")
            return
        if status == "pending":
            _update_task(cid, status="pending", text=text)
            return
        _update_task(cid, status=status, ok=ok, text=text)
        return

    rid = msg.get("requestId")
    if isinstance(rid, str) and rid.strip() and status == "error":
        _fail_request(rid.strip(), text or "DomA 执行失败")


# ---------- WebSocket ----------

def _ws_accept_key(sec_key: str) -> str:
    guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    digest = hashlib.sha1((sec_key + guid).encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def _ws_encode_text(message: str) -> bytes:
    data = message.encode("utf-8")
    length = len(data)
    header = bytearray([0x81])
    if length < 126:
        header.append(length)
    elif length < (1 << 16):
        header.append(126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", length))
    return bytes(header) + data


def _ws_recv_text(rfile) -> Optional[str]:
    header = rfile.read(2)
    if not header or len(header) < 2:
        return None
    b1, b2 = header[0], header[1]
    opcode = b1 & 0x0F
    masked = (b2 & 0x80) != 0
    length = b2 & 0x7F
    if length == 126:
        ext = rfile.read(2)
        if len(ext) < 2:
            return None
        length = struct.unpack("!H", ext)[0]
    elif length == 127:
        ext = rfile.read(8)
        if len(ext) < 8:
            return None
        length = struct.unpack("!Q", ext)[0]
    if not masked or length > MAX_BRIDGE_MESSAGE_BYTES:
        return None
    mask = rfile.read(4)
    payload = rfile.read(length) if length else b""
    if length and len(payload) < length:
        return None
    if masked and mask:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    if opcode == 0x8:
        return None
    if opcode == 0x9:
        return ""
    if opcode != 0x1:
        return ""
    return payload.decode("utf-8", errors="replace")


class BridgeWSHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[daemon-ws] " + (fmt % args), file=sys.stderr)

    def send_text(self, message: str) -> None:
        self.wfile.write(_ws_encode_text(message))
        self.wfile.flush()

    def do_GET(self) -> None:
        if not _valid_loopback_host(self.headers.get("Host", ""), BRIDGE_PORT):
            self.send_error(403, "Invalid Host")
            return
        if not _valid_extension_origin(self.headers.get("Origin", "")):
            self.send_error(403, "Invalid extension Origin")
            return
        if self.headers.get("Upgrade", "").lower() != "websocket":
            self.send_error(400, "WebSocket upgrade required")
            return

        key = self.headers.get("Sec-WebSocket-Key")
        if not key:
            self.send_error(400, "Missing Sec-WebSocket-Key")
            return

        # The upgraded socket is owned by this handler; do not parse another HTTP request.
        self.close_connection = True
        accept = _ws_accept_key(key)
        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()

        with _CLIENTS_LOCK:
            _CLIENTS.append(self)
        print(f"[daemon] extension connected ({len(_CLIENTS)} clients)", file=sys.stderr)
        try:
            self.send_text(
                json.dumps(
                    {
                        "type": "hello",
                        "role": "doma-bridge",
                        "version": SERVER_VERSION,
                        "port": BRIDGE_PORT,
                    },
                    ensure_ascii=False,
                )
            )
        except Exception as e:
            print(f"[daemon] hello send failed: {e}", file=sys.stderr)

        try:
            while True:
                try:
                    msg = _ws_recv_text(self.rfile)
                except OSError:
                    break
                if msg is None:
                    break
                if msg == "":
                    continue
                try:
                    data = json.loads(msg)
                except json.JSONDecodeError:
                    continue
                if not isinstance(data, dict):
                    continue
                typ = data.get("type")
                if typ == "hello":
                    print("[daemon] hello from extension", file=sys.stderr)
                elif typ == "keepalive":
                    # Sidepanel keepalive ping; no state change.
                    pass
                elif typ == "accepted":
                    rid = data.get("requestId")
                    cid = data.get("conversationId")
                    if isinstance(rid, str) and isinstance(cid, str):
                        _bind_conversation(rid, cid)
                        print(
                            f"[daemon] bound request={rid} conversationId={cid}",
                            file=sys.stderr,
                        )
                elif typ == "running":
                    _apply_extension_result({**data, "status": "running"})
                elif typ == "result":
                    _apply_extension_result(data)
        finally:
            with _CLIENTS_LOCK:
                if self in _CLIENTS:
                    _CLIENTS.remove(self)
            print("[daemon] extension disconnected", file=sys.stderr)


class ControlHTTPHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[daemon-http] " + (fmt % args), file=sys.stderr)

    def _send_json(self, code: int, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _authorized(self) -> bool:
        if not _valid_loopback_host(self.headers.get("Host", ""), CONTROL_PORT):
            self._send_json(403, {"ok": False, "text": "invalid Host", "status": "error"})
            return False
        # The control API is for local stdio clients, never browser page JavaScript.
        if self.headers.get("Origin") is not None:
            self._send_json(403, {"ok": False, "text": "browser Origin forbidden", "status": "error"})
            return False
        expected = f"Bearer {load_or_create_token()}"
        supplied = self.headers.get("Authorization", "").encode("utf-8")
        if not hmac.compare_digest(supplied, expected.encode("ascii")):
            self._send_json(401, {"ok": False, "text": "unauthorized", "status": "error"})
            return False
        return True

    def _read_json_body(self) -> Any:
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError as error:
            raise ValueError("invalid Content-Length") from error
        if length < 0:
            raise ValueError("invalid Content-Length")
        if length > MAX_BRIDGE_MESSAGE_BYTES:
            raise OverflowError("request body too large")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise ValueError("incomplete request body")
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def do_OPTIONS(self) -> None:
        self.close_connection = True
        self._send_json(403, {"ok": False, "text": "browser access forbidden", "status": "error"})

    def do_GET(self) -> None:
        if not self._authorized():
            return
        path = self.path.split("?", 1)[0]
        if path in ("/v1/health", "/health", "/"):
            snap = _agent_snapshot()
            self._send_json(
                200,
                {
                    "ok": True,
                    "role": "doma-bridge-daemon",
                    "version": SERVER_VERSION,
                    "authRequired": True,
                    "controlPort": CONTROL_PORT,
                    "bridgePort": BRIDGE_PORT,
                    "bridgeConnected": _extension_connected(),
                    "agentCount": snap["agentCount"],
                    "agents": snap["agents"],
                },
            )
            return
        if path.startswith("/v1/conversations/"):
            cid = unquote(path[len("/v1/conversations/") :].strip("/"))
            if not cid or cid in ("start", "message", "close"):
                self._send_json(404, {"ok": False, "text": "not found", "status": "error"})
                return
            self._send_json(200, get_conversation_result(cid))
            return
        self._send_json(404, {"ok": False, "text": "not found", "status": "error"})

    def do_POST(self) -> None:
        if not self._authorized():
            return
        path = self.path.split("?", 1)[0]
        try:
            body = self._read_json_body()
        except OverflowError:
            self.close_connection = True
            self._send_json(413, {"ok": False, "text": "request body too large", "status": "error"})
            return
        except ValueError as error:
            self.close_connection = True
            self._send_json(400, {"ok": False, "text": str(error), "status": "error"})
            return
        if body is None:
            self._send_json(400, {"ok": False, "text": "invalid JSON body", "status": "error"})
            return
        if not isinstance(body, dict):
            body = {}

        if path == "/v1/agents/heartbeat":
            _touch_agent(body.get("clientId"), body.get("name") or body.get("callerAgent"))
            snap = _agent_snapshot()
            self._send_json(200, {"ok": True, **snap})
            return

        if path == "/v1/conversations/start":
            # Also count this agent as active
            _touch_agent(
                body.get("clientId") or body.get("callerAgent") or "anonymous",
                body.get("callerAgent"),
            )
            result = start_group_conversation(
                body.get("task"),
                body.get("attachments"),
                body.get("callerAgent"),
            )
            self._send_json(200, result)
            return

        if path == "/v1/conversations/message":
            _touch_agent(
                body.get("clientId") or body.get("callerAgent") or "anonymous",
                body.get("callerAgent"),
            )
            result = send_conversation_message(
                body.get("conversationId"),
                body.get("text"),
                body.get("attachments"),
                body.get("callerAgent"),
            )
            self._send_json(200, result)
            return

        if path == "/v1/conversations/close":
            _touch_agent(
                body.get("clientId") or body.get("callerAgent") or "anonymous",
                body.get("callerAgent"),
            )
            result = close_conversation(
                body.get("conversationId"),
                body.get("callerAgent"),
            )
            self._send_json(200, result)
            return

        self._send_json(404, {"ok": False, "text": "not found", "status": "error"})


def main() -> None:
    # Singleton: control port first
    try:
        control = ThreadingHTTPServer(("127.0.0.1", CONTROL_PORT), ControlHTTPHandler)
    except OSError as e:
        print(
            f"[daemon] control port {CONTROL_PORT} busy ({e}); another daemon is running. exit.",
            file=sys.stderr,
        )
        sys.exit(0)

    try:
        bridge = ThreadingHTTPServer(("127.0.0.1", BRIDGE_PORT), BridgeWSHandler)
    except OSError as e:
        print(f"[daemon] bridge port {BRIDGE_PORT} busy ({e}); exit.", file=sys.stderr)
        control.server_close()
        sys.exit(1)

    threading.Thread(target=control.serve_forever, name="doma-control", daemon=True).start()
    threading.Thread(target=bridge.serve_forever, name="doma-bridge-ws", daemon=True).start()
    print(
        f"[daemon] ready control=http://127.0.0.1:{CONTROL_PORT} "
        f"ws=ws://127.0.0.1:{BRIDGE_PORT} version={SERVER_VERSION}",
        file=sys.stderr,
    )
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("[daemon] shutting down", file=sys.stderr)


if __name__ == "__main__":
    main()
