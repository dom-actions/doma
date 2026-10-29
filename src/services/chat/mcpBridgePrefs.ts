import { Storage } from "@/store/Storage";

/** Default OFF: sidepanel must not open MCP WebSocket until user enables Provider toggle. */
export const MCP_BRIDGE_ENABLED_KEY = "doma_mcp_bridge_enabled";

/**
 * Default OFF: when on (and MCP bridge enabled), desktop agents get DomA browser tools
 * and `browser_start_direct_session` (no DomA LLM). When off, only the 4 conversation tools.
 */
export const MCP_DIRECT_CONTROL_KEY = "doma_mcp_direct_control";

/** Default OFF: sidepanel must not open CLI bridge (:3857) until user enables CLI Runner toggle. */
export const CLI_BRIDGE_ENABLED_KEY = "doma_cli_bridge_enabled";

/** Shown once when copying install command while bridge is still disabled. */
export const MCP_BRIDGE_COPY_HINT_KEY = "doma_mcp_bridge_copy_hint_shown";

export async function isMcpBridgeEnabled(): Promise<boolean> {
  const v = await Storage.init().get(MCP_BRIDGE_ENABLED_KEY);
  return v === true;
}

export async function setMcpBridgeEnabled(enabled: boolean): Promise<void> {
  await Storage.init().set(MCP_BRIDGE_ENABLED_KEY, enabled === true);
}

export async function isMcpDirectControlEnabled(): Promise<boolean> {
  const v = await Storage.init().get(MCP_DIRECT_CONTROL_KEY);
  return v === true;
}

export async function setMcpDirectControlEnabled(enabled: boolean): Promise<void> {
  await Storage.init().set(MCP_DIRECT_CONTROL_KEY, enabled === true);
}

export async function isCliBridgeEnabled(): Promise<boolean> {
  const v = await Storage.init().get(CLI_BRIDGE_ENABLED_KEY);
  return v === true;
}

export async function setCliBridgeEnabled(enabled: boolean): Promise<void> {
  await Storage.init().set(CLI_BRIDGE_ENABLED_KEY, enabled === true);
}

export async function hasMcpBridgeCopyHintShown(): Promise<boolean> {
  const v = await Storage.init().get(MCP_BRIDGE_COPY_HINT_KEY);
  return v === true;
}

export async function markMcpBridgeCopyHintShown(): Promise<void> {
  await Storage.init().set(MCP_BRIDGE_COPY_HINT_KEY, true);
}
