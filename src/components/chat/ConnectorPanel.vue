<template>
  <div class="connector-panel">
    <div class="connector-tabs" role="tablist">
      <button
        type="button"
        class="connector-tab"
        role="tab"
        :aria-selected="tab === 'mcp'"
        :class="{ active: tab === 'mcp' }"
        @click="tab = 'mcp'"
      >
        {{ t("chat.connector.tabMcp") }}
      </button>
      <button
        type="button"
        class="connector-tab"
        role="tab"
        :aria-selected="tab === 'cli'"
        :class="{ active: tab === 'cli' }"
        @click="tab = 'cli'"
      >
        {{ t("chat.connector.tabCliRunner") }}
      </button>
    </div>

    <div class="connector-body">
      <McpProviderPanel
        v-show="tab === 'mcp'"
        :open="open && tab === 'mcp'"
        @bridge-enabled-change="(v) => emit('bridge-enabled-change', v)"
        @direct-control-change="(v) => emit('direct-control-change', v)"
        @bridge-ensure="emit('bridge-ensure')"
      />
      <CliRunnerPanel
        v-show="tab === 'cli'"
        :open="open && tab === 'cli'"
        @cli-bridge-enabled-change="(v) => emit('cli-bridge-enabled-change', v)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import McpProviderPanel from "@/components/chat/McpProviderPanel.vue";
import CliRunnerPanel from "@/components/chat/CliRunnerPanel.vue";

defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "bridge-enabled-change", enabled: boolean): void;
  (e: "direct-control-change", enabled: boolean): void;
  (e: "cli-bridge-enabled-change", enabled: boolean): void;
  (e: "bridge-ensure"): void;
}>();

const { t } = useI18n();
const tab = ref<"mcp" | "cli">("mcp");
</script>

<style scoped lang="less">
.connector-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* header 面板外层 overflow:hidden，内容超高时必须在此限高并滚动 */
  max-height: min(420px, 55vh);
}

.connector-tabs {
  flex: 0 0 auto;
  display: flex;
  gap: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--stay-border, #333);
}

.connector-tab {
  flex: 1;
  border: none;
  background: transparent;
  padding: 10px 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  color: var(--stay-labelSecondary, #888);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;

  &.active {
    color: var(--stay-black);
    border-bottom-color: var(--stay-primary, #2f3134);
  }
}

.connector-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  /* scroll：有溢出时始终露出滚动条，提示还可往下看 */
  overflow-y: scroll;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--stay-black) 35%, transparent)
    color-mix(in srgb, var(--stay-border, #d0d0d0) 55%, transparent);

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    margin: 4px 0;
    background: color-mix(in srgb, var(--stay-border, #d0d0d0) 55%, transparent);
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--stay-black) 35%, transparent);
    border-radius: 4px;

    &:hover {
      background: color-mix(in srgb, var(--stay-black) 55%, transparent);
    }
  }
}
</style>
