<script setup lang="ts">
</script>

<template>
  <div class="page">
    <div class="wip-container">
      <span class="wip-text">WORK IN PROGRESS</span>
    </div>
  </div>
</template>

<style scoped>
.page { padding: var(--space-4); color: var(--text-main); width: 100%; height: 100%; }

.wip-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.wip-text {
  font-family: var(--font-primary);
  font-weight: bold;
}
</style>
