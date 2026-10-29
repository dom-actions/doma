/**
 * DomA ↔ 本机 bridge WebSocket 客户端
 *
 * 侧栏打开后按开关分别连接（默认都不连）：
 * - MCP 开关 → :3847
 * - CLI 开关 → :3857
 * 回包按 requestId / conversationId 路由到来源 socket。
 */

/** MCP bridge WebSocket (paired with control :3846). */
export const DOMA_MCP_BRIDGE_PORT = 3847;
/** DomA CLI (`doma`) bridge WebSocket (paired with control :3856). */
export const DOMA_CLI_BRIDGE_PORT = 3857;

/** All known bridge WS ports (MCP + CLI). */
export const DOMA_BRIDGE_WS_PORTS: readonly number[] = [
  DOMA_MCP_BRIDGE_PORT,
  DOMA_CLI_BRIDGE_PORT,
];

/** @deprecated use DOMA_MCP_BRIDGE_PORT */
export const DOMA_MCP_BRIDGE_PORT_BASE = DOMA_MCP_BRIDGE_PORT;
/** @deprecated dual fixed ports; not a scan range */
export const DOMA_MCP_BRIDGE_PORT_COUNT = DOMA_BRIDGE_WS_PORTS.length;
/** @deprecated use DOMA_MCP_BRIDGE_PORT */
export const DOMA_MCP_BRIDGE_DEFAULT_PORT = DOMA_MCP_BRIDGE_PORT;

const HELLO_TIMEOUT_MS = 1200;

export type McpBridgeTaskMessage = {
  type: "task";
  requestId: string;
  sendText: string;
  callerAgent?: string;
  attachments?: unknown[];
};

/** Follow-up message into an existing DomA conversation. */
export type McpBridgeFollowUpMessage = {
  type: "message";
  requestId: string;
  conversationId: string;
  sendText: string;
  callerAgent?: string;
  attachments?: unknown[];
};

/** Close an existing DomA conversation. */
export type McpBridgeCloseMessage = {
  type: "close";
  requestId: string;
  conversationId: string;
  callerAgent?: string;
};

/** Direct-control: create group + status bubble only (no DomA LLM send). */
export type McpBridgeDirectSessionMessage = {
  type: "directSession";
  requestId: string;
  sendText: string;
  callerAgent?: string;
};

/** Direct-control: run one browser tool in the extension (no DomA LLM). */
export type McpBridgeToolCallMessage = {
  type: "toolCall";
  requestId: string;
  conversationId: string;
  name: string;
  arguments?: Record<string, unknown>;
  callerAgent?: string;
};

export type McpBridgeInboundMessage =
  | McpBridgeTaskMessage
  | McpBridgeFollowUpMessage
  | McpBridgeCloseMessage
  | McpBridgeDirectSessionMessage
  | McpBridgeToolCallMessage;

export type McpBridgeOutboundMessage =
  | { type: "hello"; role: "extension"; version?: string }
  | { type: "accepted"; requestId: string; conversationId: string }
  | { type: "running"; conversationId: string; text?: string }
  | {
      type: "result";
      conversationId?: string;
      requestId?: string;
      ok: boolean;
      text: string;
      status: "done" | "error";
    }
  | {
      type: "mcpMode";
      directControl: boolean;
      browserTools?: unknown[];
    }
  | {
      type: "toolResult";
      requestId: string;
      ok: boolean;
      text?: string;
      result?: unknown;
    };

type InboundHandler = (msg: McpBridgeInboundMessage) => void | Promise<void>;

type BridgeSlot = {
  port: number;
  socket: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  keepAliveTimer: ReturnType<typeof setInterval> | null;
  reconnectAttempt: number;
  generation: number;
};

const KEEPALIVE_INTERVAL_MS = 20_000;

let taskHandler: InboundHandler | null = null;
/** Fired when MCP (:3847) socket becomes ready (after daemon hello). */
let onMcpPortConnected: (() => void) | null = null;
let stopped = false;
/** Ports currently allowed to connect / reconnect (empty = none). */
let enabledPorts = new Set<number>();

/** requestId / conversationId → originating port (for reply routing). */
const requestPort = new Map<string, number>();
const conversationPort = new Map<string, number>();

const slots = new Map<number, BridgeSlot>(
  DOMA_BRIDGE_WS_PORTS.map((port) => [
    port,
    {
      port,
      socket: null,
      reconnectTimer: null,
      keepAliveTimer: null,
      reconnectAttempt: 0,
      generation: 0,
    },
  ]),
);

