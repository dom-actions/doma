<template>
  <span
    class="provider-icon"
    :class="`provider-icon--${provider}`"
    :style="{ width: size + 'px', height: size + 'px' }"
    aria-hidden="true"
  >
    <img :src="src" alt="" class="provider-icon-img" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OpenProviderId } from '@/services/chat/llm/entry';
import qwenIcon from '@/assets/images/providers/qwen.svg?url';
import deepseekIcon from '@/assets/images/providers/deepseek.svg?url';
import siliconflowIcon from '@/assets/images/providers/siliconflow.svg?url';
import openaiIcon from '@/assets/images/providers/openai.svg?url';
import relayIcon from '@/assets/images/providers/relay.svg?url';
import anthropicIcon from '@/assets/images/providers/anthropic.svg?url';

const ICONS: Record<OpenProviderId, string> = {
  openai: openaiIcon,
  qwen: qwenIcon,
  deepseek: deepseekIcon,
  siliconflow: siliconflowIcon,
  relay: relayIcon,
  anthropic: anthropicIcon,
};

const props = withDefaults(
  defineProps<{
    provider: OpenProviderId;
    size?: number;
  }>(),
  { size: 28 },
);

const src = computed(() => ICONS[props.provider]);
</script>

<style scoped lang="less">
.provider-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  overflow: hidden;
  line-height: 0;
  background: var(--stay-backgroundSecondary, #fff);
  border: 1px solid var(--stay-border, rgba(0, 0, 0, 0.06));
  box-sizing: border-box;
}

.provider-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  padding: 4px;
  box-sizing: border-box;
}

@media (prefers-color-scheme: dark) {
  .provider-icon--openai .provider-icon-img,
  .provider-icon--relay .provider-icon-img,
  .provider-icon--anthropic .provider-icon-img {
    filter: brightness(0) invert(1);
  }
}
</style>
