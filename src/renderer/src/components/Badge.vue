<script setup lang="ts">
import { computed } from "vue";

/**
 * The shared transient status badge (specs/023/024): a small, understated box
 * anchored to a corner of the guest page. It owns the look and the enter/leave
 * fade; callers supply the corner insets and the text. It renders in the shell, so
 * page zoom never scales it, and it is decorative — never interactive.
 */
const props = defineProps<{
  /** The anchored corner's insets, in device-independent pixels. */
  position: { top?: number; right?: number; bottom?: number; left?: number };
}>();

const style = computed(() => ({
  top: props.position.top === undefined ? undefined : `${props.position.top}px`,
  right: props.position.right === undefined ? undefined : `${props.position.right}px`,
  bottom: props.position.bottom === undefined ? undefined : `${props.position.bottom}px`,
  left: props.position.left === undefined ? undefined : `${props.position.left}px`,
}));
</script>

<template>
  <div class="badge" aria-hidden="true" :style="style">
    <slot />
  </div>
</template>

<style scoped>
.badge {
  position: fixed;
  /* The corner gap (only the anchored edges' margins apply on a fixed box). */
  margin: 10px;
  padding: 5px 9px;
  border-radius: 7px;
  border: 1px solid var(--tb-border);
  background: var(--tb-bg-elevated);
  color: var(--tb-accent);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgb(0 0 0 / 28%);
  pointer-events: none;
  user-select: none;
}

/* Eases in on a change, reverses fast on dismiss (004-shell-motion). */
.badge-enter-active {
  transition: opacity var(--tb-motion-fast) var(--tb-motion-ease-out);
}

.badge-leave-active {
  transition: opacity var(--tb-motion-fast) var(--tb-motion-ease-in);
}

.badge-enter-from,
.badge-leave-to {
  opacity: 0;
}

/* Reduced motion: still appears and disappears, instantly (FR-016). */
@media (prefers-reduced-motion: reduce) {
  .badge-enter-active,
  .badge-leave-active {
    transition: none;
  }
}
</style>
