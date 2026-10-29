<template>
  <div
    v-if="visible"
    class="action-modal safari-ai-consent-modal"
    role="dialog"
    aria-modal="false"
    @mousedown.stop
  >
    <button
      class="action-modal-close"
      type="button"
      :aria-label="cancelText"
      @mousedown.prevent.stop="onCancel"
    >
      ×
    </button>
    <div class="action-modal-title">{{ title }}</div>
    <div class="action-modal-title safari-ai-consent-body">{{ body }}</div>
    <a
      class="action-modal-title-mail safari-ai-consent-link"
      :href="privacyUrl"
      target="_blank"
      rel="noopener noreferrer"
      @mousedown.stop
      >{{ privacyLinkLabel }}</a
    >
    <div class="safari-ai-consent-actions">
      <!-- Agree 在上（黑主色）；Cancel 在下（白次要） -->
      <button
        class="safari-ai-consent-agree-btn"
        type="button"
        @mousedown.prevent.stop="onAgree"
      >
        {{ agreeText }}
      </button>
      <button
        class="safari-ai-consent-cancel-btn"
        type="button"
        @mousedown.prevent.stop="onCancel"
      >
        {{ cancelText }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SAFARI_AI_PRIVACY_URL } from "@/services/chat/safariAiDataConsent";

defineProps<{
  visible: boolean;
  title: string;
  body: string;
  privacyLinkLabel: string;
  agreeText: string;
  cancelText: string;
}>();

const emit = defineEmits<{
  agree: [];
  cancel: [];
}>();

const privacyUrl = SAFARI_AI_PRIVACY_URL;

function onAgree() {
  emit("agree");
}

function onCancel() {
  emit("cancel");
}
</script>

<style scoped lang="less">
.action-modal {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 0;
  margin-bottom: 0;
  padding: 18px 18px 16px;
  background: var(--stay-backgroundSecondary, #fff);
  border: 1px solid var(--stay-border, #e0e0e0);
  border-radius: 18px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
  z-index: 200;
}

.action-modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: var(--stay-backgroundTertiary, rgba(0, 0, 0, 0.06));
  color: var(--stay-secondaryFont, #666);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: var(--stay-border, rgba(0, 0, 0, 0.1));
    color: var(--stay-black, #333);
  }
}

.action-modal-title {
  padding-right: 36px;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--stay-black);
  letter-spacing: 0.2px;
  white-space: pre-wrap;
}

.safari-ai-consent-body {
  margin-top: 8px;
  padding-right: 0;
  color: var(--stay-secondaryFont, #666);
}

.action-modal-title-mail {
  display: inline-block;
  margin-top: 10px;
  color: var(--stay-blue, #337bf6);
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
  font-size: 14px;

  &:hover {
    opacity: 0.85;
  }
}

.safari-ai-consent-actions {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.safari-ai-consent-agree-btn {
  width: 100%;
  height: 30px;
  border: 0;
  border-radius: 15px;
  background: #2f3134;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  line-height: 30px;
  cursor: pointer;

  &:hover {
    opacity: 0.88;
  }
}

.safari-ai-consent-cancel-btn {
  width: 100%;
  height: 30px;
  border: 1px solid #d8d8d8;
  border-radius: 15px;
  background: #ffffff;
  color: #2f3134;
  font-size: 14px;
  font-weight: 500;
  line-height: 28px;
  cursor: pointer;

  &:hover {
    background: #f5f5f5;
  }
}
</style>
