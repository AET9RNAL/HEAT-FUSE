<script setup lang="ts">
/** Top-right stack of stage notifications; extras wait in the queue until a slot frees. */
import { AnimatePresence, motion } from "motion-v";
import StageNotice from "./StageNotice.vue";
import { Dynamics } from "../../composables/useMotion";
import { queuedCount, removeNotification, visibleNotifications } from "../notifications";
import { sendNotificationDismissed } from "../overlayClient";

// A centre-anchored horizontal mask: it opens from a vertical line to full width and
// reveals the card rather than scaling it.
const CLOSED = "inset(0% 50% 0% 50%)";
const OPEN = "inset(0% 0% 0% 0%)";

function close(id: string): void {
  removeNotification(id);
  sendNotificationDismissed(id);
}
</script>

<template>
  <div class="stage-notices">
    <AnimatePresence>
      <motion.div
        v-for="n in visibleNotifications"
        :key="n.id"
        layout
        class="notice-slot"
        :initial="{ clipPath: CLOSED }"
        :animate="{ clipPath: OPEN }"
        :exit="{ clipPath: CLOSED }"
        :transition="Dynamics.snappy"
      >
        <StageNotice :notification="n" @close="close(n.id)" />
      </motion.div>
    </AnimatePresence>

    <AnimatePresence>
      <motion.div
        v-if="queuedCount > 0"
        key="queued"
        class="notice-queued"
        :initial="{ clipPath: CLOSED }"
        :animate="{ clipPath: OPEN }"
        :exit="{ clipPath: CLOSED }"
        :transition="Dynamics.quick"
      >
        +{{ queuedCount }} more
      </motion.div>
    </AnimatePresence>
  </div>
</template>

<style scoped>
.stage-notices {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);
  pointer-events: none;
}

.notice-slot {
  display: flex;
}

.notice-queued {
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  user-select: none;
}
</style>
