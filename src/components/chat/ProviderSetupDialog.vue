<template>
  <div
    class="provider-setup-overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="t('chat.providerSetup.title')"
    @mousedown.self="closeDialog"
  >
    <div class="provider-setup-dialog">
      <div class="provider-setup-header">
        <button
          v-if="view !== 'main'"
          type="button"
          class="provider-setup-header-back"
          :aria-label="t('chat.providerSetup.back')"
          :title="t('chat.providerSetup.back')"
          @click="onHeaderBack"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M10 3.5L5.5 8 10 12.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <ProviderIcon
          v-if="view === 'editProvider'"
          :provider="editProviderId"
          :size="22"
        />
        <div class="provider-setup-title">{{ headerTitle }}</div>
        <button
          type="button"
          class="provider-setup-close"
          :aria-label="t('chat.providerSetup.close')"
          @click="closeDialog"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4L4 12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <!-- ===== 主视图：搜索 → 可用模型 → 提供商 ===== -->
      <template v-if="view === 'main'">
        <div class="provider-setup-group provider-setup-group--models">
          <div class="provider-setup-search-wrap provider-setup-search-wrap--in-group">
            <input
              v-model="searchQuery"
              type="search"
              class="provider-setup-input provider-setup-input--in-group"
              :placeholder="t('chat.providerSetup.searchPlaceholder')"
              autocomplete="off"
              autofocus
            />
          </div>
          <div class="provider-setup-group-body provider-setup-group-body--models">
            <button
              v-for="item in filteredEnabledModels"
              :key="`${item.provider}::${item.model}`"
              type="button"
              class="provider-setup-row provider-setup-row--in-group"
              :class="{ active: isActiveModel(item.provider, item.model) }"
              @click="onSelectEnabled(item.provider, item.model)"
            >
              <div class="provider-setup-row-main">
                <span class="provider-setup-row-title">{{ item.model }}</span>
                <span class="provider-setup-row-sub">{{
                  t(`chat.providerSetup.providers.${item.provider}`)
                }}</span>
              </div>
              <svg
                v-if="isActiveModel(item.provider, item.model)"
                class="provider-setup-check"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M3.5 8.2L6.4 11.1L12.5 5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <div
              v-if="!filteredEnabledModels.length"
              class="provider-setup-empty provider-setup-empty--in-group"
            >
              {{ t('chat.providerSetup.enabledEmpty') }}
            </div>
          </div>
        </div>

        <div class="provider-setup-section-head">
          <span>{{ t('chat.providerSetup.providersSection') }}</span>
        </div>
        <div class="provider-setup-group">
          <div class="provider-setup-group-body">
            <div
              v-for="pid in configuredProviders"
              :key="pid"
              class="provider-setup-row provider-setup-row--static provider-setup-row--in-group provider-setup-row--provider"
            >
              <ProviderIcon :provider="pid" :size="28" />
              <div class="provider-setup-row-main">
                <span class="provider-setup-row-title">{{
                  t(`chat.providerSetup.providers.${pid}`)
                }}</span>
                <span class="provider-setup-row-sub">{{
                  apiKeyHint(pid)
                }}</span>
              </div>
              <div class="provider-setup-row-actions">
                <button
                  type="button"
                  class="provider-setup-action-btn"
                  @click="openEditProvider(pid)"
                >
                  {{ t('chat.providerSetup.editProvider') }}
                </button>
                <button
                  type="button"
                  class="provider-setup-action-btn provider-setup-action-btn--danger"
                  @click="onRemoveProvider(pid)"
                >
                  {{ t('chat.providerSetup.deleteProvider') }}
                </button>
              </div>
            </div>
            <div
              v-if="!configuredProviders.length"
              class="provider-setup-empty provider-setup-empty--in-group"
            >
              {{ t('chat.providerSetup.noProviders') }}
            </div>
          </div>
          <button
            v-if="addableProviders.length"
            type="button"
            class="provider-setup-add-provider"
            @click="view = 'pickProvider'"
          >
            + {{ t('chat.providerSetup.addProvider') }}
          </button>
        </div>

        <div class="provider-setup-actions provider-setup-actions--main">
          <button type="button" class="provider-setup-btn" @click="closeDialog">
            {{ t('chat.providerSetup.ok') }}
          </button>
        </div>
      </template>

      <!-- ===== 选择要添加的提供商 ===== -->
      <template v-else-if="view === 'pickProvider'">
        <div class="provider-setup-list">
          <button
            v-for="pid in addableProviders"
            :key="pid"
            type="button"
            class="provider-setup-row"
            @click="openEditProvider(pid, true)"
          >
            <ProviderIcon :provider="pid" :size="28" />
            <div class="provider-setup-row-main">
              <span class="provider-setup-row-title">{{
                t(`chat.providerSetup.providers.${pid}`)
              }}</span>
            </div>
            <svg class="provider-setup-chevron-inline" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M4.5 3L7.5 6L4.5 9"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </template>

      <!-- ===== 配置提供商：Key + 模型 Switch 列表 ===== -->
      <template v-else>
        <p class="provider-setup-desc">{{ t('chat.providerSetup.desc') }}</p>

        <template v-if="presets[editProviderId].showBaseUrl">
          <label class="provider-setup-label">{{ t('chat.providerSetup.baseUrl') }}</label>
          <input
            v-model="draftBaseUrl"
            type="text"
            class="provider-setup-input"
            :placeholder="
              presets[editProviderId].defaultBaseUrl ||
              t('chat.providerSetup.baseUrlPlaceholder')
            "
            autocomplete="off"
            @input="onBaseUrlInput"
            @blur="onApiKeyBlur"
          />
        </template>

        <label class="provider-setup-label">{{ t('chat.providerSetup.apiKey') }}</label>
        <div class="provider-setup-apikey-wrap">
          <input
            v-model="draftApiKey"
            :type="showApiKey ? 'text' : 'password'"
            class="provider-setup-input provider-setup-apikey-input"
            :placeholder="
              presets[editProviderId].requireApiKey
                ? t('chat.providerSetup.apiKeyRequired')
                : t('chat.providerSetup.apiKeyOptional')
            "
            autocomplete="off"
            @input="onApiKeyInput"
            @blur="onApiKeyBlur"
            @change="onApiKeyChange"
          />
          <button
            type="button"
            class="provider-setup-apikey-toggle"
            :title="showApiKey ? t('chat.providerSetup.hideApiKey') : t('chat.providerSetup.showApiKey')"
            :aria-label="showApiKey ? t('chat.providerSetup.hideApiKey') : t('chat.providerSetup.showApiKey')"
            @mousedown.prevent
            @click="showApiKey = !showApiKey"
          >
            <svg v-if="!showApiKey" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"
              />
              <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 3l18 18M10.6 10.6A2.5 2.5 0 0012 14.5a2.5 2.5 0 001.4-.4M9.9 5.1A11 11 0 0112 4.8c6.5 0 10 7.2 10 7.2a18 18 0 01-3.2 4.1M6.1 6.1A18 18 0 002 12s3.5 6 10 6c1.2 0 2.3-.2 3.3-.6"
              />
            </svg>
          </button>
        </div>

        <template v-if="presets[editProviderId].showBaseUrl">
          <label class="provider-setup-label">{{ t('chat.providerSetup.manualModel') }}</label>
          <div class="provider-setup-manual-row">
            <input
              v-model="draftManualModel"
              type="text"
              class="provider-setup-input provider-setup-manual-input"
              :placeholder="t('chat.providerSetup.manualModelPlaceholder')"
              autocomplete="off"
              @keydown.enter.prevent="onAddManualModel"
            />
            <button
              type="button"
              class="provider-setup-fetch"
              :disabled="!draftManualModel.trim()"
              @click="onAddManualModel"
            >
              {{ t('chat.providerSetup.addManualModel') }}
            </button>
          </div>
        </template>

        <div class="provider-setup-model-row">
          <span class="provider-setup-label">{{ t('chat.providerSetup.fetchedModels') }}</span>
          <button
            type="button"
            class="provider-setup-fetch"
            :disabled="fetching"
            @click="onFetchModels()"
          >
            {{ fetching ? t('chat.providerSetup.fetching') : t('chat.providerSetup.fetchModels') }}
          </button>
        </div>

        <div class="provider-setup-group provider-setup-group--models">
          <div class="provider-setup-search-wrap provider-setup-search-wrap--in-group">
            <input
              v-model="editSearchQuery"
              type="search"
              class="provider-setup-input provider-setup-input--in-group"
              :placeholder="t('chat.providerSetup.searchPlaceholder')"
              autocomplete="off"
            />
          </div>
          <div class="provider-setup-group-body provider-setup-group-body--switches">
            <div
              v-for="m in filteredFetchedModels"
              :key="m"
              class="provider-setup-row provider-setup-row--static provider-setup-row--switch provider-setup-row--in-group"
            >
              <span class="provider-setup-row-title provider-setup-row-title--mono">{{ m }}</span>
              <button
                type="button"
                class="provider-setup-switch"
                role="switch"
                :aria-checked="isEnabled(editProviderId, m)"
                :class="{ on: isEnabled(editProviderId, m) }"
                @click="toggleModel(editProviderId, m)"
              >
                <span class="provider-setup-switch-knob" />
              </button>
            </div>
            <div
              v-if="!filteredFetchedModels.length && !fetching"
              class="provider-setup-empty provider-setup-empty--in-group"
            >
              {{
                fetchedModelList.length
                  ? t('chat.providerSetup.searchNoMatch')
                  : t('chat.providerSetup.errorEmptyFetch')
              }}
            </div>
          </div>
        </div>

        <p v-if="errorText" class="provider-setup-error">{{ errorText }}</p>
        <p v-if="presets[editProviderId].docsUrl" class="provider-setup-hint">
          <a :href="presets[editProviderId].docsUrl" target="_blank" rel="noopener">
            {{ t('chat.providerSetup.getApiKey') }}
          </a>
        </p>

        <div class="provider-setup-actions">
          <button type="button" class="provider-setup-btn primary" @click="finishEdit">
            {{ t('chat.providerSetup.done') }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  llmManager,
  OPEN_PROVIDER_IDS,
  OPEN_PROVIDER_PRESETS,
  type OpenProviderId,
} from '@/services/chat/llm/entry';
import ProviderIcon from './ProviderIcon.vue';

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const { t } = useI18n();
const presets = OPEN_PROVIDER_PRESETS;

