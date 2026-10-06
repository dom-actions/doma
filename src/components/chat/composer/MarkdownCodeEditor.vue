<template>
  <div ref="hostEl" class="markdown-code-editor" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    readOnly?: boolean;
  }>(),
  { readOnly: false },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const hostEl = ref<HTMLElement | null>(null);
let view: EditorView | null = null;

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--stay-black, #2f3134)", fontWeight: "700" },
  { tag: tags.heading1, color: "var(--stay-black, #2f3134)", fontWeight: "700" },
  { tag: tags.heading2, color: "var(--stay-black, #2f3134)", fontWeight: "700" },
  { tag: tags.heading3, color: "var(--stay-black, #2f3134)", fontWeight: "600" },
  { tag: tags.heading4, color: "var(--stay-black, #444)", fontWeight: "600" },
  { tag: tags.strong, color: "var(--stay-black, #2f3134)", fontWeight: "700" },
  { tag: tags.emphasis, color: "var(--stay-secondaryFont, #555)", fontStyle: "italic" },
  { tag: tags.link, color: "#3674ef", textDecoration: "underline" },
  { tag: tags.url, color: "#3674ef" },
  { tag: tags.monospace, color: "#c0392b", backgroundColor: "color-mix(in srgb, var(--stay-black) 6%, transparent)" },
  { tag: tags.quote, color: "#8a8a8a", fontStyle: "italic" },
  { tag: tags.contentSeparator, color: "#8a8a8a" },
  { tag: tags.meta, color: "#8a8a8a" },
  { tag: tags.processingInstruction, color: "#8a8a8a" },
  { tag: tags.list, color: "#3674ef" },
  { tag: tags.comment, color: "#8a8a8a" },
  { tag: tags.string, color: "var(--stay-black, #2f3134)" },
  { tag: tags.keyword, color: "#3674ef", fontWeight: "600" },
]);

function createEditor(parent: HTMLElement) {
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(),
        history(),
        markdown(),
        syntaxHighlighting(markdownHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            emit("update:modelValue", update.state.doc.toString());
          }
        }),
        EditorView.editable.of(!props.readOnly),
        EditorView.theme({
          "&": {
            display: "flex",
            flexDirection: "column",
            height: "100%",
            maxHeight: "100%",
            fontSize: "13px",
            backgroundColor: "var(--stay-background, #f8f8f6)",
          },
          ".cm-scroller": {
            overflow: "auto",
            minHeight: 0,
            flex: "1 1 auto",
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            lineHeight: "1.5",
          },
          ".cm-gutters": {
            backgroundColor: "color-mix(in srgb, var(--stay-black) 4%, transparent)",
            borderRight: "1px solid var(--stay-border, #e0e0e0)",
            color: "var(--stay-secondaryFont, #8a8a8a)",
          },
          ".cm-content": {
            caretColor: "var(--stay-black, #2f3134)",
          },
          ".cm-line": {
            color: "var(--stay-black, #2f3134)",
          },
          ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--stay-black, #2f3134)",
          },
          "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
            backgroundColor: "rgba(54, 116, 239, 0.18) !important",
          },
          ".cm-activeLine": {
            backgroundColor: "color-mix(in srgb, var(--stay-black) 4%, transparent)",
          },
        }),
      ],
    }),
  });
}

onMounted(() => {
  if (hostEl.value) createEditor(hostEl.value);
});

watch(
  () => props.modelValue,
  (next) => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (next === current) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
    });
  },
);

onUnmounted(() => {
  view?.destroy();
  view = null;
});
</script>

<style scoped lang="less">
.markdown-code-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--stay-border, #d0d0d0);
  border-radius: 8px;
  overflow: hidden;
  box-sizing: border-box;

  :deep(.cm-editor) {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    flex: 1;
  }

  :deep(.cm-scroller) {
    overflow: auto !important;
    min-height: 0;
  }

  :deep(.cm-editor.cm-focused) {
    outline: none;
  }
}
</style>