function getSlot(port: number): BridgeSlot | undefined {
  return slots.get(port);
}

function clearReconnectTimer(slot: BridgeSlot) {
  if (slot.reconnectTimer != null) {
    clearTimeout(slot.reconnectTimer);
    slot.reconnectTimer = null;
  }
}

function stopKeepAlive(slot: BridgeSlot) {
  if (slot.keepAliveTimer != null) {
    clearInterval(slot.keepAliveTimer);
    slot.keepAliveTimer = null;
  }
}

function startKeepAlive(slot: BridgeSlot) {
  stopKeepAlive(slot);
  slot.keepAliveTimer = setInterval(() => {
    const ws = slot.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      stopKeepAlive(slot);
      return;
    }
    try {
      ws.send(JSON.stringify({ type: "keepalive" }));
    } catch {
      stopKeepAlive(slot);
    }
  }, KEEPALIVE_INTERVAL_MS);
}

function scheduleReconnect(slot: BridgeSlot) {
  if (stopped || !enabledPorts.has(slot.port)) return;
  clearReconnectTimer(slot);
  const delay = Math.min(15_000, 800 * Math.pow(1.6, Math.min(slot.reconnectAttempt, 8)));
  slot.reconnectAttempt += 1;
  slot.reconnectTimer = setTimeout(() => {
    slot.reconnectTimer = null;
    void connectPort(slot.port);
  }, delay);
}

function rememberRoute(port: number, requestId?: string, conversationId?: string) {
  const rid = typeof requestId === "string" ? requestId.trim() : "";
  const cid = typeof conversationId === "string" ? conversationId.trim() : "";
  if (rid) requestPort.set(rid, port);
  if (cid) conversationPort.set(cid, port);
}

function resolveReplySocket(opts: {
  requestId?: string;
  conversationId?: string;
}): WebSocket | null {
  const rid = typeof opts.requestId === "string" ? opts.requestId.trim() : "";
  const cid = typeof opts.conversationId === "string" ? opts.conversationId.trim() : "";
  const port =
    (rid ? requestPort.get(rid) : undefined) ??
    (cid ? conversationPort.get(cid) : undefined) ??
    null;
  if (port != null) {
    const slot = getSlot(port);
    if (slot?.socket && slot.socket.readyState === WebSocket.OPEN) {
      return slot.socket;
    }
  }
  // Fallback: any open socket (should be rare)
  for (const slot of slots.values()) {
    if (slot.socket && slot.socket.readyState === WebSocket.OPEN) {
      return slot.socket;
    }
  }
  return null;
}

function sendOn(ws: WebSocket | null, msg: McpBridgeOutboundMessage): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}

export function isBridgePortConnected(port: number): boolean {
  const slot = getSlot(port);
  return !!slot?.socket && slot.socket.readyState === WebSocket.OPEN;
}

