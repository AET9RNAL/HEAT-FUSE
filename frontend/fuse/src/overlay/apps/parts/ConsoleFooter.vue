<script setup lang="ts">
import eKey from "../../../components/ui/eKey.vue";

defineProps<{ hint: string; primary: string; actions: string; canAct: boolean }>();
defineEmits<{ primary: []; actions: [] }>();
</script>

<template>
  <footer class="console-footer">
    <span class="hint">{{ hint }}</span>
    <span class="spacer" />
    <template v-if="canAct">
      <button type="button" class="action" @click="$emit('primary')">
        <span class="label main">{{ primary }}</span>
        <eKey label="↵" variant="standalone" size="mini" />
      </button>
      <span class="sep" />
      <button type="button" class="action" @click="$emit('actions')">
        <span class="label">{{ actions }}</span>
        <eKey label="CTRL" size="mini" />
        <eKey label="K" size="mini" />
      </button>
    </template>
  </footer>
</template>

<style scoped>
.console-footer {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 40px;
  padding: 0 var(--space-3);
  box-sizing: border-box;
  border-top: 1px solid var(--black-3);
  user-select: none;
}

.hint {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  letter-spacing: 0.04em;
  color: var(--base-600);
  white-space: pre;
}

.spacer {
  flex: 1;
}

.action {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.label {
  margin-right: var(--space-1);
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  color: var(--text-muted);
}

.label.main {
  color: var(--text-main);
}

.sep {
  width: 1px;
  height: 16px;
  background: var(--black-3);
}
</style>
