<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { assetBase, hostState, sendWindowAction } from "../../overlayClient";
import { useSfcComponent, withRev } from "../../composables/useSfcComponent";
import { useI18n } from "../../../composables/useI18n";
import { windowBus } from "../appsState";
import type { WindowDescriptor } from "../types";
import type { OverlayInput } from "../../rive";
import type { Size } from "../windowGeometry";

const props = defineProps<{ descriptor: WindowDescriptor; size: Size; focused: boolean }>();

const { t } = useI18n();

const data = ref<Record<string, unknown>>({});
const url = computed(() => withRev(assetBase() + props.descriptor.viewUrl));
const { comp, loadError } = useSfcComponent(url);

// The folder of the view file, so the view builds image URLs as an overlay does.
const assetBaseUrl = computed(() => assetBase() + props.descriptor.viewUrl.replace(/\/[^/]*$/, ""));

/** What a view knows about its window, beside the overlay props. */
const windowProp = computed(() => ({
  id: props.descriptor.windowId,
  focused: props.focused,
  maximized: props.descriptor.maximized,
  size: props.size,
}));

function emitAction(action: string, payload?: unknown): void {
  sendWindowAction(props.descriptor.windowId, action, payload);
}

function onData(inputs: Record<string, OverlayInput>): void {
  for (const [path, input] of Object.entries(inputs)) {
    if (input.t === "json") data.value[path] = input.v;
  }
}

onData(props.descriptor.inputs ?? {});
windowBus.on(props.descriptor.windowId, onData);

onBeforeUnmount(() => {
  windowBus.off(props.descriptor.windowId, onData);
});
</script>

<template>
  <component
    :is="comp"
    v-if="comp"
    :data="data"
    :state="hostState"
    :interactive="true"
    :emit-action="emitAction"
    :asset-base="assetBaseUrl"
    :window="windowProp"
  />
  <p v-else-if="loadError" class="view-note error">{{ t("stageapps.window.loadError", { error: loadError }) }}</p>
  <p v-else class="view-note">{{ t("stageapps.window.loading") }}</p>
</template>

<style scoped>
.view-note {
  margin: 0;
  padding: var(--space-3);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.view-note.error {
  color: var(--error-highlight);
}
</style>
