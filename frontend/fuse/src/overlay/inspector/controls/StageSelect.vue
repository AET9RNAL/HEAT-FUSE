<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import Icons from "../../../components/Icons.vue";
import { Dynamics } from "../../../composables/useMotion";
import type { Option } from "../types";

const props = withDefaults(
  defineProps<{
    modelValue: unknown;
    options: (Option & { group?: string })[];
    searchable?: boolean;
    disabled?: boolean;
    placeholder?: string;
  }>(),
  { searchable: false, disabled: false, placeholder: "—" },
);

const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

// A ref on a motion component resolves to the instance, so unwrap to the node.
const el = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
function rootEl(): HTMLElement | null {
  const v = el.value;
  if (!v) return null;
  return (v instanceof HTMLElement ? v : v.$el) ?? null;
}

const open = ref(false);
const query = ref("");
const menuStyle = ref<Record<string, string>>({});

const selected = computed(() => props.options.find((o) => o.value === props.modelValue));
const label = computed(() => selected.value?.label ?? props.placeholder);

const filtered = computed(() => {
  if (!props.searchable || !query.value) return props.options;
  const q = query.value.toLowerCase();
  return props.options.filter((o) => o.label.toLowerCase().includes(q));
});

//teleport ts so it can't be clipped
function place(): void {
  const box = rootEl()?.getBoundingClientRect();
  if (!box) return;
  const MAX_H = 240;
  const below = box.bottom + MAX_H < window.innerHeight;
  menuStyle.value = {
    left: `${box.left}px`,
    width: `${box.width}px`,
    top: below ? `${box.bottom + 2}px` : "",
    bottom: below ? "" : `${window.innerHeight - box.top + 2}px`,
    maxHeight: `${MAX_H}px`,
  };
}

function toggle(): void {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) {
    query.value = "";
    place();
  }
}

function pick(o: Option): void {
  emit("update:modelValue", o.value);
  open.value = false;
}

function onDocDown(e: MouseEvent): void {
  const t = e.target as HTMLElement;
  if (!t.closest(".stage-select") && !t.closest(".stage-select-menu")) open.value = false;
}

function track(): void {
  if (open.value) place();
}

watch(open, (v) => {
  if (v) {
    setTimeout(() => document.addEventListener("mousedown", onDocDown), 0);
    window.addEventListener("scroll", track, true);
    window.addEventListener("resize", track);
  } else {
    document.removeEventListener("mousedown", onDocDown);
    window.removeEventListener("scroll", track, true);
    window.removeEventListener("resize", track);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocDown);
  window.removeEventListener("scroll", track, true);
  window.removeEventListener("resize", track);
});
</script>

<template>
  <motion.div
    ref="el"
    class="stage-select"
    :class="{ open, disabled }"
    :initial="false"
    :animate="{ borderColor: open ? 'var(--accent-200)' : 'var(--base-600)' }"
    :transition="Dynamics.quick"
    @click="toggle"
  >
    <span class="sel-label">{{ label }}</span>
    <motion.span
      class="sel-caret"
      :initial="false"
      :animate="{ rotate: open ? 180 : 0 }"
      :transition="Dynamics.snappy"
    >
      <Icons kind="chevron-down" size="small" color="var(--ico)" />
    </motion.span>

    <Teleport to="body">
      <AnimatePresence>
        <motion.div
          v-if="open"
          class="stage-select-menu stage-ui"
          :style="menuStyle"
          :initial="{ opacity: 0, y: -4 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0, y: -4 }"
          :transition="Dynamics.quick"
        >
          <input
            v-if="searchable"
            v-model="query"
            class="menu-search"
            type="text"
            placeholder="Search"
            @click.stop
          />
          <button
            v-for="o in filtered"
            :key="String(o.value)"
            type="button"
            class="menu-item"
            :class="{ active: o.value === modelValue }"
            @click.stop="pick(o)"
          >{{ o.label }}</button>
          <div v-if="!filtered.length" class="menu-empty">No matches</div>
        </motion.div>
      </AnimatePresence>
    </Teleport>
  </motion.div>
</template>

<style scoped>
.stage-select {
  --ico: var(--text-muted);
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 26px;
  padding: 0 var(--space-2);
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  cursor: pointer;
  user-select: none;
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.stage-select:hover { --ico: var(--text-main); }
.stage-select.open { --ico: var(--accent-200); }

.sel-label {
  flex: 1;
  min-width: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sel-caret {
  flex: none;
  display: flex;
  line-height: 0;
}

.stage-select.disabled {
  opacity: 0.4;
  pointer-events: none;
}
</style>

<style>
/* Unscoped: the menu is teleported out of this component's tree. */
/* Above the App's modals (the plugin config panel is 1000), under its tooltip (100000). */
.stage-select-menu {
  position: fixed;
  z-index: 99990;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: var(--space-0);
  box-sizing: border-box;
  background: hsla(142, 1%, 6%, 0.97);
  border: 1px solid var(--base-600);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
  scrollbar-width: thin;
  scrollbar-color: var(--black-3) transparent;
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.stage-select-menu .menu-search {
  height: 24px;
  margin-bottom: var(--space-0);
  padding: 0 var(--space-2);
  border: none;
  outline: none;
  background: var(--black-2-a);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-main);
}

.stage-select-menu .menu-item {
  flex: none;
  height: 24px;
  padding: 0 var(--space-2);
  border: none;
  background: transparent;
  text-align: left;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.stage-select-menu .menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-main);
}

.stage-select-menu .menu-item.active {
  color: var(--accent-200);
}

.stage-select-menu .menu-empty {
  padding: var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
}
</style>
