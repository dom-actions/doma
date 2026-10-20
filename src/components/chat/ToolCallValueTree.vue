<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ToolCallDetailValue } from './chatTypes';
import ToolCallCopyButton from './ToolCallCopyButton.vue';
import ChatChevronForwardSvg from '../../assets/images/chat-chevron-forward.svg';

const props = defineProps<{ label: string; value: ToolCallDetailValue; truncated?: boolean }>();
const { t } = useI18n();
const isObject = computed(() => props.value !== null && typeof props.value === 'object');
const entries = computed(() => isObject.value ? Object.entries(props.value as object) : []);
const scalar = computed(() => isObject.value ? JSON.stringify(props.value) : String(props.value));
const expandable = computed(() => isObject.value ? entries.value.length > 0 : scalar.value.length > 100 || scalar.value.includes('\n'));
const summary = computed(() => {
  const brief = (value: ToolCallDetailValue): string => {
    if (Array.isArray(value)) return t('chat.toolCall.itemCount', { count: value.length });
    if (value !== null && typeof value === 'object') return '{…}';
    return String(value).replace(/\s+/g, ' ').slice(0, 36);
  };
  if (Array.isArray(props.value)) return t('chat.toolCall.itemCount', { count: props.value.length });
  if (isObject.value) return entries.value.slice(0, 2).map(([key, value]) => `${key}: ${brief(value)}`).join(' · ') + (entries.value.length > 2 ? ' …' : '');
  return scalar.value.replace(/\s+/g, ' ').slice(0, 100) + (scalar.value.length > 100 ? '…' : '');
});
</script>

<template>
  <details v-if="expandable" class="tool-value-tree">
    <summary class="tool-copy-row">
      <ChatChevronForwardSvg class="tree-chevron" aria-hidden="true" />
      <span class="tree-main"><span class="tree-label">{{ label }}</span><span class="tree-preview">{{ summary }}</span></span>
      <ToolCallCopyButton :value="value" :truncated="truncated" :label="t('chat.toolCall.copyPart', { name: label })" />
    </summary>
    <div v-if="isObject" class="tree-children">
      <ToolCallValueTree v-for="[key, child] in entries" :key="key" :label="key" :value="child" :truncated="truncated" />
    </div>
    <pre v-else>{{ scalar }}</pre>
  </details>
  <div v-else class="tree-leaf tool-copy-row">
    <span class="tree-label">{{ label }}</span><span class="tree-scalar">{{ scalar }}</span>
    <ToolCallCopyButton :value="value" :truncated="truncated" :label="t('chat.toolCall.copyPart', { name: label })" />
  </div>
</template>

<style scoped lang="less">
.tool-value-tree, .tree-leaf { min-width: 0; margin: 7px 0; font-size: 12px; line-height: 1.6; }
summary { display: grid; grid-template-columns: 10px minmax(0, 1fr) 24px; gap: 6px; align-items: start; list-style: none; cursor: pointer; overflow-wrap: anywhere; }
summary::-webkit-details-marker { display: none; }
.tree-main { min-width: 0; }
.tree-chevron { width: 8px; height: 8px; margin-top: 6px; color: var(--stay-secondaryFont, #777); transition: transform 0.12s ease; }
.tool-value-tree[open] > summary > .tree-chevron { transform: rotate(90deg); }
.tree-label { color: var(--stay-black, #2f3134); margin-right: 8px; font-weight: 500; }
.tree-preview { color: var(--stay-secondaryFont, #777); font-size: 11px; }
.tree-scalar { white-space: pre-wrap; overflow-wrap: anywhere; }
.tree-leaf { display: grid; grid-template-columns: minmax(45px, 80px) minmax(0, 1fr) 24px; gap: 8px; }
.tree-leaf .tree-label { color: var(--stay-secondaryFont, #777); font-weight: 400; overflow-wrap: anywhere; }
.tree-children { margin-left: 4px; padding-left: 10px; border-left: 1px solid var(--stay-border, #dedede); }
pre { margin: 6px 0 6px 16px; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.6 monospace; }
summary:focus-visible { outline: 2px solid var(--stay-primary, #3674ef); outline-offset: 2px; border-radius: 3px; }
</style>
