<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  clearWorkspaceRoot,
  copyWorkspaceEntry,
  createWorkspaceDirectory,
  ensureWorkspacePermission,
  ensureWorkspaceRoot,
  listWorkspaceEntries,
  loadWorkspaceRoot,
  loadWorkspaceRootPath,
  moveWorkspaceEntry,
  pickWorkspaceDirectory,
  removeWorkspaceEntry,
  renameWorkspaceEntry,
  saveWorkspaceRootPath,
  writeBlobIntoDirectory,
  type WorkspaceEntry,
} from "@/services/workspace/workspaceFs";
import {
  fetchCliRunnerHealth,
  joinWorkspaceAbsPath,
  revealPathInFileManager,
} from "@/services/cliRunner/cliRunnerClient";

type Crumb = {
  name: string;
  handle: FileSystemDirectoryHandle;
};

type ClipboardPayload = {
  mode: "copy" | "cut";
  entry: WorkspaceEntry;
  sourceDir: FileSystemDirectoryHandle;
};

type CtxMenuState = {
  x: number;
  y: number;
  entry: WorkspaceEntry | null;
};

const { t } = useI18n();

const root = ref<FileSystemDirectoryHandle | null>(null);
const stack = ref<Crumb[]>([]);
const entries = ref<WorkspaceEntry[]>([]);
const loading = ref(true);
const errorMsg = ref("");
const selectedName = ref<string | null>(null);
const clipboard = ref<ClipboardPayload | null>(null);
const ctxMenu = ref<CtxMenuState | null>(null);
const statusHint = ref("");
const dragOver = ref(false);
const importing = ref(false);
const rootAbsPath = ref<string | null>(null);
let dragDepth = 0;

const currentDir = computed(() => {
  if (stack.value.length) return stack.value[stack.value.length - 1].handle;
  return root.value;
});

const pathLabel = computed(() => {
  if (!root.value) return "";
  const names = stack.value.map((c) => c.name);
  return [root.value.name, ...names].join(" / ");
});

const selectedEntry = computed(() => {
  if (!selectedName.value) return null;
  return entries.value.find((e) => e.name === selectedName.value) ?? null;
});

const canPaste = computed(() => !!clipboard.value && !!currentDir.value);

/** Relative segments under workspace root for current directory (empty = root). */
const currentRelativeParts = computed(() => stack.value.map((c) => c.name));

watch(
  () => t("workspace.pageTitle"),
  (title) => {
    document.title = String(title);
  },
  { immediate: true },
);

function closeCtxMenu() {
  ctxMenu.value = null;
}

function onDocumentClick() {
  closeCtxMenu();
}

async function refreshList() {
  const dir = currentDir.value;
  if (!dir) {
    entries.value = [];
    return;
  }
  loading.value = true;
  errorMsg.value = "";
  try {
    entries.value = await listWorkspaceEntries(dir);
  } catch (e: any) {
    errorMsg.value = e?.message || t("workspace.errorReadDir");
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

async function bootstrap() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const handle = await loadWorkspaceRoot();
    if (!handle) {
      root.value = null;
      stack.value = [];
      entries.value = [];
      return;
    }
    const ok = await ensureWorkspacePermission(handle);
    if (!ok) {
      root.value = null;
      stack.value = [];
      entries.value = [];
      errorMsg.value = t("workspace.errorNeedReauth");
      return;
    }
    root.value = handle;
    stack.value = [];
    rootAbsPath.value = await loadWorkspaceRootPath();
    await refreshList();
  } catch (e: any) {
    errorMsg.value = e?.message || t("workspace.errorLoad");
  } finally {
    loading.value = false;
  }
}

async function onAuthorize() {
  errorMsg.value = "";
  const handle = await ensureWorkspaceRoot();
  if (!handle) return;
  root.value = handle;
  stack.value = [];
  selectedName.value = null;
  rootAbsPath.value = await loadWorkspaceRootPath();
  if (!rootAbsPath.value) {
    void promptSetLocalPath();
  }
  await refreshList();
}

