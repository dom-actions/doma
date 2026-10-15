type ToolChoiceInput = {
  endpoint: string;
  requestedMode: 'auto' | 'required';
  explicitToolChoice?: unknown;
  extraBody?: Record<string, unknown>;
};

/** Only the official DeepSeek endpoint has a verified default-thinking restriction. */
function isDeepSeekThinkingRequest(endpoint: string, body?: Record<string, unknown>): boolean {
  try {
    if (new URL(endpoint).hostname.toLowerCase() !== 'api.deepseek.com') return false;
  } catch {
    return false;
  }
  const thinking = body?.thinking;
  const type = thinking && typeof thinking === 'object' && !Array.isArray(thinking)
    ? (thinking as Record<string, unknown>).type : undefined;
  const effort = body?.reasoning_effort;
  // Conflicting toggles stay conservative; enable_thinking is not a DeepSeek toggle.
  if (type === 'enabled' || (typeof effort === 'string' &&
    ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(effort))) return true;
  if (type === 'disabled' || effort === 'none') return false;
  return true;
}

/** Preserve every other provider's existing choice policy, without guessing from model names. */
export function resolveCompatibleToolChoice(input: ToolChoiceInput): unknown | undefined {
  if (isDeepSeekThinkingRequest(input.endpoint, input.extraBody)) {
    // Thinking supports automatic selection and no tools, but rejects required/named tools.
    return input.explicitToolChoice === 'auto' || input.explicitToolChoice === 'none'
      ? input.explicitToolChoice : undefined;
  }
  return input.requestedMode === 'required' ? 'required' : input.explicitToolChoice;
}
