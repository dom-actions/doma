<template>
  <Teleport to="body">
    <div v-if="visible" class="add-skill-overlay" @mousedown.self="onCancel">
      <div class="add-skill-dialog" role="dialog" aria-modal="true" :aria-label="title">
        <div class="add-skill-header">
          <h2 class="add-skill-title">{{ title }}</h2>
          <button type="button" class="add-skill-close" aria-label="关闭" @click="onCancel">×</button>
        </div>

        <div class="add-skill-body">
          <label class="add-skill-field">
            <span class="add-skill-label">{{ nameLabel }}</span>
            <input
              v-model="name"
              type="text"
              class="add-skill-input"
              :placeholder="namePlaceholder"
              spellcheck="false"
              autocomplete="off"
            />
            <span v-if="nameError" class="add-skill-error">{{ nameError }}</span>
          </label>

          <label class="add-skill-field">
            <span class="add-skill-label">{{ descriptionLabel }}</span>
            <textarea
              v-model="description"
              class="add-skill-textarea"
              rows="3"
              :placeholder="descriptionPlaceholder"
              spellcheck="false"
            />
          </label>

          <label class="add-skill-checkbox-row">
            <input v-model="allowModelRoute" type="checkbox" class="add-skill-checkbox" />
            <span class="add-skill-checkbox-text">{{ allowModelRouteLabel }}</span>
          </label>

          <div class="add-skill-field add-skill-field--editor">
            <span class="add-skill-label">{{ bodyLabel }}</span>
            <MarkdownCodeEditor v-model="body" class="add-skill-editor" />
          </div>

          <p v-if="submitError" class="add-skill-error add-skill-error--block">{{ submitError }}</p>
        </div>

        <div class="add-skill-footer">
          <div v-if="mode === 'edit'" class="add-skill-footer-delete">
            <button
              type="button"
              class="add-skill-btn add-skill-btn--danger"
              :disabled="saving || deleting"
              @click="onDelete"
            >
              {{ deleting ? deletingText : deleteText }}
            </button>
          </div>
          <div class="add-skill-footer-actions">
            <button
              type="button"
              class="add-skill-btn add-skill-btn--ghost"
              :disabled="saving || deleting || exporting"
              @click="onExport"
            >
              {{ exporting ? exportingText : exportText }}
            </button>
            <button type="button" class="add-skill-btn add-skill-btn--ghost" @click="onCancel">
              {{ cancelText }}
            </button>
            <button
              type="button"
              class="add-skill-btn add-skill-btn--primary"
              :disabled="saving || deleting"
              @click="onSubmit"
            >
              {{ saving ? savingText : saveText }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import MarkdownCodeEditor from "./MarkdownCodeEditor.vue";
import {
  DEFAULT_SKILL_BODY_TEMPLATE,
  isValidSkillName,
  normalizeSkillName,
} from "@/services/chat/skills/skillComposer";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    mode?: "create" | "edit";
    title?: string;
    nameLabel?: string;
    namePlaceholder?: string;
    allowModelRouteLabel?: string;
    descriptionLabel?: string;
    descriptionPlaceholder?: string;
    bodyLabel?: string;
    cancelText?: string;
    saveText?: string;
    savingText?: string;
    deleteText?: string;
    deletingText?: string;
    exportText?: string;
    exportingText?: string;
    saving?: boolean;
    deleting?: boolean;
    exporting?: boolean;
    submitError?: string;
    initialName?: string;
    initialAllowModelRoute?: boolean;
    initialDescription?: string;
    initialBody?: string;
  }>(),
  {
    mode: "create",
    title: "Add Skill",
    nameLabel: "Name",
    namePlaceholder: "my-skill",
    allowModelRouteLabel: "允许模型自主路由调用",
    descriptionLabel: "Description",
    descriptionPlaceholder: "What it does, when to use it, and applicable sites…",
    bodyLabel: "SKILL.md",
    cancelText: "取消",
    saveText: "保存",
    savingText: "保存中…",
    deleteText: "删除",
    deletingText: "删除中…",
    exportText: "导出",
    exportingText: "导出中…",
    saving: false,
    deleting: false,
    exporting: false,
    submitError: "",
    initialName: "",
    initialAllowModelRoute: false,
    initialDescription: "",
    initialBody: "",
  },
);

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "cancel"): void;
  (
    e: "save",
    payload: { name: string; allowModelRoute: boolean; description: string; body: string },
  ): void;
  (e: "delete"): void;
  (
    e: "export",
    payload: { name: string; allowModelRoute: boolean; description: string; body: string },
  ): void;
}>();

const name = ref("");
const allowModelRoute = ref(false);
const description = ref("");
const body = ref(DEFAULT_SKILL_BODY_TEMPLATE);
const nameError = ref("");

function resetForm() {
  if (props.mode === "edit") {
    name.value = props.initialName;
    allowModelRoute.value = props.initialAllowModelRoute;
    description.value = props.initialDescription ?? "";
    body.value = props.initialBody || DEFAULT_SKILL_BODY_TEMPLATE;
  } else {
    name.value = props.initialName?.trim() ?? "";
    allowModelRoute.value = props.initialAllowModelRoute ?? false;
    description.value = props.initialDescription?.trim() ?? "";
    body.value = props.initialBody?.trim() ? props.initialBody : DEFAULT_SKILL_BODY_TEMPLATE;
  }
  nameError.value = "";
}

watch(
  () => props.visible,
  (open) => {
    if (open) resetForm();
  },
);

watch(
  () =>
    [
      props.mode,
      props.initialName,
      props.initialAllowModelRoute,
      props.initialDescription,
      props.initialBody,
    ] as const,
  () => {
    if (props.visible) resetForm();
  },
);