async function onChangeFolder() {
  const handle = await pickWorkspaceDirectory();
  if (!handle) return;
  root.value = handle;
  stack.value = [];
  selectedName.value = null;
  clipboard.value = null;
  rootAbsPath.value = await loadWorkspaceRootPath();
  if (!rootAbsPath.value) {
    void promptSetLocalPath();
  }
  await refreshList();
}

async function onDisconnect() {
  await clearWorkspaceRoot();
  root.value = null;
  stack.value = [];
  entries.value = [];
  selectedName.value = null;
  clipboard.value = null;
  rootAbsPath.value = null;
  errorMsg.value = "";
  statusHint.value = "";
}

async function promptSetLocalPath() {
  const initial = rootAbsPath.value || "";
  const next = window.prompt(t("workspace.setLocalPathPrompt"), initial);
  if (next == null) return;
  const trimmed = next.trim();
  if (!trimmed) return;
  try {
    await saveWorkspaceRootPath(trimmed);
    rootAbsPath.value = trimmed;
    statusHint.value = t("workspace.localPathSet");
    errorMsg.value = "";
  } catch (e: any) {
    errorMsg.value = e?.message || t("workspace.errorRevealNeedPath");
  }
}

async function ensureRootAbsPath(): Promise<string | null> {
  if (rootAbsPath.value) return rootAbsPath.value;
  const loaded = await loadWorkspaceRootPath();
  if (loaded) {
    rootAbsPath.value = loaded;
    return loaded;
  }
  await promptSetLocalPath();
  return rootAbsPath.value;
}

async function onReveal(entry?: WorkspaceEntry | null) {
  closeCtxMenu();
  errorMsg.value = "";
  const rootPath = await ensureRootAbsPath();
  if (!rootPath) {
    errorMsg.value = t("workspace.errorRevealNeedPath");
    return;
  }

  const health = await fetchCliRunnerHealth();
  if (!health.running) {
    errorMsg.value = t("workspace.errorRevealRunnerOff");
    return;
  }

  const target = entry ?? selectedEntry.value;
  const parts = [...currentRelativeParts.value];
  if (target) parts.push(target.name);
  const abs = joinWorkspaceAbsPath(rootPath, parts);
  const result = await revealPathInFileManager(abs);
  if (!result.ok) {
    if (result.error === "runner_offline") {
      errorMsg.value = t("workspace.errorRevealRunnerOff");
    } else {
      errorMsg.value = result.detail || result.error || t("workspace.errorRevealFailed");
    }
    return;
  }
  statusHint.value = t("workspace.revealInFinder");
}

async function onNewFolder() {
  closeCtxMenu();
  const dir = currentDir.value;
  if (!dir) return;
  const name = window.prompt(
    t("workspace.newFolderPrompt"),
    t("workspace.newFolderDefault"),
  );
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  errorMsg.value = "";
  try {
    await createWorkspaceDirectory(dir, trimmed);
    selectedName.value = trimmed;
    await refreshList();
  } catch (e: any) {
    if (e?.name === "TypeMismatchError" || /already exists|exists/i.test(String(e?.message))) {
      errorMsg.value = t("workspace.errorFolderExists");
    } else {
      errorMsg.value = e?.message || t("workspace.errorCreateFolder");
    }
  }
}

function onSelect(entry: WorkspaceEntry) {
  selectedName.value = entry.name;
}

function openCtxMenu(e: MouseEvent, entry: WorkspaceEntry | null) {
  e.preventDefault();
  e.stopPropagation();
  if (entry) selectedName.value = entry.name;
  const pad = 8;
  const menuW = 188;
  const menuH = entry ? 260 : 120;
  let x = e.clientX;
  let y = e.clientY;
  if (x + menuW > window.innerWidth - pad) x = window.innerWidth - menuW - pad;
  if (y + menuH > window.innerHeight - pad) y = window.innerHeight - menuH - pad;
  ctxMenu.value = { x, y, entry };
}

async function onOpen(entry: WorkspaceEntry) {
  closeCtxMenu();
  selectedName.value = entry.name;
  if (entry.kind === "directory") {
    stack.value = [
      ...stack.value,
      { name: entry.name, handle: entry.handle as FileSystemDirectoryHandle },
    ];
    await refreshList();
    return;
  }
  try {
    const file = await (entry.handle as FileSystemFileHandle).getFile();
    const url = URL.createObjectURL(file);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e: any) {
    errorMsg.value = e?.message || t("workspace.errorOpenFile");
  }
}

