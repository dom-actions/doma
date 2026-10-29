<template>
  <div v-if="show" class="action-modal" role="dialog" aria-modal="false">
    <button class="action-modal-close" type="button" aria-label="关闭" @click="close">×</button>
    <div class="action-modal-title">
      <template v-for="(part, i) in titleParts" :key="i">
        <a
          v-if="part.kind === 'email'"
          class="action-modal-title-mail"
          :href="`mailto:${part.text}`"
        >{{ part.text }}</a>
        <template v-else>{{ part.text }}</template>
      </template>
    </div>
    <div v-if="inviteCode.trim()" class="action-modal-invite">
      <div class="action-modal-invite-label">{{ inviteLabel }}</div>
      <div class="action-modal-invite-row">
        <div class="action-modal-invite-code">{{ inviteCode }}</div>
        <button
          type="button"
          class="action-modal-invite-copy"
          :aria-label="copied ? t('chat.actionModal.membership.copied') : t('chat.actionModal.membership.copy')"
          @click="onCopy"
        >
          {{ copied ? t('chat.actionModal.membership.copied') : t('chat.actionModal.membership.copy') }}
        </button>
      </div>
    </div>
    <button class="action-modal-btn" type="button" @click="onOk">{{ buttonText }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: "" },
  buttonText: { type: String, default: "确定" },
  /** 可选：大号邀请码（会员到期等） */
  inviteCode: { type: String, default: "" },
  inviteLabel: { type: String, default: "Invite code" },
});

const emit = defineEmits<{
  (e: "update:show", v: boolean): void;
  (e: "action"): void;
  (e: "close"): void;
}>();

const { t } = useI18n();
const copied = ref(false);
let copiedTimer: number | undefined;

type TitlePart = { kind: "text" | "email"; text: string };

const titleParts = computed((): TitlePart[] => {
  const raw = String(props.title ?? "");
  if (!raw) return [];
  const parts: TitlePart[] = [];
  let last = 0;
  for (const m of raw.matchAll(EMAIL_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) {
      parts.push({ kind: "text", text: raw.slice(last, idx) });
    }
    parts.push({ kind: "email", text: m[0]! });
    last = idx + m[0]!.length;
  }
  if (last < raw.length) {
    parts.push({ kind: "text", text: raw.slice(last) });
  }
  return parts.length ? parts : [{ kind: "text", text: raw }];
});

watch(
  () => props.show,
  (open) => {
    if (!open) {
      copied.value = false;
      if (copiedTimer) window.clearTimeout(copiedTimer);
    }
  },
);

async function copyToClipboard(text: string) {
  const value = text ?? "";
  if (!value) return;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // fallback below
  }
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

async function onCopy() {
  const code = props.inviteCode.trim();
  if (!code) return;
  await copyToClipboard(code);
  copied.value = true;
  if (copiedTimer) window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    copied.value = false;
  }, 1200);
}

function close() {
  emit("update:show", false);
  emit("close");
}

function onOk() {
  emit("action");
  emit("update:show", false);
}
</script>

<style scoped lang="less">
.action-modal {
  /* 挂在 `.chat-panel-action-modals`；容器 bottom 已对齐输入上沿 / 面板底 */
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

.action-modal-title-mail {
  color: var(--stay-blue, #337bf6);
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;

  &:hover {
    opacity: 0.85;
  }
}

.action-modal-invite {
  margin-top: 14px;
  padding: 14px 12px 12px;
  border-radius: 12px;
  border: 1.5px solid rgba(54, 116, 239, 0.35);
  background: rgba(54, 116, 239, 0.06);
}

.action-modal-invite-label {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--stay-blue, #337bf6);
}

.action-modal-invite-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.action-modal-invite-code {
  flex: 1;
  min-width: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--stay-black, #2f3134);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-modal-invite-copy {
  flex-shrink: 0;
  margin: 0;
  padding: 4px 10px;
  border: 1px solid rgba(54, 116, 239, 0.45);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--stay-blue, #337bf6);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;

  &:hover {
    background: rgba(54, 116, 239, 0.12);
  }
}

.action-modal-btn {
  margin-top: 14px;
  width: 100%;
  height: 30px;
  border: 0;
  border-radius: 15px;
  background: var(--stay-black);
  color: var(--stay-backgroundSecondary, #fff);
  font-size: 14px;
  font-weight: 600;
  line-height: 30px;
  cursor: pointer;

  &:hover {
    opacity: 0.88;
  }
}

@media (prefers-color-scheme: dark) {
  .action-modal-invite {
    border-color: rgba(54, 116, 239, 0.45);
    background: rgba(54, 116, 239, 0.12);
  }

  .action-modal-invite-copy {
    background: rgba(0, 0, 0, 0.2);
  }
}
</style>
