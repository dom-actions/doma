import { readonly, ref } from 'vue';
import { getContext } from '@/services/Context';

export const TOOL_CALL_DETAILS_ENABLED_KEY = 'doma_tool_call_details_enabled';

const enabled = ref(false);
export const toolCallDetailsEnabled = readonly(enabled);

let listening = false;
let revision = 0;
let pendingLoad: Promise<boolean> | null = null;

function listenForChanges(): void {
  if (listening) return;
  getContext().browser.storage.onChanged.addListener((
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !Object.prototype.hasOwnProperty.call(changes, TOOL_CALL_DETAILS_ENABLED_KEY)) return;
    revision++;
    enabled.value = changes[TOOL_CALL_DETAILS_ENABLED_KEY].newValue === true;
  });
  listening = true;
}

/** Default OFF until a strict boolean preference has been read successfully. */
export function loadToolCallDetailsPreference(): Promise<boolean> {
  if (pendingLoad) return pendingLoad;
  pendingLoad = (async () => {
    const loadRevision = revision;
    try {
      listenForChanges();
      const stored = await getContext().browser.storage.local.get(TOOL_CALL_DETAILS_ENABLED_KEY);
      // A newer storage event wins over an older in-flight read.
      if (revision === loadRevision) enabled.value = stored[TOOL_CALL_DETAILS_ENABLED_KEY] === true;
    } catch {
      if (revision === loadRevision) enabled.value = false;
    }
    return enabled.value;
  })().finally(() => {
    pendingLoad = null;
  });
  return pendingLoad;
}

/** Keep the previous UI state on write failure and let the caller report it. */
export async function setToolCallDetailsEnabled(value: boolean): Promise<void> {
  listenForChanges();
  const next = value === true;
  const writeRevision = revision;
  await getContext().browser.storage.local.set({ [TOOL_CALL_DETAILS_ENABLED_KEY]: next });
  if (revision === writeRevision) {
    revision++;
    enabled.value = next;
  }
}
