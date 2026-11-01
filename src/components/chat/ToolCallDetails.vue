<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ChatMessageToolCall } from './chatTypes';
import ToolCallValueTree from './ToolCallValueTree.vue';
import ToolCallCopyButton from './ToolCallCopyButton.vue';
import ChatChevronForwardSvg from '../../assets/images/chat-chevron-forward.svg';

defineProps<{ calls: ChatMessageToolCall[] }>();
const { t } = useI18n();
function status(call: ChatMessageToolCall): string {
  return t(`chat.toolCall.${call.details?.status ?? (call.state === 'doing' ? 'running' : 'unknown')}`);
}
function duration(call: ChatMessageToolCall): string {
  const details = call.details;
  if (details?.startedAt == null || details.finishedAt == null) return '';
  return `${(Math.max(0, details.finishedAt - details.startedAt) / 1000).toFixed(1)}s`;
}
function label(call: ChatMessageToolCall): string {
  const labels: Record<string, string> = {
    browser_execute_script: 'executeScript', browser_get_video_caption: 'getVideoCaption',
    browser_get_clean_html: 'readPage', browser_get_elements: 'readElements', browser_navigate: 'navigate',
  };
  return labels[call.name] ? t(`chat.toolCall.${labels[call.name]}`) : call.name.replace(/^browser_/, '').replace(/_/g, ' ');
}
</script>

<template>
  <ol class="tool-call-tree">
    <li v-for="(call, index) in calls" :key="call.id || `${call.name}-${index}`">
      <details class="tool-call-node">
        <summary class="tool-copy-row">
          <ChatChevronForwardSvg class="tool-node-chevron" aria-hidden="true" />
          <span class="tool-call-labels">
            <span class="tool-number">{{ index + 1 }}.</span>
            <span class="tool-name" :title="call.name">{{ label(call) }}</span>
            <span class="tool-status" :class="`tool-status--${call.details?.status ?? 'unknown'}`">{{ status(call) }}</span>
            <span v-if="duration(call)" class="tool-duration">{{ duration(call) }}</span>
          </span>
          <ToolCallCopyButton :value="call" :label="t('chat.toolCall.copyCall')" />
        </summary>
        <div class="tool-call-branches">
          <div class="tool-identifier tool-copy-row">
            <code>{{ call.name }}</code>
            <ToolCallCopyButton :value="call.name" :label="t('chat.toolCall.copyPart', { name: call.name })" />
          </div>
          <template v-if="call.details">
            <ToolCallValueTree v-if="call.details.input" :label="t('chat.toolCall.parameters')" :value="call.details.input.value" :truncated="call.details.input.truncated" />
            <p v-if="call.details.input?.truncated" class="preview-note">{{ t('chat.toolCall.previewTruncated') }}</p>
            <ToolCallValueTree v-if="call.details.output" :label="t('chat.toolCall.result')" :value="call.details.output.value" :truncated="call.details.output.truncated" />
            <p v-if="call.details.output?.truncated" class="preview-note">{{ t('chat.toolCall.previewTruncated') }}</p>
            <ToolCallValueTree v-if="call.details.error" :label="t('chat.toolCall.errorDetails')" :value="call.details.error.value" :truncated="call.details.error.truncated" />
            <p v-if="call.details.error?.truncated" class="preview-note">{{ t('chat.toolCall.previewTruncated') }}</p>
            <p v-if="call.details.status === 'running' && !call.details.output" class="preview-note">{{ t('chat.toolCall.awaitingResult') }}</p>
          </template>
          <p v-else class="preview-note">{{ t('chat.toolCall.legacyDetails') }}</p>
        </div>
      </details>
    </li>
  </ol>
</template>

<style scoped lang="less">
.tool-call-tree { margin: 8px 0 0; padding: 0; list-style: none; color: var(--stay-black, #2f3134); }
li + li { border-top: 1px solid var(--stay-border, #dedede); }
li { padding: 9px 0; }
summary { display: grid; grid-template-columns: 12px minmax(0, 1fr) 24px; gap: 6px; align-items: start; list-style: none; cursor: pointer; font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
summary::-webkit-details-marker { display: none; }
.tool-call-labels { min-width: 0; }
.tool-node-chevron { width: 10px; height: 10px; margin-top: 7px; color: var(--stay-secondaryFont, #777); transition: transform 0.12s ease; }
.tool-call-node[open] > summary > .tool-node-chevron { transform: rotate(90deg); }
.tool-number, .tool-status, .tool-duration { color: var(--stay-secondaryFont, #777); margin-right: 6px; font-size: 11px; }
.tool-name { margin-right: 10px; font-weight: 500; }
.tool-status--error { color: var(--stay-error, #dc2626); }
.tool-call-branches { min-width: 0; margin: 8px 0 0 15px; padding-left: 10px; border-left: 1px solid var(--stay-border, #dedede); }
.tool-identifier { display: grid; grid-template-columns: minmax(0, 1fr) 24px; gap: 6px; align-items: center; margin-bottom: 8px; color: var(--stay-secondaryFont, #777); font-size: 11px; overflow-wrap: anywhere; }
.preview-note { margin: 5px 0; color: var(--stay-secondaryFont, #777); font-size: 12px; line-height: 1.6; }
summary:focus-visible { outline: 2px solid var(--stay-primary, #3674ef); outline-offset: 2px; border-radius: 3px; }
</style>