async function onRename(entry?: WorkspaceEntry | null) {
  closeCtxMenu();
  const target = entry ?? selectedEntry.value;
  const dir = currentDir.value;
  if (!target || !dir) return;
  const name = window.prompt(t("workspace.renamePrompt"), target.name);
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed || trimmed === target.name) return;
  errorMsg.value = "";
  try {
    const next = await renameWorkspaceEntry(dir, target, trimmed);
    selectedName.value = next;
    await refreshList();
  } catch (e: any) {
    if (/already exists|exists/i.test(String(e?.message))) {
      errorMsg.value = t("workspace.errorNameExists");
    } else {
      errorMsg.value = e?.message || t("workspace.errorRename");
    }
  }
}

async function onDelete(entry?: WorkspaceEntry | null) {
  closeCtxMenu();
  const target = entry ?? selectedEntry.value;
  const dir = currentDir.value;
  if (!target || !dir) return;
  if (!window.confirm(t("workspace.deleteConfirm", { name: target.name }))) return;
  errorMsg.value = "";
  try {
    await removeWorkspaceEntry(dir, target.name, target.kind);
    if (selectedName.value === target.name) selectedName.value = null;
    if (clipboard.value?.entry.name === target.name && clipboard.value.sourceDir === dir) {
      clipboard.value = null;
      statusHint.value = "";
    }
    await refreshList();
  } catch (e: any) {
    errorMsg.value = e?.message || t("workspace.errorDelete");
  }
}

function onCopy(entry?: WorkspaceEntry | null) {
  closeCtxMenu();
  const target = entry ?? selectedEntry.value;
  const dir = currentDir.value;
  if (!target || !dir) return;
  clipboard.value = { mode: "copy", entry: target, sourceDir: dir };
  statusHint.value = t("workspace.clipboardCopy", { name: target.name });
}

function onCut(entry?: WorkspaceEntry | null) {
  closeCtxMenu();
  const target = entry ?? selectedEntry.value;
  const dir = currentDir.value;
  if (!target || !dir) return;
  clipboard.value = { mode: "cut", entry: target, sourceDir: dir };
  statusHint.value = t("workspace.clipboardCut", { name: target.name });
}

async function onPaste() {
  closeCtxMenu();
  const clip = clipboard.value;
  const dir = currentDir.value;
  if (!clip || !dir) return;
  errorMsg.value = "";
  try {
    let nextName: string;
    if (clip.mode === "copy") {
      nextName = await copyWorkspaceEntry(clip.entry, dir);
    } else {
      nextName = await moveWorkspaceEntry(clip.sourceDir, clip.entry, dir);
      clipboard.value = null;
      statusHint.value = "";
    }
    selectedName.value = nextName;
    await refreshList();
  } catch (e: any) {
    errorMsg.value = e?.message || t("workspace.errorPaste");
  }
}

