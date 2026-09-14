<script setup>
import { computed } from "vue";

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  state: { type: String, default: "locked" },
});

const demo = computed(() => props.data.demo ?? {});
const cfg = computed(() => demo.value.config ?? {});
const transient = computed(() => demo.value.transient ?? {});

const fill = computed(() => Number(transient.value.preview_fill ?? cfg.value.opacity_pct ?? 0));
const accent = computed(() => cfg.value.accent ?? "#FFDB8CFF");
const tint = computed(() => cfg.value.tint ?? "#84FFB1FF");

const rows = computed(() => [
  ["phase", cfg.value.phase],
  ["density", cfg.value.density],
  ["anchor", cfg.value.anchor],
  ["count", cfg.value.count],
  ["offset", cfg.value.offset],
  ["nudge", `${cfg.value.nudge_x ?? 0}, ${cfg.value.nudge_y ?? 0}`],
  ["enabled", String(cfg.value.enabled)],
  ["compact", String(cfg.value.compact)],
  ["corners", (cfg.value.corners ?? []).join(" ")],
  ["preview", transient.value.preview_phase],
]);
</script>

<template>
  <div class="demo" :style="{ fontFamily: cfg.font_family || 'system-ui' }">
    <header class="head">
      <span class="title" :style="{ color: accent }">{{ cfg.title || "Inspector Demo" }}</span>
      <span class="badge">{{ state }}<template v-if="demo.stage"> · stage {{ demo.stage }}</template></span>
    </header>

    <div class="bar">
      <div class="bar-fill" :style="{ width: `${fill}%`, background: tint }"></div>
      <span class="bar-pct">{{ Math.round(fill) }}%</span>
    </div>

    <dl class="grid">
      <template v-for="[k, v] in rows" :key="k">
        <dt>{{ k }}</dt>
        <dd>{{ v }}</dd>
      </template>
    </dl>

    <p v-if="cfg.notes" class="notes">{{ cfg.notes }}</p>

    <footer class="foot">
      <span class="event">{{ demo.lastEvent || "—" }}</span>
    </footer>
  </div>
</template>

<style scoped>
.demo {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(6, 7, 6, 0.88);
  color: #f2f2f2;
  font-size: 12px;
  clip-path: polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.title { font-size: 16px; font-weight: 600; }

.badge {
  font-family: "Geist Mono", monospace;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #b3b3b3;
}

.bar {
  position: relative;
  height: 16px;
  background: rgba(255, 255, 255, 0.08);
}

.bar-fill { position: absolute; inset: 0 auto 0 0; }

.bar-pct {
  position: absolute;
  right: 4px;
  top: 1px;
  font-family: "Geist Mono", monospace;
  font-size: 10px;
  color: #060706;
  mix-blend-mode: difference;
}

.grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  margin: 0;
  font-family: "Geist Mono", monospace;
  font-size: 11px;
}

.grid dt { color: #808080; }
.grid dd { margin: 0; color: #f2f2f2; }

.notes {
  margin: 0;
  padding: 6px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 11px;
  line-height: 1.4;
}

.foot { margin-top: auto; }

.event {
  font-family: "Geist Mono", monospace;
  font-size: 10px;
  color: #84ffb1;
  word-break: break-all;
}
</style>
