<template>
  <section class="activity-trace" :class="`activity-trace--${trace.status}`">
    <button
      type="button"
      class="activity-trace__header"
      :aria-expanded="trace.expanded"
      :aria-controls="bodyId"
      @click="emit('toggle')"
    >
      <span
        class="activity-trace__status-dot"
        :class="`activity-trace__status-dot--${trace.status}`"
        aria-hidden="true"
      ></span>
      <span class="activity-trace__title" aria-live="polite">{{ title }}</span>
      <ChatChevronForwardSvg
        class="activity-trace__chevron"
        :class="{ 'activity-trace__chevron--expanded': trace.expanded }"
        aria-hidden="true"
      />
    </button>

    <Transition name="activity-trace-body">
      <div v-if="trace.expanded" :id="bodyId" class="activity-trace__body">
        <div v-if="trace.items.length === 0" class="activity-trace__empty">
          <span class="activity-trace__marker activity-trace__marker--running" aria-hidden="true"></span>
          <span>{{ t('chat.activity.waiting') }}</span>
        </div>
        <ol v-else class="activity-trace__list">
          <li
            v-for="item in trace.items"
            :key="item.id"
            class="activity-trace__item"
            :class="`activity-trace__item--${item.status}`"
          >
            <span
              class="activity-trace__marker"
              :class="`activity-trace__marker--${item.status}`"
              aria-hidden="true"
            ></span>
            <div class="activity-trace__item-content">
              <pre v-if="item.kind === 'reasoning'" class="activity-trace__reasoning">{{ item.text }}</pre>
              <span v-else>{{ item.text }}</span>
              <a
                v-if="item.url"
                class="activity-trace__link"
                :href="item.url"
                target="_blank"
                rel="noopener noreferrer"
              >{{ displayUrl(item.url) }}</a>
            </div>
          </li>
        </ol>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { TurnActivityTrace } from "./chatTypes";
import ChatChevronForwardSvg from "@/assets/images/chat-chevron-forward.svg";

const props = defineProps<{
  trace: TurnActivityTrace;
}>();

const emit = defineEmits<{
  toggle: [];
}>();

const { t } = useI18n();

const bodyId = computed(() => `activity-trace-${props.trace.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`);

const title = computed(() => {
  if (props.trace.status === "running") {
    return t(`chat.activity.${props.trace.phase}`);
  }
  if (props.trace.status === "error") return t("chat.activity.error");
  if (props.trace.status === "stopped") return t("chat.activity.stopped");
  const elapsedMs = Math.max(0, (props.trace.finishedAt ?? Date.now()) - props.trace.startedAt);
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  return t("chat.activity.completed", { seconds });
});

function displayUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname || value;
  } catch {
    return value;
  }
}
</script>

<style scoped lang="less">
.activity-trace {
  width: 100%;
  color: var(--stay-black, #2f3134);
  margin: 0 0 10px;
}

.activity-trace__header {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  max-width: 100%;
  gap: 6px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.activity-trace__header:focus-visible {
  outline: 2px solid var(--stay-primary, #3674ef);
  outline-offset: 3px;
  border-radius: 4px;
}

.activity-trace__status-dot {
  width: 11px;
  height: 11px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--stay-secondaryFont, #8a8a8a);
  opacity: 0.5;
  transform: scale(0.82);
}

.activity-trace__status-dot--running {
  background: var(--stay-black, #2f3134);
  animation: activity-trace-pulse 1.05s ease-in-out infinite;
}

.activity-trace__status-dot--error {
  background: var(--stay-error, #dc2626);
  opacity: 0.75;
}

.activity-trace__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--stay-secondaryFont, #8a8a8a);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
}

.activity-trace__chevron {
  width: 8px;
  height: 11px;
  flex: 0 0 auto;
  color: var(--stay-secondaryFont, #8a8a8a);
  opacity: 0.72;
  transition: transform 0.18s ease;
}

.activity-trace__chevron--expanded {
  transform: rotate(90deg);
}

.activity-trace__body {
  position: relative;
  max-height: min(35vh, 300px);
  margin: 5px 0 2px 8px;
  padding: 2px 0 2px 18px;
  overflow: auto;
  color: var(--stay-secondaryFont, #777);
  scrollbar-width: thin;
}

.activity-trace__body::before {
  content: "";
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 4px;
  width: 1px;
  background: var(--stay-border, #dedede);
}

.activity-trace__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.activity-trace__item,
.activity-trace__empty {
  position: relative;
  min-height: 18px;
  font-size: 13px;
  line-height: 1.55;
}

.activity-trace__marker {
  position: absolute;
  top: 7px;
  left: -17px;
  width: 7px;
  height: 7px;
  box-sizing: border-box;
  border-radius: 50%;
  background: var(--stay-secondaryFont, #8a8a8a);
  box-shadow: 0 0 0 3px var(--stay-background, #fff);
}

.activity-trace__marker--running {
  background: var(--stay-primary, #3674ef);
  animation: activity-trace-pulse 1.15s ease-in-out infinite;
}

.activity-trace__marker--error {
  background: var(--stay-error, #dc2626);
}

.activity-trace__item-content {
  min-width: 0;
  word-break: break-word;
}

.activity-trace__reasoning {
  margin: 0;
  color: inherit;
  font: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

.activity-trace__link {
  display: block;
  width: fit-content;
  max-width: 100%;
  margin-top: 2px;
  overflow: hidden;
  color: var(--stay-black, #2f3134);
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: underline;
  text-decoration-color: var(--stay-border, #cfcfcf);
  text-underline-offset: 2px;
}

.activity-trace-body-enter-active,
.activity-trace-body-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.activity-trace-body-enter-from,
.activity-trace-body-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

@keyframes activity-trace-pulse {
  0%, 100% { opacity: 0.45; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .activity-trace__status-dot--running,
  .activity-trace__marker--running,
  .activity-trace__chevron,
  .activity-trace-body-enter-active,
  .activity-trace-body-leave-active {
    animation: none;
    transition: none;
  }
}
</style>
