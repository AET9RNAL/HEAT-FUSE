<script setup lang="ts">
import { ref, computed } from 'vue'
import Icons from './Icons.vue'

interface Option { label: string; value: string }

const props = withDefaults(defineProps<{
  modelValue: string
  options: (string | Option)[]
  placeholder?: string
}>(), { placeholder: '' })

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const opts = computed<Option[]>(() =>
  props.options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o)),
)
const selectedLabel = computed(
  () => opts.value.find((o) => o.value === props.modelValue)?.label ?? props.placeholder ?? props.modelValue,
)

const open = ref(false)
const btnEl = ref<HTMLElement | null>(null)
const pos = ref<{ left: number; top: number; width: number; up: boolean }>({ left: 0, top: 0, width: 0, up: false })

function toggle() {
  if (open.value) { open.value = false; return }
  const el = btnEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const menuH = Math.min(260, opts.value.length * 30 + 8)
  const below = window.innerHeight - r.bottom
  const up = below < menuH + 8 && r.top > below
  pos.value = { left: r.left, top: up ? r.top : r.bottom + 2, width: r.width, up }
  open.value = true
}
function choose(val: string) {
  emit('update:modelValue', val)
  open.value = false
}
function close() { open.value = false }
</script>

<template>
  <button ref="btnEl" type="button" class="dd-btn" :class="{ open }" @click.stop="toggle">
    <span class="dd-label">{{ selectedLabel }}</span>
    <Icons kind="chevron-down" size="small" class="dd-chevron" />
  </button>

  <Teleport to="body">
    <div v-if="open" class="dd-layer" @mousedown.self="close">
      <div
        class="dd-menu"
        :style="{
          left: pos.left + 'px',
          top: pos.top + 'px',
          minWidth: pos.width + 'px',
          transform: pos.up ? 'translateY(-100%)' : 'none',
        }"
      >
        <div
          v-for="o in opts"
          :key="o.value"
          class="dd-item"
          :class="{ active: o.value === modelValue }"
          @click="choose(o.value)"
        >{{ o.label }}</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dd-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 26px;
  padding: 0 var(--space-2);
  background: var(--black-2-a);
  border: none;
  color: var(--text-main);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  cursor: pointer;
  white-space: nowrap;
  outline: none;
}
.dd-btn.open { box-shadow: inset 0 0 0 1px var(--light-green); }
.dd-label { flex: 1; text-align: left; }
.dd-chevron { transition: transform 0.15s; }
.dd-btn.open .dd-chevron { transform: rotate(180deg); }

.dd-layer {
  position: fixed;
  inset: 0;
  z-index: 3000;
}
.dd-menu {
  position: fixed;
  max-height: 260px;
  overflow-y: auto;
  background: var(--black-2);
  box-shadow: 0 var(--space-2) var(--space-5) rgba(0, 0, 0, 0.55);
  scrollbar-width: thin;
  scrollbar-color: var(--black-3) transparent;
}
.dd-item {
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
}
.dd-item:hover { color: var(--text-main); background: var(--black-3-a); }
.dd-item.active { color: var(--light-green); }
</style>
