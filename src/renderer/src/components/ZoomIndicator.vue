<script setup lang="ts">
defineProps<{ percent: number }>();
</script>

<template>
  <!--
    The transient zoom confirmation (specs/023). A small, understated percentage in
    the bottom-right corner, shown briefly after any zoom change. Decorative and
    never interactive: it must not intercept pointer input meant for the page.
  -->
  <div class="zoom-indicator" aria-hidden="true">{{ percent }}%</div>
</template>

<style scoped>
.zoom-indicator {
  position: fixed;
  right: 14px;
  bottom: 14px;
  padding: 5px 9px;
  border-radius: 7px;
  border: 1px solid var(--tb-border);
  background: var(--tb-bg-elevated);
  color: var(--tb-fg-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  box-shadow: 0 4px 16px rgb(0 0 0 / 28%);
  /* Informational only: the page underneath stays interactive. */
  pointer-events: none;
  user-select: none;
}

/* Eases in on a change, reverses fast on dismiss (004-shell-motion). */
.zoom-enter-active {
  transition: opacity var(--tb-motion-fast) var(--tb-motion-ease-out);
}

.zoom-leave-active {
  transition: opacity var(--tb-motion-fast) var(--tb-motion-ease-in);
}

.zoom-enter-from,
.zoom-leave-to {
  opacity: 0;
}
</style>
