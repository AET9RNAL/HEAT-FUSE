<script setup>
import { computed } from "vue";

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  state: { type: String, default: "locked" },
});

const demo = computed(() => props.data.demo ?? {});
const cfg = computed(() => demo.value.config ?? {});
const transient = computed(() => demo.value.transient ?? {});
const apis = computed(() => demo.value.apis ?? {});
const tests = computed(() => demo.value.tests ?? null);

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

const apiRows = computed(() => [
  ["storage counter", apis.value.counter ?? "—"],
  ["secret token", apis.value.token ?? "—"],
  ["demo service", apis.value.service ?? "—"],
  ["last ask", apis.value.ask ?? "—"],
  ["open link", apis.value.link ?? "—"],
  ["link callback", apis.value.callback ?? "—"],
  ["load test", apis.value.load ?? "—"],
  ["last teardown", apis.value.teardown ?? "—"],
]);

const permissions = computed(() => apis.value.permissions ?? []);

// Failures first, then skips, then passes.
const RANK = { fail: 0, skip: 1, pass: 2 };
const results = computed(() =>
  [...(tests.value?.results ?? [])].sort((a, b) => (RANK[a.status] ?? 3) - (RANK[b.status] ?? 3)),
);
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

    <section class="block">
      <h3 class="block-title">Plugin APIs</h3>
      <ul class="chips">
        <li v-for="p in permissions" :key="p.id" class="chip" :class="p.state">{{ p.id }} · {{ p.state }}</li>
      </ul>
      <dl class="grid">
        <template v-for="[k, v] in apiRows" :key="k">
          <dt>{{ k }}</dt>
          <dd>{{ v }}</dd>
        </template>
      </dl>
    </section>

    <section v-if="tests" class="block">
      <h3 class="block-title">
        Self-test
        <span class="summary">
          {{ tests.passed }} passed ·
          <span :class="{ bad: tests.failed }">{{ tests.failed }} failed</span>
          · {{ tests.skipped }} skipped
          <template v-if="tests.running"> · {{ tests.results.length }}/{{ tests.total }}</template>
        </span>
      </h3>
      <ol class="results">
        <li v-for="r in results" :key="`${r.group}/${r.name}`" class="result" :class="r.status">
          <span class="mark">{{ r.status }}</span>
          <span class="rname">{{ r.group }} · {{ r.name }}</span>
          <span v-if="r.detail && r.status !== 'pass'" class="rdetail">{{ r.detail }}</span>
        </li>
      </ol>
    </section>

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
  overflow-y: auto;
  background: rgba(6, 7, 6, 0.88);
  color: #f2f2f2;
  font-size: 12px;
  clip-path: polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px);
  scrollbar-width: thin;
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
  flex: none;
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
.grid dd { margin: 0; color: #f2f2f2; overflow-wrap: anywhere; }

.notes {
  margin: 0;
  padding: 6px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 11px;
  line-height: 1.4;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.block-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}

.summary {
  font-family: "Geist Mono", monospace;
  font-size: 10px;
  font-weight: 400;
  color: #b3b3b3;
}

.summary .bad { color: #ff3935; }

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chip {
  padding: 1px 5px;
  font-family: "Geist Mono", monospace;
  font-size: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: #b3b3b3;
}

.chip.granted { color: #84ffb1; }
.chip.denied { color: #ff3935; }
.chip.prompt { color: #ffdb8c; }

.results {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: "Geist Mono", monospace;
  font-size: 10px;
}

.result {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 0 6px;
}

.mark { text-transform: uppercase; color: #84ffb1; }
.result.fail .mark { color: #ff3935; }
.result.skip .mark { color: #808080; }

.rname { color: #f2f2f2; }
.result.skip .rname { color: #808080; }

.rdetail {
  grid-column: 2;
  color: #b3b3b3;
  overflow-wrap: anywhere;
}

.foot { margin-top: auto; }

.event {
  font-family: "Geist Mono", monospace;
  font-size: 10px;
  color: #84ffb1;
  word-break: break-all;
}
</style>