function hasFileDrag(e: DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

function onDragEnter(e: DragEvent) {
  if (!root.value || !hasFileDrag(e)) return;
  e.preventDefault();
  dragDepth += 1;
  dragOver.value = true;
}

function onDragOver(e: DragEvent) {
  if (!root.value || !hasFileDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  dragOver.value = true;
}

function onDragLeave(e: DragEvent) {
  if (!root.value || !hasFileDrag(e)) return;
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragOver.value = false;
}

async function onDropFiles(e: DragEvent) {
  e.preventDefault();
  dragDepth = 0;
  dragOver.value = false;
  closeCtxMenu();

  const dir = currentDir.value;
  if (!root.value || !dir) return;

  const list = e.dataTransfer?.files;
  if (!list?.length) return;

  const files = Array.from(list).filter((f) => f && f.name);
  if (!files.length) return;

  importing.value = true;
  errorMsg.value = "";
  statusHint.value = t("workspace.dropImporting");
  let lastName = "";
  let okCount = 0;
  try {
    for (const file of files) {
      lastName = await writeBlobIntoDirectory(dir, file, file.name);
      okCount += 1;
    }
    if (lastName) selectedName.value = lastName;
    statusHint.value = t("workspace.dropImported", { n: okCount });
    await refreshList();
  } catch (err: any) {
    errorMsg.value = err?.message || t("workspace.errorDrop");
    statusHint.value = "";
    if (okCount > 0) await refreshList();
  } finally {
    importing.value = false;
  }
}

async function goUp() {
  closeCtxMenu();
  if (!stack.value.length) return;
  stack.value = stack.value.slice(0, -1);
  selectedName.value = null;
  await refreshList();
}

async function goCrumb(index: number) {
  closeCtxMenu();
  if (index < 0) {
    stack.value = [];
  } else {
    stack.value = stack.value.slice(0, index + 1);
  }
  selectedName.value = null;
  await refreshList();
}

function extHint(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0) return "";
  return name.slice(i + 1).slice(0, 4).toUpperCase();
}

function onKeydown(e: KeyboardEvent) {
  if (!root.value) return;
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  const meta = e.metaKey || e.ctrlKey;
  if (meta && e.key.toLowerCase() === "c") {
    e.preventDefault();
    onCopy();
    return;
  }
  if (meta && e.key.toLowerCase() === "x") {
    e.preventDefault();
    onCut();
    return;
  }
  if (meta && e.key.toLowerCase() === "v") {
    e.preventDefault();
    void onPaste();
    return;
  }
  if (e.key === "F2") {
    e.preventDefault();
    void onRename();
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedEntry.value) {
      e.preventDefault();
      void onDelete();
    }
  }
}

