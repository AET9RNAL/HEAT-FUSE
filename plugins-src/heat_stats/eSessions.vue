<script setup lang="ts">
/**
 * eSessions - one recorded match in the session list.
 * Layout: [outcome strip] Vehicle | Map/Mode | Score | Damage | K/C/A
 * The vertical strip on the leading edge colour-codes win/loss.
 */
import { computed } from "vue";
import "fuse_ui/ui/tokens.css";

export interface SessionRow {
  vehicle: string;
  map: string;
  mode: string;
  score: number;
  damage: number;
  kills: number;
  deaths: number;
  assists: number;
  outcome: string;
}

const props = defineProps<{ session: SessionRow }>();

const num = (n: number): string => (n ?? 0).toLocaleString();
const dmg = computed(() => {
  const d = props.session.damage ?? 0;
  return d >= 1000 ? `${(d / 1000).toFixed(1)}k` : String(d);
});
const kda = computed(
  () => `${props.session.kills ?? 0}/${props.session.deaths ?? 0}/${props.session.assists ?? 0}`,
);
</script>

<template>
  <div class="esession" :class="session.outcome">
    <span class="esession-strip" />
    <div class="esession-vehicle">{{ session.vehicle }}</div>
    <div class="esession-map">
      <div class="esession-map-name">{{ session.map }}</div>
      <div class="esession-map-mode">{{ session.mode }}</div>
    </div>
    <div class="esession-score">{{ num(session.score) }}</div>
    <div class="esession-dmg">{{ dmg }}</div>
    <div class="esession-kda">{{ kda }}</div>
  </div>
</template>

<style scoped>
.esession {
  --win: var(--success-color);
  --loss: var(--error-base);
  --kill: var(--tea-green);
  --dmg: var(--error-highlight);
  --outcome-c: var(--base-600);
  --ch4: polygon(4px 0%, 100% 0%, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0% 100%, 0% 4px);

  display: flex;
  align-items: center;
  gap: var(--space-2);
  box-sizing: border-box;
  padding: var(--space-1) var(--space-2);
  background: var(--black-1-a);
  clip-path: var(--ch4);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-main);
  overflow: hidden;
}
.esession.win {
  --outcome-c: var(--win);
}
.esession.loss {
  --outcome-c: var(--loss);
}
.esession.draw {
  --outcome-c: var(--base-200);
}
.esession.abandoned {
  --outcome-c: var(--warning-color);
}

/* Vertical colour-code strip on the leading edge. */
.esession-strip {
  flex: none;
  width: 3px;
  align-self: stretch;
  background: var(--outcome-c);
}

.esession-vehicle {
  flex: 1 1 0;
  min-width: 0;
  font-weight: var(--font-weight-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Map + gamemode column group. */
.esession-map {
  flex: 1.4 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.esession-map-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.esession-map-mode {
  font-size: var(--main-font-size-5);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.esession-score {
  flex: 0 0 auto;
  min-width: 3.5em;
  text-align: right;
}
.esession-dmg {
  flex: 0 0 auto;
  min-width: 3em;
  text-align: right;
  color: var(--dmg);
}
.esession-kda {
  flex: 0 0 auto;
  min-width: 4em;
  text-align: right;
  color: var(--kill);
}
</style>