watch(name, () => {
  if (nameError.value) nameError.value = "";
});

function onCancel() {
  emit("update:visible", false);
  emit("cancel");
}

function onDelete() {
  emit("delete");
}

function onExport() {
  const normalized = normalizeSkillName(name.value);
  if (!isValidSkillName(normalized)) {
    nameError.value = "仅小写字母、数字、连字符，且不能以连字符开头或结尾";
    return;
  }
  if (!body.value.trim()) {
    nameError.value = "";
    return;
  }
  emit("export", {
    name: normalized,
    allowModelRoute: allowModelRoute.value,
    description: description.value.trim(),
    body: body.value,
  });
}

function onSubmit() {
  const normalized = normalizeSkillName(name.value);
  if (!isValidSkillName(normalized)) {
    nameError.value = "仅小写字母、数字、连字符，且不能以连字符开头或结尾";
    return;
  }
  if (!body.value.trim()) {
    nameError.value = "";
    return;
  }
  emit("save", {
    name: normalized,
    allowModelRoute: allowModelRoute.value,
    description: description.value.trim(),
    body: body.value,
  });
}
</script>

<style scoped lang="less">
.add-skill-overlay {
  position: fixed;
  inset: 0;
  z-index: 10020;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 12px;
  background: rgba(0, 0, 0, 0.42);
  box-sizing: border-box;
}

.add-skill-dialog {
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  height: 70vh;
  max-height: 70vh;
  border-radius: 14px;
  border: 1px solid var(--stay-border, #37372f);
  background: var(--stay-background, #f8f8f6);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.add-skill-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--stay-border, #e0e0e0);
}

.add-skill-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--stay-black, #2f3134);
}

.add-skill-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: rgba(47, 49, 52, 0.06);
  color: var(--stay-secondaryFont, #8a8a8a);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: rgba(47, 49, 52, 0.1);
    color: var(--stay-black, #2f3134);
  }
}

.add-skill-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 14px 18px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.add-skill-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;

  &--editor {
    flex: 1 1 280px;
    min-height: 0;
    overflow: hidden;
  }
}

.add-skill-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--stay-black, #2f3134);
}

.add-skill-input {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--stay-border, #d0d0d0);
  border-radius: 8px;
  background: var(--stay-backgroundSecondary, #fff);
  color: var(--stay-black, #2f3134);
  font-size: 14px;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--stay-black, #2f3134);
  }
}

.add-skill-textarea {
  width: 100%;
  min-height: 72px;
  padding: 8px 12px;
  border: 1px solid var(--stay-border, #d0d0d0);
  border-radius: 8px;
  background: var(--stay-backgroundSecondary, #fff);
  color: var(--stay-black, #2f3134);
  font-size: 13px;
  line-height: 1.45;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: var(--stay-black, #2f3134);
  }
}

.add-skill-checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.add-skill-checkbox {
  position: relative;
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  flex-shrink: 0;
  cursor: pointer;
  vertical-align: middle;

  &::after {
    position: absolute;
    inset: 0;
    display: block;
    content: "";
    border-radius: 4px;
    box-sizing: border-box;
    border: 1px solid var(--stay-border, #d0d0d0);
    background: var(--stay-backgroundSecondary, #fff);
  }

  &:checked::after {
    content: "\2713";
    display: inline-block;
    text-align: center;
    font-size: 12px;
    line-height: 14px;
    font-weight: 700;
    color: #fff;
    border-color: var(--stay-primary, #3674ef);
    background: var(--stay-primary, #3674ef);
  }

  &:focus-visible::after {
    outline: 2px solid rgba(54, 116, 239, 0.35);
    outline-offset: 1px;
  }
}

.add-skill-checkbox-text {
  font-size: 13px;
  line-height: 1.45;
  color: var(--stay-black, #2f3134);
}

.add-skill-editor {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.add-skill-error {
  font-size: 12px;
  color: #c0392b;

  &--block {
    margin: 0;
  }
}

.add-skill-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--stay-border, #e0e0e0);
  flex-shrink: 0;
  container-type: inline-size;
  container-name: add-skill-footer;
}

/* 宽屏：Delete 靠左，右侧 Export/Cancel/Save */
.add-skill-footer-delete {
  margin-right: auto;
  display: flex;
  justify-content: flex-end;
}

.add-skill-footer-actions {
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* 窄屏：Delete 单独一行且右对齐，下面一行仍是 Export/Cancel/Save */
@container add-skill-footer (max-width: 400px) {
  .add-skill-footer-delete {
    flex: 1 0 100%;
    width: 100%;
    margin-right: 0;
    justify-content: flex-end;
  }

  .add-skill-footer-actions {
    flex: 1 0 100%;
    width: 100%;
  }
}

.add-skill-btn {
  box-sizing: border-box;
  width: 88px;
  min-width: 88px;
  height: 34px;
  padding: 0 12px;
  flex: 0 0 88px;
  white-space: nowrap;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;

  &--ghost {
    background: transparent;
    border-color: var(--stay-border, #d0d0d0);
    color: var(--stay-black, #2f3134);
  }

  &--primary {
    background: var(--stay-black, #2f3134);
    color: #fff;

    &:disabled {
      opacity: 0.55;
      cursor: wait;
    }
  }

  &--danger {
    background: transparent;
    border-color: var(--stay-error, #ff4d4f);
    color: var(--stay-error, #ff4d4f);

    &:disabled {
      opacity: 0.55;
      cursor: wait;
    }
  }
}
</style>
