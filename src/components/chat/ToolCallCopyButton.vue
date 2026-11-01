<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ChatCopySvg from '../../assets/images/chat-copy.svg';
import ChatCheckmarkSvg from '../../assets/images/chat-checkmark.svg';

const props = defineProps<{ value: unknown; label: string; truncated?: boolean }>();
const { t } = useI18n();
const feedback = ref<'copied' | 'failed' | null>(null);
let resetTimer: ReturnType<typeof setTimeout> | undefined;
const title = computed(() => feedback.value === 'copied' ? t('chat.toolCall.copiedPart')
  : feedback.value === 'failed' ? t('chat.toolCall.copyFailed') : props.label);

/** Copy saved values only; strings stay useful as text and truncated previews retain their marker. */
function serializedValue(): string {
  if (props.truncated) return JSON.stringify({ value: props.value, truncated: true }, null, 2);
  return typeof props.value === 'string' ? props.value : JSON.stringify(props.value, null, 2) ?? 'null';
}
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* Some extension/browser contexts require the existing textarea fallback. */ }
  const previousFocus = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try { return document.execCommand('copy'); }
  catch { return false; }
  finally {
    textarea.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
}
async function onCopy(event: MouseEvent | KeyboardEvent): Promise<void> {
  if ('repeat' in event && event.repeat) return;
  if (resetTimer) clearTimeout(resetTimer);
  try { feedback.value = await writeClipboard(serializedValue()) ? 'copied' : 'failed'; }
  catch { feedback.value = 'failed'; }
  resetTimer = setTimeout(() => { feedback.value = null; }, 1800);
}
onBeforeUnmount(() => { if (resetTimer) clearTimeout(resetTimer); });
</script>

<template>
  <span class="tool-row-copy" :class="{ 'has-feedback': feedback }">
    <button
      type="button"
      class="tool-part-copy-btn"
      :class="{ 'copy-failed': feedback === 'failed' }"
      :title="title"
      :aria-label="title"
      @click.stop.prevent="onCopy"
      @keydown.enter.stop.prevent="onCopy"
      @keydown.space.stop.prevent="onCopy"
      @keyup.enter.stop.prevent
      @keyup.space.stop.prevent
    >
      <ChatCheckmarkSvg v-if="feedback === 'copied'" class="copy-icon" aria-hidden="true" />
      <span v-else-if="feedback === 'failed'" class="copy-failure-mark" aria-hidden="true">!</span>
      <ChatCopySvg v-else class="copy-icon" aria-hidden="true" />
    </button>
    <span class="copy-status" role="status" aria-live="polite">{{ feedback ? title : '' }}</span>
  </span>
</template>

<style scoped lang="less">
.tool-row-copy { display: inline-flex; justify-self: end; align-self: start; width: 24px; opacity: 0; transition: opacity 0.12s ease; }
:global(.tool-copy-row:hover > .tool-row-copy),
:global(.tool-copy-row:focus-within > .tool-row-copy),
.tool-row-copy.has-feedback { opacity: 1; }
.tool-part-copy-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 4px; border: 0; border-radius: 4px; background: transparent; color: var(--stay-secondaryFont, #777); cursor: pointer; }
.tool-part-copy-btn:hover { color: var(--stay-black, #2f3134); }
.tool-part-copy-btn:focus-visible { outline: 2px solid var(--stay-primary, #3674ef); outline-offset: 1px; }
.tool-part-copy-btn.copy-failed { color: var(--stay-error, #dc2626); }
.copy-icon { width: 13px; height: 13px; }
.copy-failure-mark { font-size: 15px; font-weight: 600; line-height: 1; }
.copy-status { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (hover: none), (pointer: coarse) { .tool-row-copy { opacity: 1; } }
</style>
