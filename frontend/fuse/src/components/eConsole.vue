<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useFuseLogs } from '../composables/useFuseLogs'

type FilterLevel = 'all' | 'error' | 'warn' | 'info'

const { entries, clear } = useFuseLogs()
const search = ref('')
const activeFilter = ref<FilterLevel>('all')
const logBodyEl = ref<HTMLElement | null>(null)

const filtered = computed(() => {
  let list = entries.value
  if (activeFilter.value !== 'all') {
    const f = activeFilter.value
    list = list.filter(e => f === 'error' ? e.level === 'error' : f === 'warn' ? e.level === 'warn' : e.level === 'info' || e.level === 'debug')
  }
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(e => e.text.toLowerCase().includes(q))
  }
  return list
})

watch(filtered, async () => {
  await nextTick()
  if (logBodyEl.value) logBodyEl.value.scrollTop = logBodyEl.value.scrollHeight
})

function formatTime(ts: number) {
  return new Date(ts).toTimeString().slice(0, 8)
}
</script>

<template>
  <div class="e-console-glow">
    <div class="e-console">

      <div class="console-toolbar">
        <div class="search-wrap">
          <input
            v-model="search"
            class="search-input"
            placeholder="Search logs..."
            spellcheck="false"
          />
        </div>
        <div class="filter-pills">
          <button
            v-for="f in (['all', 'error', 'warn', 'info'] as FilterLevel[])"
            :key="f"
            class="pill"
            :class="[`pill-${f}`, { active: activeFilter === f }]"
            @click="activeFilter = f"
          >{{ f.charAt(0).toUpperCase() + f.slice(1) }}</button>
        </div>
        <button class="clear-btn" @click="clear">Clear</button>
      </div>

      <div ref="logBodyEl" class="log-body">
        <div
          v-for="entry in filtered"
          :key="entry.id"
          class="log-line"
          :class="`lvl-${entry.level}`"
        >
          <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
          <span class="log-text">{{ entry.text }}</span>
        </div>
        <div v-if="entries.length === 0" class="log-empty">
          Start the runtime to receive logs
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.e-console-glow {
  width: 100%;
}

.e-console {
  background-color: var(--black-1-a);
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 200px;
  clip-path: polygon(
    10px 0%,
    100% 0%,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0% 100%,
    0% 10px
  );
}

.console-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}

.search-wrap {
  flex: 1;
}

.search-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-main);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4, 12px);
  padding: 4px 8px;
  outline: none;
  box-sizing: border-box;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.filter-pills {
  display: flex;
  gap: var(--space-1);
}

.pill {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4, 12px);
  padding: 3px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  user-select: none;
}

.pill:hover { background: rgba(255, 255, 255, 0.06); color: var(--text-main); }
.pill.active { background: rgba(255, 255, 255, 0.1); color: var(--text-main); }
.pill-error.active { border-color: rgba(255, 80, 80, 0.5); color: #ff6b6b; }
.pill-warn.active  { border-color: rgba(255, 200, 80, 0.5); color: #ffc14d; }
.pill-info.active  { border-color: rgba(100, 200, 255, 0.4); color: #7dd3fc; }

.clear-btn {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4, 12px);
  padding: 3px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.12s;
}
.clear-btn:hover { color: var(--text-main); }

.log-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: var(--font-mono, 'Consolas', monospace);
  font-size: 11px;
}

.log-line {
  display: flex;
  gap: var(--space-2);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-muted);
}

.log-line.lvl-error .log-text { color: #ff6b6b; }
.log-line.lvl-warn  .log-text { color: #ffc14d; }
.log-line.lvl-info  .log-text { color: var(--text-main); }
.log-line.lvl-debug .log-text { color: var(--text-muted); }

.log-time {
  color: #555;
  flex-shrink: 0;
  user-select: none;
}

.log-text {
  flex: 1;
}

.log-empty {
  color: var(--text-muted);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  text-align: center;
  padding: var(--space-4);
  margin: auto;
}

.log-body::-webkit-scrollbar { width: 4px; }
.log-body::-webkit-scrollbar-track { background: transparent; }
.log-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
</style>