/** True if any enabled bridge socket is open (or a specific port when passed). */
export function isMcpBridgeConnected(port?: number): boolean {
  if (port != null) return isBridgePortConnected(port);
  for (const slot of slots.values()) {
    if (slot.socket && slot.socket.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

/** Connected WS ports (MCP and/or CLI). */
export function getMcpBridgePorts(): number[] {
  const out: number[] = [];
  for (const slot of slots.values()) {
    if (slot.socket && slot.socket.readyState === WebSocket.OPEN) out.push(slot.port);
  }
  return out;
}

/** @deprecated prefer getMcpBridgePorts(); returns first connected port */
export function getMcpBridgePort(): number | null {
  const ports = getMcpBridgePorts();
  return ports.length ? ports[0]! : null;
}

export function sendMcpBridgeResult(payload: {
  conversationId?: string;
  requestId?: string;
  ok: boolean;
  text: string;
  status: "done" | "error";
}): boolean {
  const conversationId =
    typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
  const requestId = typeof payload.requestId === "string" ? payload.requestId.trim() : "";
  if (!conversationId && !requestId) return false;
  return sendOn(resolveReplySocket({ conversationId, requestId }), {
    type: "result",
    ...(conversationId ? { conversationId } : {}),
    ...(requestId ? { requestId } : {}),
    ok: payload.ok,
    text: payload.text,
    status: payload.status,
  });
}

export function sendMcpBridgeAccepted(requestId: string, conversationId: string): boolean {
  const rid = requestId.trim();
  const cid = conversationId.trim();
  if (!rid || !cid) return false;
  const port = requestPort.get(rid);
  if (port != null) conversationPort.set(cid, port);
  return sendOn(resolveReplySocket({ requestId: rid, conversationId: cid }), {
    type: "accepted",
    requestId: rid,
    conversationId: cid,
  });
}

export function sendMcpBridgeRunning(conversationId: string, text?: string): boolean {
  const cid = conversationId.trim();
  if (!cid) return false;
  return sendOn(resolveReplySocket({ conversationId: cid }), {
    type: "running",
    conversationId: cid,
    ...(text ? { text } : {}),
  });
}

export function sendMcpBridgeOutbound(msg: McpBridgeOutboundMessage): boolean {
  const requestId =
    "requestId" in msg && typeof msg.requestId === "string" ? msg.requestId : undefined;
  const conversationId =
    "conversationId" in msg && typeof msg.conversationId === "string"
      ? msg.conversationId
      : undefined;
  return sendOn(resolveReplySocket({ requestId, conversationId }), msg);
}

/** Push direct-control mode + optional browser tool catalog to the MCP daemon (:3847). */
export function sendMcpBridgeMode(payload: {
  directControl: boolean;
  browserTools?: unknown[];
}): boolean {
  const slot = getSlot(DOMA_MCP_BRIDGE_PORT);
  return sendOn(slot?.socket ?? null, {
    type: "mcpMode",
    directControl: payload.directControl === true,
    ...(Array.isArray(payload.browserTools) ? { browserTools: payload.browserTools } : {}),
  });
}

export function sendMcpBridgeToolResult(payload: {
  requestId: string;
  ok: boolean;
  text?: string;
  result?: unknown;
}): boolean {
  const rid = payload.requestId.trim();
  if (!rid) return false;
  return sendOn(resolveReplySocket({ requestId: rid }), {
    type: "toolResult",
    requestId: rid,
    ok: payload.ok === true,
    ...(payload.text != null ? { text: payload.text } : {}),
    ...(payload.result !== undefined ? { result: payload.result } : {}),
  });
}

function closeSlot(slot: BridgeSlot) {
  clearReconnectTimer(slot);
  stopKeepAlive(slot);
  slot.generation += 1;
  try {
    slot.socket?.close();
  } catch {
    // ignore
  }
  slot.socket = null;
}

/**
 * Start / update listening ports. Pass the ports that should be active
 * (e.g. only MCP, only CLI, or both). Ports not listed are closed and not retried.
 */
export function startMcpBridgeClient(
  onTask: InboundHandler,
  ports: readonly number[] = DOMA_BRIDGE_WS_PORTS,
  options?: { onMcpConnected?: () => void },
): void {
  taskHandler = onTask;
  onMcpPortConnected =
    typeof options?.onMcpConnected === "function" ? options.onMcpConnected : null;
  stopped = false;
  const next = new Set(ports.filter((p) => slots.has(p)));
  enabledPorts = next;

  for (const slot of slots.values()) {
    if (!next.has(slot.port)) {
      closeSlot(slot);
      slot.reconnectAttempt = 0;
    }
  }
  for (const port of next) {
    void connectPort(port);
  }
}

/** Drop sockets for currently enabled ports and reconnect them. */
export function reconnectMcpBridgeClient(): void {
  if (stopped || enabledPorts.size === 0) return;
  const ports = [...enabledPorts];
  for (const port of ports) {
    const slot = getSlot(port);
    if (!slot) continue;
    closeSlot(slot);
    slot.reconnectAttempt = 0;
  }
  for (const port of ports) {
    void connectPort(port);
  }
}

export function stopMcpBridgeClient(options?: { clearHandler?: boolean }): void {
  stopped = true;
  enabledPorts = new Set();
  if (options?.clearHandler !== false) {
    taskHandler = null;
  }
  for (const slot of slots.values()) {
    closeSlot(slot);
    slot.reconnectAttempt = 0;
  }
  requestPort.clear();
  conversationPort.clear();
}

function attachLiveHandlers(slot: BridgeSlot, ws: WebSocket) {
  const port = slot.port;
  ws.onmessage = (ev) => {
    void (async () => {
      try {
        const data = typeof ev.data === "string" ? ev.data : String(ev.data ?? "");
        const msg = JSON.parse(data) as Record<string, unknown>;
        if (msg?.type === "hello") return;
        if (msg?.type === "task") {
          const task = msg as unknown as McpBridgeTaskMessage;
          if (!task.requestId || !task.sendText) return;
          rememberRoute(port, task.requestId);
          await taskHandler?.(task);
          return;
        }
        if (msg?.type === "message") {
          const followUp = msg as unknown as McpBridgeFollowUpMessage;
          if (!followUp.requestId || !followUp.conversationId || !followUp.sendText) return;
          rememberRoute(port, followUp.requestId, followUp.conversationId);
          await taskHandler?.(followUp);
          return;
        }
        if (msg?.type === "close") {
          const closeMsg = msg as unknown as McpBridgeCloseMessage;
          if (!closeMsg.requestId || !closeMsg.conversationId) return;
          rememberRoute(port, closeMsg.requestId, closeMsg.conversationId);
          await taskHandler?.(closeMsg);
          return;
        }
        if (msg?.type === "directSession") {
          const direct = msg as unknown as McpBridgeDirectSessionMessage;
          if (!direct.requestId || !direct.sendText) return;
          rememberRoute(port, direct.requestId);
          await taskHandler?.(direct);
          return;
        }
        if (msg?.type === "toolCall") {
          const toolCall = msg as unknown as McpBridgeToolCallMessage;
          if (!toolCall.requestId || !toolCall.conversationId || !toolCall.name) return;
          rememberRoute(port, toolCall.requestId, toolCall.conversationId);
          await taskHandler?.(toolCall);
        }
      } catch (e) {
        console.warn("[bridge] bad message", port, e);
      }
    })();
  };
  ws.onclose = () => {
    stopKeepAlive(slot);
    if (slot.socket === ws) {
      slot.socket = null;
    }
    console.log("[bridge] closed", port);
    if (enabledPorts.has(port)) scheduleReconnect(slot);
  };
  ws.onerror = () => {
    // onclose handles reconnect
  };
}

function tryPort(port: number, generation: number): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    if (stopped || !enabledPorts.has(port)) {
      resolve(null);
      return;
    }
    const slot = getSlot(port);
    if (!slot || generation !== slot.generation) {
      resolve(null);
      return;
    }
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`);
    } catch {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      finish(null);
    }, HELLO_TIMEOUT_MS);

    const finish = (result: WebSocket | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!result) {
        try {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
        } catch {
          // ignore
        }
      }
      resolve(result);
    };

    ws.onopen = () => {
      try {
        ws.send(
          JSON.stringify({
            type: "hello",
            role: "extension",
            version: "0.6.0",
          }),
        );
      } catch {
        finish(null);
      }
    };

    ws.onmessage = (ev) => {
      try {
        const data = typeof ev.data === "string" ? ev.data : String(ev.data ?? "");
        const msg = JSON.parse(data) as { type?: string; role?: string };
        if (msg?.type === "hello" && msg.role === "doma-bridge") {
          finish(ws);
          return;
        }
      } catch {
        // ignore non-json
      }
    };

    ws.onerror = () => finish(null);
    ws.onclose = () => finish(null);
  });
}

async function connectPort(port: number): Promise<void> {
  if (stopped || !enabledPorts.has(port)) return;
  const slot = getSlot(port);
  if (!slot) return;
  if (
    slot.socket &&
    (slot.socket.readyState === WebSocket.OPEN || slot.socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const generation = ++slot.generation;
  const ws = await tryPort(port, generation);
  if (!ws) {
    if (!stopped && enabledPorts.has(port) && generation === slot.generation) {
      // Quiet retry: daemon often intentionally off until user starts cli-runner / MCP.
      if (slot.reconnectAttempt === 0 || slot.reconnectAttempt % 8 === 0) {
        console.log(`[bridge] no daemon on :${port}, will retry`);
      }
      scheduleReconnect(slot);
    }
    return;
  }
  if (stopped || !enabledPorts.has(port) || generation !== slot.generation) {
    try {
      ws.close();
    } catch {
      // ignore
    }
    return;
  }
  slot.socket = ws;
  slot.reconnectAttempt = 0;
  attachLiveHandlers(slot, ws);
  startKeepAlive(slot);
  const label = port === DOMA_CLI_BRIDGE_PORT ? "cli" : "mcp";
  console.log(`[bridge] connected (${label})`, `ws://127.0.0.1:${port}`);
  if (port === DOMA_MCP_BRIDGE_PORT && onMcpPortConnected) {
    try {
      onMcpPortConnected();
    } catch (e) {
      console.warn("[bridge] onMcpConnected failed", e);
    }
  }
}