type View = 'main' | 'pickProvider' | 'editProvider';
const view = ref<View>('main');
const searchQuery = ref('');
const editSearchQuery = ref('');
const editProviderId = ref<OpenProviderId>('qwen');
/** 本次从「添加提供商」进入；未真正配置前不进列表 */
const editingIsNew = ref(false);
const draftApiKey = ref('');
const draftBaseUrl = ref('');
const draftManualModel = ref('');
const showApiKey = ref(false);
const fetching = ref(false);
const errorText = ref('');
const fetchedModelList = ref<string[]>([]);
const lastFetchedApiKey = ref('');
const lastFetchedBaseUrl = ref('');
const enabledTick = ref(0);
let autoFetchTimer: ReturnType<typeof setTimeout> | null = null;

const headerTitle = computed(() => {
  if (view.value === 'pickProvider') return t('chat.providerSetup.selectProvider');
  if (view.value === 'editProvider') {
    return t(`chat.providerSetup.providers.${editProviderId.value}`);
  }
  return t('chat.providerSetup.title');
});

function onHeaderBack() {
  if (view.value === 'editProvider') {
    void backFromEdit();
    return;
  }
  view.value = 'main';
}

const configuredProviders = computed(() => {
  enabledTick.value;
  return llmManager.getConfiguredProviders() as OpenProviderId[];
});

