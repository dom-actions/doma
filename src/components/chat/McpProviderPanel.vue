<template>
  <div class="mcp-panel">
    <div class="mcp-body">
      <p class="mcp-desc">{{ t("chat.mcp.providerDesc") }}</p>

      <div class="mcp-toggle-row">
        <div class="mcp-toggle-copy">
          <div class="mcp-toggle-title">{{ t("chat.mcp.bridgeToggle") }}</div>
          <p class="mcp-toggle-hint">{{ t("chat.mcp.bridgeToggleHint") }}</p>
        </div>
        <button
          type="button"
          class="mcp-switch"
          :class="{ on: bridgeEnabled }"
          role="switch"
          :aria-checked="bridgeEnabled"
          :disabled="toggleBusy"
          :title="t('chat.mcp.bridgeToggle')"
          @click="toggleBridgeEnabled"
        >
          <span class="mcp-switch-knob" aria-hidden="true" />
        </button>
      </div>

      <div class="mcp-toggle-row">
        <div class="mcp-toggle-copy">
          <div class="mcp-toggle-title">{{ t("chat.mcp.directToggle") }}</div>
          <p class="mcp-toggle-hint">{{ t("chat.mcp.directToggleHint") }}</p>
        </div>
        <button
          type="button"
          class="mcp-switch"
          :class="{ on: directEnabled }"
          role="switch"
          :aria-checked="directEnabled"
          :disabled="toggleBusy || !bridgeEnabled"
          :title="t('chat.mcp.directToggle')"
          @click="toggleDirectEnabled"
        >
          <span class="mcp-switch-knob" aria-hidden="true" />
        </button>
      </div>

      <div class="mcp-status-row">
        <span class="mcp-status-dot" :class="{ on: bridgeConnected, off: !bridgeEnabled }" />
        <span class="mcp-status-text">
          {{
            !bridgeEnabled
              ? t("chat.mcp.bridgeDisabled")
              : bridgeConnected
                ? t("chat.mcp.bridgeOn")
                : t("chat.mcp.bridgeOff")
          }}
        </span>
        <span v-if="bridgeEnabled && agentCount > 0" class="mcp-status-agents">
          {{ t("chat.mcp.agentsConnected", { count: agentCount }) }}
        </span>
      </div>

      <div class="mcp-section">
        <div class="mcp-section-title">{{ t("chat.mcp.installTitle") }}</div>
        <pre class="mcp-code">{{ installCommand }}</pre>
        <button type="button" class="mcp-copy-btn" @click="copyText(installCommand, 'cmd')">
          {{ cmdCopied ? t("chat.mcp.copied") : t("chat.mcp.copyCmd") }}
        </button>
      </div>

      <div class="mcp-section">
        <div class="mcp-section-title">{{ t("chat.mcp.configTitle") }}</div>
        <p class="mcp-hint">{{ t("chat.mcp.configHint") }}</p>
        <pre class="mcp-code">{{ configJson }}</pre>
        <button type="button" class="mcp-copy-btn" @click="copyText(configJson, 'cfg')">
          {{ cfgCopied ? t("chat.mcp.copied") : t("chat.mcp.copyConfig") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  hasMcpBridgeCopyHintShown,
  isMcpBridgeEnabled,
  isMcpDirectControlEnabled,
  markMcpBridgeCopyHintShown,
  setMcpBridgeEnabled,
  setMcpDirectControlEnabled,
} from "@/services/chat/mcpBridgePrefs";
import { isMcpBridgeConnected, DOMA_MCP_BRIDGE_PORT } from "@/services/chat/mcpBridgeClient";

const props = defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "bridge-enabled-change", enabled: boolean): void;
  (e: "direct-control-change", enabled: boolean): void;
  (e: "bridge-ensure"): void;
}>();

const { t } = useI18n();

const INSTALL_SH = "https://res.stayfork.app/d/install-doma-mcp.sh";
const HEALTH_URL = "http://127.0.0.1:3846/v1/health";

const installCommand = `curl -fsSL ${INSTALL_SH} | bash`;

const configJson = JSON.stringify(
  {
    mcpServers: {
      DomA: {
        command: "python3",
        args: ["$HOME/.doma/mcp/doma_mcp_stdio.py"],
      },
    },
  },
  null,
  2,
);

const bridgeEnabled = ref(false);
const directEnabled = ref(false);
const bridgeConnected = ref(false);
const agentCount = ref(0);
const toggleBusy = ref(false);
const cmdCopied = ref(false);
const cfgCopied = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let copyTimer: ReturnType<typeof setTimeout> | null = null;
let lastEnsureAt = 0;
const ENSURE_COOLDOWN_MS = 12_000;

async function loadEnabled() {
  try {
    bridgeEnabled.value = await isMcpBridgeEnabled();
    directEnabled.value = await isMcpDirectControlEnabled();
    emit("bridge-enabled-change", bridgeEnabled.value);
    emit("direct-control-change", directEnabled.value);
  } catch (e) {
    console.warn("[McpPanel] getEnabled failed", e);
    bridgeEnabled.value = false;
    directEnabled.value = false;
    emit("bridge-enabled-change", false);
    emit("direct-control-change", false);
  }
}

