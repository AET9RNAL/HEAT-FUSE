<script setup lang="ts">
import { computed } from "vue";
import Icons from "fuse_ui/ui/Icons.vue";
import { useI18n } from "./i18n.mjs";

const props = defineProps<{ page: number; pageSize: number; total: number }>();

const emit = defineEmits<{ page: [page: number] }>();

const { t, n } = useI18n();

const from = computed(() => (props.total ? props.page * props.pageSize + 1 : 0));
const to = computed(() => Math.min((props.page + 1) * props.pageSize, props.total));
</script>

<template>
  <nav class="pagination">
    <button type="button" class="step" :disabled="page <= 0" @click="emit('page', page - 1)">
      <Icons kind="arrow-left" size="small" color="currentColor" />
      <span>{{ t("battles.prev") }}</span>
    </button>
    <span class="range">
      {{ t("battles.range", { from: n(from), to: n(to), total: n(total) }) }}
    </span>
    <button type="button" class="step" :disabled="to >= total" @click="emit('page', page + 1)">
      <span>{{ t("battles.next") }}</span>
      <Icons class="flip" kind="arrow-left" size="small" color="currentColor" />
    </button>
  </nav>
</template>

<style scoped>
.pagination {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--base-600);
}

.step,
.range {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-3);
  line-height: normal;
  text-transform: uppercase;
  white-space: nowrap;
}

.step {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.step:hover:not(:disabled) {
  color: var(--text-main);
}

.step:disabled {
  opacity: 0.4;
  cursor: default;
}

.range {
  color: var(--text-main);
}

.flip {
  transform: scaleX(-1);
}
</style>
