<script setup lang="ts">
/**
 * The transient loading rim (specs/025). It mirrors any load where the guest page
 * is already on screen — reloads, link clicks, history moves, and same-origin
 * navigations. A normal load breathes a soft mineral rim; a hard reload adds a
 * heavier inner rim with a trailing echo. It is decorative, pointer-through, and
 * lives entirely in the shell overlay.
 */
defineProps<{
  hard: boolean;
  /** Offset from the top of the window: the visible/docked strip's height. */
  top: number;
}>();
</script>

<template>
  <div
    class="reload-rim"
    :class="{ 'reload-rim--hard': hard }"
    :style="{ top: `${top}px` }"
    data-tlachialoni-reload-indicator=""
    :data-kind="hard ? 'hard' : 'normal'"
    aria-hidden="true"
  >
    <span class="reload-rim__edge" />
  </div>
</template>

<style scoped>
.reload-rim {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
  user-select: none;
}

.reload-rim__edge {
  position: absolute;
  inset: 0;
  border: 4px solid var(--tb-accent);
  /* The core stays legible for the whole load; only the inner bloom breathes.
     The tighter, accent-based inset shadows give the rim a harder edge that
     still reads on a white page, while the signature bloom keeps it soft. */
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--tb-accent) 70%, transparent),
    /* A theme-tinted dark ring so the rim still separates from a light page
       when the shell theme's accent is itself light. */
    inset 0 0 0 2px color-mix(in srgb, var(--tb-accent) 35%, #000),
    inset 0 0 10px 2px rgb(0 0 0 / 22%),
    inset 0 0 26px 3px color-mix(in srgb, var(--tb-signature) 58%, transparent);
  opacity: 0.85;
}

/* The breathing mineral bloom inside the core rim. */
.reload-rim__edge::before {
  position: absolute;
  inset: 0;
  content: "";
  box-shadow: inset 0 0 20px color-mix(in srgb, var(--tb-signature) 60%, transparent);
  opacity: 0.35;
  animation: reload-rim-breathe 1600ms var(--tb-motion-ease-out) infinite;
}

/* The hard reload adds a heavier inner rim that trails the first pulse. */
.reload-rim__edge::after {
  position: absolute;
  inset: 6px;
  content: "";
  border: 2px solid color-mix(in srgb, var(--tb-accent) 55%, #000);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--tb-accent) 35%, transparent),
    0 0 12px rgb(0 0 0 / 22%);
  opacity: 0;
}

.reload-rim--hard .reload-rim__edge {
  opacity: 0.95;
}

.reload-rim--hard .reload-rim__edge::before {
  animation: reload-rim-hard 900ms var(--tb-motion-ease-out) infinite;
}

.reload-rim--hard .reload-rim__edge::after {
  opacity: 0.6;
  animation: reload-rim-echo 900ms var(--tb-motion-ease-out) infinite;
  animation-delay: 180ms;
}

@keyframes reload-rim-breathe {
  0%,
  100% {
    opacity: 0.25;
  }

  50% {
    opacity: 0.85;
  }
}

/* A double beat reads as more deliberate than the normal single breath. */
@keyframes reload-rim-hard {
  0%,
  100% {
    opacity: 0.3;
  }

  30% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }

  70% {
    opacity: 1;
  }
}

/* The trailing echo: the inner rim peaks slightly after the base beats. */
@keyframes reload-rim-echo {
  0%,
  100% {
    opacity: 0.25;
  }

  30% {
    opacity: 0.9;
  }

  50% {
    opacity: 0.45;
  }

  70% {
    opacity: 0.9;
  }
}

.reload-enter-active {
  transition: opacity var(--tb-motion-fast) var(--tb-motion-ease-out);
}

.reload-leave-active {
  transition: opacity var(--tb-motion-base) var(--tb-motion-ease-in);
  pointer-events: none;
}

.reload-enter-from,
.reload-leave-to {
  opacity: 0;
}

/* Reduced motion: a static rim, still clearly a reload (FR-013). */
@media (prefers-reduced-motion: reduce) {
  .reload-rim__edge::before,
  .reload-rim--hard .reload-rim__edge::before,
  .reload-rim__edge::after,
  .reload-rim--hard .reload-rim__edge::after {
    animation: none;
  }

  .reload-rim__edge {
    opacity: 0.9;
  }

  .reload-rim__edge::before {
    opacity: 0.55;
  }

  .reload-rim--hard .reload-rim__edge::after {
    opacity: 0.75;
  }

  .reload-enter-active,
  .reload-leave-active {
    transition: none;
  }
}
</style>