async function toggleBridgeEnabled() {
  if (toggleBusy.value) return;
  toggleBusy.value = true;
  const next = !bridgeEnabled.value;
  try {
    await setMcpBridgeEnabled(next);
    bridgeEnabled.value = next;
    emit("bridge-enabled-change", next);
    if (next) {
      void refreshHealth();
      emit("direct-control-change", directEnabled.value);
    } else {
      bridgeConnected.value = false;
      agentCount.value = 0;
    }
  } catch (e) {
    console.warn("[McpPanel] setEnabled failed", e);
  } finally {
    toggleBusy.value = false;
  }
}

async function toggleDirectEnabled() {
  if (toggleBusy.value || !bridgeEnabled.value) return;
  toggleBusy.value = true;
  const next = !directEnabled.value;
  try {
    await setMcpDirectControlEnabled(next);
    directEnabled.value = next;
    emit("direct-control-change", next);
  } catch (e) {
    console.warn("[McpPanel] setDirectControl failed", e);
  } finally {
    toggleBusy.value = false;
  }
}

function kickBridgeIfNeeded() {
  if (!bridgeEnabled.value) return;
  const now = Date.now();
  if (now - lastEnsureAt < ENSURE_COOLDOWN_MS) return;
  lastEnsureAt = now;
  emit("bridge-ensure");
}

async function refreshHealth() {
  if (!bridgeEnabled.value) {
    bridgeConnected.value = false;
    agentCount.value = 0;
    return;
  }
  // 侧栏本机 WS 状态（与 daemon health 互补）
  if (isMcpBridgeConnected(DOMA_MCP_BRIDGE_PORT)) {
    bridgeConnected.value = true;
  }
  try {
    const res = await fetch(HEALTH_URL, { method: "GET" });
    if (!res.ok) {
      bridgeConnected.value = isMcpBridgeConnected(DOMA_MCP_BRIDGE_PORT);
      agentCount.value = 0;
      kickBridgeIfNeeded();
      return;
    }
    const data = (await res.json()) as {
      ok?: boolean;
      bridgeConnected?: boolean;
      agentCount?: number;
    };
    bridgeConnected.value =
      data.bridgeConnected === true || isMcpBridgeConnected(DOMA_MCP_BRIDGE_PORT);
    agentCount.value = typeof data.agentCount === "number" ? data.agentCount : 0;
    if (!bridgeConnected.value) {
      kickBridgeIfNeeded();
    }
  } catch {
    bridgeConnected.value = isMcpBridgeConnected(DOMA_MCP_BRIDGE_PORT);
    agentCount.value = 0;
    kickBridgeIfNeeded();
  }
}

function startPolling() {
  stopPolling();
  void (async () => {
    await loadEnabled();
    void refreshHealth();
  })();
  pollTimer = setInterval(() => void refreshHealth(), 15_000);
}

function stopPolling() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function copyText(text: string, kind: "cmd" | "cfg") {
  try {
    if (kind === "cmd" && !bridgeEnabled.value) {
      const shown = await hasMcpBridgeCopyHintShown();
      if (!shown) {
        window.alert(t("chat.mcp.enableBeforeInstallHint"));
        await markMcpBridgeCopyHintShown();
      }
    }
    await navigator.clipboard.writeText(text);
    if (kind === "cmd") cmdCopied.value = true;
    else cfgCopied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      cmdCopied.value = false;
      cfgCopied.value = false;
    }, 1600);
  } catch (e) {
    console.warn("[McpPanel] copy failed", e);
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) startPolling();
    else stopPolling();
  },
  { immediate: true },
);

onMounted(() => {
  if (props.open) startPolling();
});

onUnmounted(() => {
  stopPolling();
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<style scoped lang="less">
.mcp-panel {
  padding: 10px 12px 14px;
  color: var(--stay-black);
}

.mcp-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--stay-labelSecondary, #888);
}

.mcp-toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--stay-border, #333);
  background: var(--stay-backgroundSecondary, transparent);
}

.mcp-toggle-copy {
  flex: 1;
  min-width: 0;
}

.mcp-toggle-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.mcp-toggle-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--stay-labelSecondary, #888);
}

.mcp-switch {
  flex: 0 0 auto;
  position: relative;
  width: 42px;
  height: 24px;
  margin-top: 2px;
  padding: 0;
  border: none;
  border-radius: 12px;
  background: var(--stay-border, #d0d0d0);
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  &.on {
    background: var(--stay-primary);
  }
}

.mcp-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  transition: transform 0.2s ease;
  pointer-events: none;

  .mcp-switch.on & {
    transform: translateX(18px);
  }
}

.mcp-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
}

.mcp-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #999;
  &.on {
    background: #22c55e;
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
  }
  &.off {
    background: #bbb;
    box-shadow: none;
  }
}

.mcp-status-agents {
  margin-left: auto;
  color: #16a34a;
  font-weight: 600;
}

.mcp-section {
  margin-top: 12px;
}

.mcp-section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.mcp-hint {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--stay-labelSecondary, #888);
}

.mcp-code {
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  background: var(--stay-backgroundSecondary, #1a1a1a);
  border: 1px solid var(--stay-border, #333);
  font-size: 11px;
  line-height: 1.4;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.mcp-copy-btn {
  margin-top: 8px;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  background: var(--stay-border, #333);
  color: var(--stay-black);
  &:hover {
    filter: brightness(1.08);
  }
}
</style>
