import type {
  ChatMessageToolCall,
  ToolCallDetailPreview,
  ToolCallDetailValue,
} from '../../components/chat/chatTypes';

type ToolCallLike = { id: string; function: { name: string; arguments?: unknown } };

/** Bounded, JSON-safe evidence; large binaries and credential fields stay out of chat storage. */
export function previewToolCallValue(input: unknown, maxChars = 12_000): ToolCallDetailPreview {
  let remaining = maxChars;
  let nodes = 160;
  let truncated = false;
  const seen = new WeakSet<object>();
  const text = (value: string): string => {
    const limit = Math.min(3_000, Math.max(0, remaining));
    remaining -= Math.min(limit, value.length);
    if (value.length <= limit) return value;
    truncated = true;
    return `${value.slice(0, limit)}…`;
  };
  const visit = (value: unknown, depth: number): ToolCallDetailValue => {
    if (--nodes < 0 || remaining <= 0 || depth > 6) {
      truncated = true;
      return '[truncated]';
    }
    if (value == null) return null;
    if (typeof value === 'string') {
      if (/^data:[^,]*;base64,/i.test(value)) return '[binary omitted]';
      return text(value);
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (typeof value !== 'object') return text(String(value));
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    try {
      if (value instanceof Error) return { name: value.name, message: text(value.message) };
      if (Array.isArray(value)) {
        if (value.length > 30) truncated = true;
        const result: ToolCallDetailValue[] = [];
        for (const entry of value.slice(0, 30)) {
          if (remaining <= 0 || nodes <= 0) { truncated = true; break; }
          result.push(visit(entry, depth + 1));
        }
        return result;
      }
      const result: Record<string, ToolCallDetailValue> = Object.create(null);
      const keys = Object.keys(value);
      if (keys.length > 40) truncated = true;
      for (const key of keys.slice(0, 40)) {
        if (remaining <= 0 || nodes <= 0) { truncated = true; break; }
        if (key.length > 120) truncated = true;
        const label = text(key.slice(0, 120));
        if (/^(?:api[-_]?key|x[-_]?api[-_]?key|.*token|authorization|(?:set[-_]?)?cookies?|password|.*secret|credentials?)$/i.test(key)) {
          result[label] = '[redacted]';
        } else if (/^(?:base64|dataBase64|data_base64|imageData|bytes|binary)$/i.test(key)) {
          result[label] = '[binary omitted]';
        } else {
          result[label] = visit((value as Record<string, unknown>)[key], depth + 1);
        }
      }
      return result;
    } finally {
      seen.delete(value);
    }
  };
  return { value: visit(input, 0), ...(truncated ? { truncated: true } : {}) };
}

export function startToolCallRecord(call: ToolCallLike, captureDetails = false): ChatMessageToolCall {
  const basic: ChatMessageToolCall = { id: call.id, name: call.function.name, state: 'doing' };
  if (captureDetails !== true) return basic;
  let input = call.function.arguments ?? {};
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { /* Retain malformed arguments for diagnosis. */ }
  }
  return {
    ...basic,
    details: { status: 'running', startedAt: Date.now(), input: previewToolCallValue(input, 6_000) },
  };
}

export function finishToolCallRecord(call: ToolCallLike, result: unknown, captureDetails = false): ChatMessageToolCall {
  const basic: ChatMessageToolCall = { id: call.id, name: call.function.name, state: 'doing' };
  if (captureDetails !== true) return basic;
  const record = result && typeof result === 'object' && !Array.isArray(result)
    ? result as Record<string, unknown> : undefined;
  const failed = record?.ok === false || record?.success === false || record?.error != null;
  const error = failed ? record?.error ?? record?.message : undefined;
  return {
    ...basic,
    details: {
      status: failed ? 'error' : 'completed',
      finishedAt: Date.now(),
      output: previewToolCallValue(result),
      ...(error != null ? { error: previewToolCallValue(error, 3_000) } : {}),
    },
  };
}

/** Done/visibility patches must not erase the evidence captured by start/result callbacks. */
export function mergeToolCallRecord(
  previous: ChatMessageToolCall | undefined,
  patch: ChatMessageToolCall,
): ChatMessageToolCall {
  return {
    ...previous, ...patch,
    ...(previous?.details || patch.details
      ? { details: { ...previous?.details, ...patch.details } as NonNullable<ChatMessageToolCall['details']> }
      : {}),
  };
}

export function interruptToolCallRecord(call: ChatMessageToolCall): void {
  call.state = 'gone';
  if (call.details?.status === 'running') {
    call.details.status = 'stopped';
    call.details.finishedAt = Date.now();
  }
}

/** Copy all saved calls, including collapsed branches, failure status and truncation markers. */
export function serializeToolCallHistory(calls: ChatMessageToolCall[]): string {
  return JSON.stringify(calls, null, 2);
}