onMounted(() => {
  void bootstrap();
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div class="finder" @contextmenu.prevent="openCtxMenu($event, null)">
    <header class="finder-toolbar">
      <div class="finder-nav">
        <button
          type="button"
          class="nav-btn"
          :disabled="!stack.length"
          :title="t('workspace.goUp')"
          @click="goUp"
        >
          ←
        </button>
        <div v-if="root" class="crumbs">
          <button type="button" class="crumb" @click="goCrumb(-1)">
            {{ root.name }}
          </button>
          <template v-for="(c, i) in stack" :key="i">
            <span class="crumb-sep">/</span>
            <button type="button" class="crumb" @click="goCrumb(i)">
              {{ c.name }}
            </button>
          </template>
        </div>
        <div v-else class="crumbs muted">{{ t("workspace.unauthorized") }}</div>
      </div>
      <div class="finder-actions">
        <button v-if="root" type="button" class="tool-btn" @click="onNewFolder">
          {{ t("workspace.newFolder") }}
        </button>
        <button
          v-if="root && canPaste"
          type="button"
          class="tool-btn"
          @click="onPaste"
        >
          {{ t("workspace.paste") }}
        </button>
        <button v-if="root" type="button" class="tool-btn" @click="refreshList">
          {{ t("workspace.refresh") }}
        </button>
        <button v-if="root" type="button" class="tool-btn" @click="onReveal()">
          {{ t("workspace.revealInFinder") }}
        </button>
        <button v-if="root" type="button" class="tool-btn" @click="promptSetLocalPath">
          {{ t("workspace.setLocalPath") }}
        </button>
        <button v-if="root" type="button" class="tool-btn" @click="onChangeFolder">
          {{ t("workspace.changeFolder") }}
        </button>
        <button v-if="root" type="button" class="tool-btn danger" @click="onDisconnect">
          {{ t("workspace.disconnect") }}
        </button>
        <button v-if="!root" type="button" class="tool-btn primary" @click="onAuthorize">
          {{ t("workspace.selectFolder") }}
        </button>
      </div>
    </header>

    <div v-if="errorMsg" class="finder-banner">{{ errorMsg }}</div>

    <main
      class="finder-body"
      :class="{ 'drop-target': dragOver && !!root }"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDropFiles"
    >
      <div v-if="dragOver && root" class="drop-overlay" aria-hidden="true">
        {{ t("workspace.dropHint") }}
      </div>

      <div v-if="!root && !loading" class="empty-auth">
        <div class="empty-folder-icon" aria-hidden="true" />
        <h1>{{ t("workspace.title") }}</h1>
        <p>{{ t("workspace.description") }}</p>
        <button type="button" class="auth-btn" @click="onAuthorize">
          {{ t("workspace.selectWorkspaceFolder") }}
        </button>
      </div>

      <div v-else-if="loading" class="empty-auth muted">{{ t("workspace.loading") }}</div>

      <div v-else-if="!entries.length" class="empty-auth muted">
        <p>{{ t("workspace.emptyFolder") }}</p>
        <p class="path-hint">{{ pathLabel }}</p>
        <p class="path-hint">{{ t("workspace.dropHint") }}</p>
        <button type="button" class="auth-btn" @click="onNewFolder">
          {{ t("workspace.newFolder") }}
        </button>
      </div>

      <div v-else class="icon-grid">
        <button
          v-for="entry in entries"
          :key="entry.name"
          type="button"
          class="icon-item"
          :class="{
            selected: selectedName === entry.name,
            dimmed:
              clipboard?.mode === 'cut' &&
              clipboard.entry.name === entry.name &&
              clipboard.sourceDir === currentDir,
          }"
          :title="entry.name"
          @click.stop="onSelect(entry)"
          @dblclick.stop="onOpen(entry)"
          @contextmenu="openCtxMenu($event, entry)"
        >
          <div class="icon-visual">
            <div v-if="entry.kind === 'directory'" class="folder-glyph" />
            <div v-else class="file-glyph">
              <span v-if="extHint(entry.name)" class="file-ext">{{ extHint(entry.name) }}</span>
            </div>
          </div>
          <span class="icon-label">{{ entry.name }}</span>
        </button>
      </div>
    </main>

    <footer v-if="root" class="finder-status">
      <span>{{ t("workspace.itemsCount", { n: entries.length }) }}</span>
      <span v-if="importing" class="status-hint">{{ t("workspace.dropImporting") }}</span>
      <span v-else-if="statusHint" class="status-hint">{{ statusHint }}</span>
      <span v-else-if="pathLabel" class="status-path">{{ pathLabel }}</span>
    </footer>

    <div
      v-if="ctxMenu && root"
      class="ctx-menu"
      :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
      @click.stop
    >
      <template v-if="ctxMenu.entry">
        <button type="button" class="ctx-item" @click="onOpen(ctxMenu.entry!)">
          {{ t("workspace.open") }}
        </button>
        <button type="button" class="ctx-item" @click="onReveal(ctxMenu.entry)">
          {{ t("workspace.revealInFinder") }}
        </button>
        <div class="ctx-sep" />
        <button type="button" class="ctx-item" @click="onCut(ctxMenu.entry)">
          {{ t("workspace.cut") }}
        </button>
        <button type="button" class="ctx-item" @click="onCopy(ctxMenu.entry)">
          {{ t("workspace.copy") }}
        </button>
        <button
          type="button"
          class="ctx-item"
          :disabled="!canPaste"
          @click="onPaste"
        >
          {{ t("workspace.paste") }}
        </button>
        <div class="ctx-sep" />
        <button type="button" class="ctx-item" @click="onRename(ctxMenu.entry)">
          {{ t("workspace.rename") }}
        </button>
        <button type="button" class="ctx-item danger" @click="onDelete(ctxMenu.entry)">
          {{ t("workspace.delete") }}
        </button>
      </template>
      <template v-else>
        <button type="button" class="ctx-item" @click="onReveal()">
          {{ t("workspace.revealInFinder") }}
        </button>
        <button
          type="button"
          class="ctx-item"
          :disabled="!canPaste"
          @click="onPaste"
        >
          {{ t("workspace.paste") }}
        </button>
        <button type="button" class="ctx-item" @click="onNewFolder">
          {{ t("workspace.newFolder") }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.finder {
  --finder-bg: #ececec;
  --finder-toolbar: #f6f6f6;
  --finder-border: rgba(0, 0, 0, 0.1);
  --finder-select: color-mix(in srgb, var(--stay-primary, #2f3134) 16%, transparent);
  --finder-control-bg: #fff;
  --finder-control-hover: #fafafa;
  --finder-hover-bg: rgba(0, 0, 0, 0.04);
  --finder-drop-bg: rgba(255, 255, 255, 0.72);
  --finder-menu-bg: rgba(246, 246, 246, 0.82);
  --finder-menu-border: rgba(0, 0, 0, 0.12);
  --finder-menu-text: rgba(0, 0, 0, 0.85);
  --finder-menu-separator: rgba(0, 0, 0, 0.1);
  --finder-primary-bg: var(--stay-primary, #2f3134);
  --finder-primary-text: var(--stay-white, #fff);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--finder-bg);
  color: var(--stay-black, #1d1d1f);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue",
    "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  position: relative;
}

.finder-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: var(--finder-toolbar);
  border-bottom: 1px solid var(--finder-border);
  position: sticky;
  top: 0;
  z-index: 2;
}

.finder-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.nav-btn {
  width: 28px;
  height: 24px;
  border: 1px solid var(--finder-border);
  border-radius: 6px;
  background: var(--finder-control-bg);
  color: var(--stay-black, #1d1d1f);
  cursor: pointer;
  line-height: 1;
}

.nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.crumbs.muted {
  color: var(--stay-secondaryFont, #86868b);
}

.crumb {
  border: none;
  background: transparent;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
  color: inherit;
  font: inherit;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crumb:hover {
  background: var(--finder-hover-bg);
}

.crumb-sep {
  color: var(--stay-secondaryFont, #86868b);
}

.finder-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.tool-btn {
  border: 1px solid var(--finder-border);
  background: var(--finder-control-bg);
  color: var(--stay-black, #1d1d1f);
  border-radius: 6px;
  padding: 4px 10px;
  font: inherit;
  cursor: pointer;
}

.tool-btn:hover {
  background: var(--finder-control-hover);
}

.tool-btn.primary,
.auth-btn {
  background: var(--finder-primary-bg);
  color: var(--finder-primary-text);
  border-color: transparent;
}

.tool-btn.primary:hover,
.auth-btn:hover {
  filter: brightness(1.08);
}

.tool-btn.danger {
  color: var(--stay-error, #ff3b30);
}

.finder-banner {
  padding: 8px 14px;
  background: #fff3cd;
  color: #6b5300;
  border-bottom: 1px solid #ffe08a;
}

.finder-body {
  flex: 1;
  padding: 20px 16px 40px;
  position: relative;
}

.finder-body.drop-target {
  outline: 2px dashed color-mix(in srgb, var(--stay-logo, #0d9488) 55%, transparent);
  outline-offset: -10px;
  background: color-mix(in srgb, var(--stay-logo, #0d9488) 8%, transparent);
}

.drop-overlay {
  position: absolute;
  inset: 12px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  border-radius: 12px;
  background: var(--finder-drop-bg);
  color: var(--stay-black, #1d1d1f);
  font-size: 15px;
  font-weight: 560;
  letter-spacing: 0.01em;
}

.empty-auth {
  max-width: 360px;
  margin: 12vh auto 0;
  text-align: center;
  color: var(--stay-black, #1d1d1f);
}

.empty-auth.muted {
  color: var(--stay-secondaryFont, #86868b);
}

.empty-auth h1 {
  font-size: 22px;
  font-weight: 600;
  margin: 12px 0 8px;
}

.empty-auth p {
  margin: 0 0 16px;
  color: var(--stay-secondaryFont, #6e6e73);
  line-height: 1.45;
}

.path-hint {
  font-size: 12px;
}

.auth-btn {
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}

.empty-folder-icon {
  width: 70px;
  height: 56px;
  margin: 0 auto;
  border-radius: 0 8px 8px 8px;
  background: linear-gradient(180deg, #5ac8fa 0%, #32a5f3 100%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  position: relative;
}

.empty-folder-icon::before {
  content: "";
  position: absolute;
  left: 0;
  top: -10px;
  width: 32px;
  height: 14px;
  border-radius: 5px 5px 0 0;
  background: #64d2ff;
  box-shadow: 0 2px 0 #64d2ff;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px 4px;
  align-content: start;
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 6px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: default;
  color: inherit;
  font: inherit;
  min-width: 0;
}

.icon-item:hover {
  background: var(--finder-hover-bg);
}

.icon-item.selected {
  background: var(--finder-select);
}

.icon-item.dimmed {
  opacity: 0.45;
}

.icon-visual {
  width: 100%;
  height: 66px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: visible;
}

.folder-glyph {
  width: 70px;
  height: 48px;
  border-radius: 0 6px 6px 6px;
  background: linear-gradient(180deg, #6ed0ff 0%, #32a5f3 55%, #1f8fd8 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  position: relative;
  flex-shrink: 0;
}

.folder-glyph::before {
  content: "";
  position: absolute;
  left: 0;
  top: -8px;
  width: 28px;
  height: 12px;
  border-radius: 4px 4px 0 0;
  background: #7ad6ff;
  box-shadow: 0 2px 0 #7ad6ff;
}

.file-glyph {
  width: 48px;
  height: 58px;
  border-radius: 4px;
  background: linear-gradient(180deg, #ffffff 0%, #f2f2f7 100%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 8px;
}

.file-glyph::before {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  border-style: solid;
  border-width: 0 12px 12px 0;
  border-color: transparent #d1d1d6 #d1d1d6 transparent;
  border-bottom-left-radius: 2px;
}

.file-ext {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #8e8e93;
}

.icon-label {
  width: 100%;
  height: 2.6em;
  text-align: center;
  font-size: 12px;
  line-height: 1.3;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.finder-status {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px;
  border-top: 1px solid var(--finder-border);
  background: var(--finder-toolbar);
  color: var(--stay-secondaryFont, #6e6e73);
  font-size: 12px;
}

.status-path,
.status-hint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.ctx-menu {
  position: fixed;
  z-index: 50;
  min-width: 160px;
  padding: 5px;
  /* 接近 macOS 菜单：浅灰 + 毛玻璃，避免纯白过亮 */
  background: var(--finder-menu-bg);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border: 0.5px solid var(--finder-menu-border);
  border-radius: 10px;
  box-shadow:
    0 0 0 0.5px rgba(0, 0, 0, 0.04),
    0 10px 30px rgba(0, 0, 0, 0.18),
    0 2px 6px rgba(0, 0, 0, 0.08);
}

.ctx-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 5px 10px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  color: var(--finder-menu-text);
}

.ctx-item:hover:not(:disabled) {
  background: var(--finder-primary-bg);
  color: var(--finder-primary-text);
}

.ctx-item:disabled {
  opacity: 0.35;
  cursor: default;
}

.ctx-item.danger {
  color: var(--stay-error, #ff3b30);
}

.ctx-item.danger:hover:not(:disabled) {
  background: var(--stay-error, #ff3b30);
  color: #fff;
}

.ctx-sep {
  height: 1px;
  margin: 5px 8px;
  background: var(--finder-menu-separator);
}

@media (prefers-color-scheme: dark) {
  .finder {
    --finder-bg: #131313;
    --finder-toolbar: #1c1c1c;
    --finder-border: rgba(255, 255, 255, 0.14);
    --finder-select: color-mix(in srgb, var(--stay-logo, #2dd4bf) 26%, transparent);
    --finder-control-bg: #252525;
    --finder-control-hover: #303030;
    --finder-hover-bg: rgba(255, 255, 255, 0.08);
    --finder-drop-bg: rgba(28, 28, 28, 0.88);
    --finder-menu-bg: rgba(35, 35, 35, 0.9);
    --finder-menu-border: rgba(255, 255, 255, 0.16);
    --finder-menu-text: var(--stay-black, #dcdcdc);
    --finder-menu-separator: rgba(255, 255, 255, 0.12);
    --finder-primary-bg: #fff;
    --finder-primary-text: #111;
  }

  .tool-btn.primary:hover,
  .auth-btn:hover {
    filter: brightness(0.92);
  }

  .finder-banner {
    background: #3a3117;
    color: #ffe59a;
    border-bottom-color: #675521;
  }
}
</style>

<style>
html,
body,
#app {
  margin: 0;
  min-height: 100%;
  background: #ececec;
}

@media (prefers-color-scheme: dark) {
  html,
  body,
  #app {
    background: #131313;
  }
}
</style>