const enabledModels = computed(() => {
  enabledTick.value;
  return llmManager.getEnabledModels() as Array<{ provider: OpenProviderId; model: string }>;
});

const filteredEnabledModels = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return enabledModels.value;
  return enabledModels.value.filter(
    (m) =>
      m.model.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q) ||
      t(`chat.providerSetup.providers.${m.provider}`).toLowerCase().includes(q),
  );
});

const addableProviders = computed(() => {
  const have = new Set(configuredProviders.value);
  return OPEN_PROVIDER_IDS.filter((id) => !have.has(id));
});

const filteredFetchedModels = computed(() => {
  const q = editSearchQuery.value.trim().toLowerCase();
  if (!q) return fetchedModelList.value;
  return fetchedModelList.value.filter((m) => m.toLowerCase().includes(q));
});

function bump() {
  enabledTick.value++;
}

function isActiveModel(provider: OpenProviderId, model: string): boolean {
  const cfg = llmManager.getConfig();
  return cfg.provider === provider && cfg.activeModel === model;
}

function isEnabled(provider: OpenProviderId, model: string): boolean {
  enabledTick.value;
  return llmManager.isModelEnabled(provider, model);
}

function apiKeyHint(pid: OpenProviderId): string {
  const key = (llmManager.getConfig().apiKeys[pid] || '').trim();
  if (!key) return t('chat.providerSetup.apiKeyRequired');
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

async function onSelectEnabled(provider: OpenProviderId, model: string) {
  await llmManager.selectEnabledModel(provider, model);
  bump();
  emit('saved');
  emit('close');
}

function openEditProvider(pid: OpenProviderId, isNew = false) {
  editProviderId.value = pid;
  editingIsNew.value = isNew;
  const cfg = llmManager.getConfig();
  draftApiKey.value = cfg.apiKeys[pid] || '';
  draftBaseUrl.value = cfg.baseUrls[pid] || presets[pid].defaultBaseUrl;
  draftManualModel.value = '';
  fetchedModelList.value = [...(cfg.fetchedModels[pid] || [])];
  lastFetchedApiKey.value = draftApiKey.value.trim();
  lastFetchedBaseUrl.value = draftBaseUrl.value.trim();
  editSearchQuery.value = '';
  showApiKey.value = false;
  errorText.value = '';
  view.value = 'editProvider';
  // 新添加：等真正填好 Key（及 Base URL）并保存/拉取后再进 Providers 列表
  if (canAutoFetch() && fetchedModelList.value.length === 0) {
    void onFetchModels({ silentEmpty: true });
  }
}

function isDraftConfigured(pid: OpenProviderId = editProviderId.value): boolean {
  const preset = presets[pid];
  const key = draftApiKey.value.trim();
  const base = (draftBaseUrl.value || preset.defaultBaseUrl).trim();
  if (preset.requireApiKey && !key) return false;
  if (preset.showBaseUrl && !base) return false;
  return true;
}

async function commitProviderIfConfigured() {
  const id = editProviderId.value;
  if (!isDraftConfigured(id)) return false;
  await llmManager.saveConfig({
    apiKeys: { ...llmManager.getConfig().apiKeys, [id]: draftApiKey.value.trim() },
    baseUrls: {
      ...llmManager.getConfig().baseUrls,
      [id]: (draftBaseUrl.value || presets[id].defaultBaseUrl).trim(),
    },
  });
  await llmManager.addConfiguredProvider(id);
  editingIsNew.value = false;
  bump();
  return true;
}

async function backFromEdit() {
  if (autoFetchTimer) {
    clearTimeout(autoFetchTimer);
    autoFetchTimer = null;
  }
  const id = editProviderId.value;
  // 点返回且尚未真正配置：不留在 Providers 列表
  if (editingIsNew.value && !isDraftConfigured(id)) {
    await llmManager.removeConfiguredProvider(id);
  }
  editingIsNew.value = false;
  view.value = 'main';
  bump();
}

async function onRemoveProvider(pid: OpenProviderId) {
  await llmManager.removeConfiguredProvider(pid);
  bump();
  emit('saved');
}

async function finishEdit() {
  if (autoFetchTimer) {
    clearTimeout(autoFetchTimer);
    autoFetchTimer = null;
  }
  const id = editProviderId.value;
  if (!isDraftConfigured(id)) {
    if (editingIsNew.value) {
      await llmManager.removeConfiguredProvider(id);
      editingIsNew.value = false;
      view.value = 'main';
      bump();
      return;
    }
    errorText.value = presets[id].showBaseUrl && !(draftBaseUrl.value || '').trim()
      ? t('chat.providerSetup.errorNeedBaseUrl')
      : t('chat.providerSetup.errorNeedApiKey');
    return;
  }
  await commitProviderIfConfigured();
  view.value = 'main';
  bump();
  emit('saved');
}

function canAutoFetch(): boolean {
  const preset = presets[editProviderId.value];
  const key = draftApiKey.value.trim();
  const base = (draftBaseUrl.value || preset.defaultBaseUrl).trim();
  if (preset.showBaseUrl && !base) return false;
  if (preset.requireApiKey) return !!key;
  return !!(key || base);
}

function onApiKeyInput() {
  if (autoFetchTimer) clearTimeout(autoFetchTimer);
  autoFetchTimer = setTimeout(() => maybeAutoFetchModels(), 450);
}

function onBaseUrlInput() {
  if (autoFetchTimer) clearTimeout(autoFetchTimer);
  autoFetchTimer = setTimeout(() => maybeAutoFetchModels(), 450);
}

function onApiKeyBlur() {
  if (autoFetchTimer) {
    clearTimeout(autoFetchTimer);
    autoFetchTimer = null;
  }
  maybeAutoFetchModels();
}

function onApiKeyChange() {
  maybeAutoFetchModels();
}

function maybeAutoFetchModels() {
  const key = draftApiKey.value.trim();
  const base = (
    draftBaseUrl.value || presets[editProviderId.value].defaultBaseUrl
  ).trim();
  if (!canAutoFetch()) return;
  if (
    key === lastFetchedApiKey.value &&
    base === lastFetchedBaseUrl.value &&
    fetchedModelList.value.length > 0
  ) {
    return;
  }
  void onFetchModels();
}

async function onFetchModels(opts?: { silentEmpty?: boolean }) {
  if (fetching.value) return;
  errorText.value = '';
  const id = editProviderId.value;
  const preset = presets[id];
  if (preset.showBaseUrl && !(draftBaseUrl.value || preset.defaultBaseUrl).trim()) {
    errorText.value = t('chat.providerSetup.errorNeedBaseUrl');
    return;
  }
  if (preset.requireApiKey && !draftApiKey.value.trim()) {
    errorText.value = t('chat.providerSetup.errorNeedApiKey');
    return;
  }
  fetching.value = true;
  try {
    const key = draftApiKey.value.trim();
    const base = (draftBaseUrl.value || preset.defaultBaseUrl).trim();
    await llmManager.saveConfig({
      apiKeys: { ...llmManager.getConfig().apiKeys, [id]: key },
      baseUrls: {
        ...llmManager.getConfig().baseUrls,
        [id]: base,
      },
    });
    await llmManager.addConfiguredProvider(id);
    editingIsNew.value = false;
    const list = await llmManager.fetchModelsForProvider(id);
    fetchedModelList.value = list;
    lastFetchedApiKey.value = key;
    lastFetchedBaseUrl.value = base;
    bump();
    if (!list.length && !opts?.silentEmpty) {
      errorText.value = t('chat.providerSetup.errorEmptyFetch');
    }
  } catch (e) {
    errorText.value = e instanceof Error ? e.message : String(e);
  } finally {
    fetching.value = false;
  }
}

async function onAddManualModel() {
  const id = editProviderId.value;
  const name = draftManualModel.value.trim();
  if (!name) return;
  errorText.value = '';
  if (!isDraftConfigured(id)) {
    errorText.value = presets[id].showBaseUrl && !(draftBaseUrl.value || '').trim()
      ? t('chat.providerSetup.errorNeedBaseUrl')
      : t('chat.providerSetup.errorNeedApiKey');
    return;
  }
  try {
    await commitProviderIfConfigured();
    const added = await llmManager.addCustomModel(id, name);
    if (!added) return;
    if (!fetchedModelList.value.includes(added)) {
      fetchedModelList.value = [...fetchedModelList.value, added];
    }
    draftManualModel.value = '';
    bump();
    emit('saved');
  } catch (e) {
    errorText.value = e instanceof Error ? e.message : String(e);
  }
}

async function toggleModel(provider: OpenProviderId, model: string) {
  if (!isDraftConfigured(provider)) {
    errorText.value = presets[provider].showBaseUrl && !(draftBaseUrl.value || '').trim()
      ? t('chat.providerSetup.errorNeedBaseUrl')
      : t('chat.providerSetup.errorNeedApiKey');
    return;
  }
  await commitProviderIfConfigured();
  const next = !llmManager.isModelEnabled(provider, model);
  await llmManager.setModelEnabled(provider, model, next);
  bump();
  emit('saved');
}

/** 关闭弹窗时：未配置完的新建提供商不留在列表 */
async function closeDialog() {
  if (view.value === 'editProvider' && editingIsNew.value) {
    const id = editProviderId.value;
    if (!isDraftConfigured(id)) {
      await llmManager.removeConfiguredProvider(id);
    }
    editingIsNew.value = false;
  }
  emit('close');
}
</script>

<style scoped lang="less">
.provider-setup-overlay {
  position: fixed;
  inset: 0;
  z-index: 10050;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.provider-setup-dialog {
  position: relative;
  width: min(420px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: var(--stay-background, #f8f8f6);
  color: var(--stay-black, #111);
  border-radius: 12px;
  padding: 14px 18px 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.provider-setup-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  margin-bottom: 12px;
}
.provider-setup-header-back {
  flex-shrink: 0;
  align-self: center;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  line-height: 0;
  &:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.04);
  }
  svg {
    display: block;
  }
}
.provider-setup-close {
  flex-shrink: 0;
  align-self: center;
  margin-left: auto;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  line-height: 0;
  &:hover {
    opacity: 0.9;
    background: rgba(0, 0, 0, 0.04);
  }
  svg {
    display: block;
  }
}
.provider-setup-title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  padding: 0;
  line-height: 1.25;
  display: flex;
  align-items: center;
  align-self: center;
  min-height: 28px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.provider-setup-desc {
  font-size: 12px;
  opacity: 0.75;
  margin: 0 0 12px;
  line-height: 1.4;
}
.provider-setup-label {
  display: block;
  font-size: 12px;
  margin: 10px 0 4px;
  opacity: 0.85;
}
.provider-setup-search-wrap {
  margin: 0;
  padding-right: 0;
  &--in-group {
    margin: 0;
    padding: 10px 10px 8px;
    border-bottom: 1px solid var(--stay-border, rgba(0, 0, 0, 0.08));
    background: transparent;
  }
  &--edit {
    margin: 6px 0 6px;
    padding-right: 0;
  }
}
.provider-setup-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--stay-border, #ddd);
  background: var(--stay-backgroundSecondary, #fff);
  color: inherit;
  font-size: 13px;

  &--in-group {
    border: 1px solid var(--stay-border, #e0e0e0);
    border-radius: 8px;
    background: var(--stay-backgroundSecondary, #fff);
    padding: 8px 10px;
  }

  &[type='search']::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    margin-left: 4px;
    cursor: pointer;
    background-color: var(--stay-black, #2f3134);
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%23000' d='M4.2 3.1 3.1 4.2 6.9 8l-3.8 3.8 1.1 1.1L8 9.1l3.8 3.8 1.1-1.1L9.1 8l3.8-3.8-1.1-1.1L8 6.9 4.2 3.1z'/%3E%3C/svg%3E")
      center / contain no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%23000' d='M4.2 3.1 3.1 4.2 6.9 8l-3.8 3.8 1.1 1.1L8 9.1l3.8 3.8 1.1-1.1L9.1 8l3.8-3.8-1.1-1.1L8 6.9 4.2 3.1z'/%3E%3C/svg%3E")
      center / contain no-repeat;
  }
}
.provider-setup-section-head {
  margin: 14px 0 6px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.8;
}
.provider-setup-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  &--switches {
    max-height: 280px;
    margin-top: 6px;
  }
  &--providers {
    max-height: 160px;
  }
}
.provider-setup-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  padding: 10px 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--stay-backgroundSecondary, #fff);
  color: inherit;
  cursor: pointer;
  &:hover {
    filter: brightness(0.98);
  }
  &.active {
    border-color: color-mix(in srgb, var(--stay-logo, #0d9488) 45%, transparent);
    background: color-mix(in srgb, var(--stay-logo, #0d9488) 10%, var(--stay-backgroundSecondary, #fff));
  }
  &--static {
    cursor: default;
    &:hover {
      filter: none;
      background: var(--stay-backgroundSecondary, #fff);
    }
  }
  &--switch {
    justify-content: space-between;
    .provider-setup-row-title {
      flex: 1;
      min-width: 0;
      margin-right: 12px;
    }
    .provider-setup-switch {
      margin-left: auto;
    }
  }
  &--in-group {
    border-radius: 0;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--stay-border, rgba(0, 0, 0, 0.06));
    &:last-child {
      border-bottom: none;
    }
    &:hover {
      filter: none;
      background: color-mix(in srgb, var(--stay-black, #2f3134) 6%, transparent);
    }
    &.active {
      border-color: transparent;
      border-bottom-color: var(--stay-border, rgba(0, 0, 0, 0.06));
      background: color-mix(
        in srgb,
        var(--stay-logo, #0d9488) 10%,
        var(--stay-backgroundSecondary, #fff)
      );
      box-shadow: inset 2px 0 0 var(--stay-logo, #0d9488);
    }
  }
}
.provider-setup-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.provider-setup-row-title {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  &--mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-weight: 400;
    font-size: 12px;
  }
}
.provider-setup-row-sub {
  font-size: 11px;
  opacity: 0.65;
}
.provider-setup-check {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--stay-logo, #0d9488);
}
.provider-setup-badge {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--stay-logo, #0d9488);
}
.provider-setup-empty {
  padding: 14px 8px;
  font-size: 12px;
  opacity: 0.65;
  text-align: center;
  border-radius: 10px;
  background: var(--stay-backgroundSecondary, #fff);
  &--in-group {
    border-radius: 0;
    background: transparent;
  }
}
.provider-setup-group {
  margin-top: 2px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--stay-background, #f8f8f6);
  border: 1px solid var(--stay-border, rgba(0, 0, 0, 0.08));
  &--models {
    margin-top: 0;
    background: color-mix(
      in srgb,
      var(--stay-black, #2f3134) 8%,
      var(--stay-backgroundSecondary, #fff)
    );
  }
}
.provider-setup-group-body {
  display: flex;
  flex-direction: column;
  max-height: 180px;
  overflow: auto;
  &--models {
    max-height: 220px;
  }
  &--switches {
    max-height: 280px;
  }
}
.provider-setup-add-provider {
  width: 100%;
  margin: 0;
  padding: 11px 10px;
  border: none;
  border-top: 1px solid var(--stay-border, rgba(0, 0, 0, 0.08));
  border-radius: 0;
  background: transparent;
  color: var(--stay-black, #2f3134);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  opacity: 0.85;
  &:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--stay-black, #2f3134) 8%, transparent);
  }
}
.provider-setup-link-btn {
  border: 1px solid var(--stay-border, rgba(0, 0, 0, 0.14));
  background: transparent;
  color: var(--stay-black, #2f3134);
  font-size: 12px;
  cursor: pointer;
  padding: 5px 10px;
  border-radius: 8px;
  flex-shrink: 0;
  opacity: 0.85;
  &:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--stay-black, #2f3134) 8%, transparent);
  }
}
.provider-setup-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}
.provider-setup-row--provider:hover .provider-setup-row-actions,
.provider-setup-row--provider:focus-within .provider-setup-row-actions {
  opacity: 1;
  pointer-events: auto;
}
.provider-setup-action-btn {
  border: none;
  background: transparent;
  color: var(--stay-black, #2f3134);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  &:hover {
    background: color-mix(in srgb, var(--stay-black, #2f3134) 10%, transparent);
  }
  &--danger {
    color: #c0392b;
    &:hover {
      background: rgba(192, 57, 43, 0.08);
    }
  }
}
.provider-setup-chevron-inline {
  width: 12px;
  height: 12px;
  opacity: 0.5;
  flex-shrink: 0;
}
.provider-setup-apikey-wrap {
  position: relative;
  display: block;
}
.provider-setup-apikey-input {
  padding-right: 36px;
}
.provider-setup-manual-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.provider-setup-manual-input {
  flex: 1;
  min-width: 0;
}
.provider-setup-apikey-toggle {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  padding: 4px;
  margin: 0;
  cursor: pointer;
  color: inherit;
  opacity: 0.55;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  &:hover {
    opacity: 0.9;
    background: rgba(0, 0, 0, 0.04);
  }
}
.provider-setup-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  .provider-setup-label {
    margin: 0;
  }
}
.provider-setup-fetch {
  border: none;
  background: transparent;
  color: var(--stay-blue, #2563eb);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
.provider-setup-switch {
  position: relative;
  width: 40px;
  height: 24px;
  border-radius: 999px;
  border: none;
  padding: 0;
  background: rgba(0, 0, 0, 0.18);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
  &.on {
    background: var(--stay-logo, #0d9488);
  }
}
.provider-setup-switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease;
  .provider-setup-switch.on & {
    transform: translateX(16px);
  }
}
.provider-setup-error {
  color: #c0392b;
  font-size: 12px;
  margin: 8px 0 0;
}
.provider-setup-hint {
  font-size: 12px;
  margin: 8px 0 0;
  a {
    color: var(--stay-blue, #2563eb);
  }
}
.provider-setup-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  &--main {
    justify-content: stretch;
    .provider-setup-btn {
      width: 100%;
      background: var(--stay-primary, #2f3134);
      color: #fff;
      border-color: transparent;
      padding: 10px 14px;
      font-weight: 600;
      &:hover {
        filter: brightness(1.06);
      }
    }
  }
}
.provider-setup-btn {
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid var(--stay-border, #ddd);
  &.primary {
    background: var(--stay-primary, #2f3134);
    color: #fff;
    border-color: transparent;
    &:hover {
      filter: brightness(1.06);
    }
  }
}

@media (prefers-color-scheme: dark) {
  .provider-setup-header-back:hover,
  .provider-setup-close:hover,
  .provider-setup-apikey-toggle:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .provider-setup-row:not(.provider-setup-row--in-group):not(.provider-setup-row--static):hover {
    filter: brightness(1.08);
  }
}
</style>
