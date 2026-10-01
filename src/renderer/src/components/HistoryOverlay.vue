<script setup lang="ts">
import type { HistoryDirection } from "@shared/history";

const props = defineProps<{ direction: HistoryDirection; progress: number }>();
</script>

<template>
  <!--
    The armed history-navigation overlay (specs/015). A subtle edge scrim, an accent
    bar, and a small panel with an arrow pointing the way history would move: left
    for Back, right for Forward. Decorative and never interactive.
  -->
  <div
    class="history-overlay"
    :class="`history-overlay--${props.direction}`"
    :style="{ '--history-progress': props.progress }"
    aria-hidden="true"
  >
    <div class="history-overlay__scrim"></div>
    <!-- <div class="history-overlay__bar"></div> -->
    <div class="history-overlay__panel">
      <svg class="history-overlay__arrow" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <template v-if="props.direction === 'back'">
          <path
            fill="currentColor"
            d="M29 16c0 .69-.56 1.25-1.25 1.25H7.213l7.432 7.628a1.25 1.25 0 1 1-1.79 1.744l-9.497-9.747a1.246 1.246 0 0 1 0-1.75l9.497-9.747a1.25 1.25 0 0 1 1.79 1.744L7.213 14.75H27.75c.69 0 1.25.56 1.25 1.25"
          />
        </template>
        <template v-else>
          <path
            fill="currentColor"
            d="M3 16c0-.69.56-1.25 1.25-1.25h20.537l-7.432-7.628a1.25 1.25 0 1 1 1.79-1.744l9.497 9.747a1.246 1.246 0 0 1 0 1.75l-9.497 9.747a1.25 1.25 0 1 1-1.79-1.744l7.432-7.628H4.25C3.56 17.25 3 16.69 3 16"
          />
        </template>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.history-overlay {
  position: absolute;
  top: var(--shell-inset, 0px);
  bottom: 0;
  width: 112px;
  /* Above the guest page (a separate view) and below the strip (z-index 2) and the
     full-window surfaces, which follow it in DOM order. */
  pointer-events: none;
  /* Dim when just armed, clearer as the swipe nears commit. */
  opacity: calc(0.6 + 0.4 * var(--history-progress, 0));
}

.history-overlay--back {
  left: 0;
}

.history-overlay--forward {
  right: 0;
}

/* Subtle neutral scrim so the signal reads on light pages regardless of theme mode.
   Its reach and strength both follow the swipe, so the edge brightens as the
   gesture arms and recedes as it cancels. */
.history-overlay__scrim {
  position: absolute;
  top: 0;
  bottom: 0;
  width: calc(55% + 45% * var(--history-progress, 0));
  opacity: calc(0.35 + 0.65 * var(--history-progress, 0));
  transition:
    width var(--tb-motion-fast) var(--tb-motion-ease-out),
    opacity var(--tb-motion-fast) var(--tb-motion-ease-out);
}

.history-overlay--back .history-overlay__scrim {
  left: 0;
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--tb-bg) 25%, transparent),
    transparent 80%
  );
}

.history-overlay--forward .history-overlay__scrim {
  right: 0;
  background: linear-gradient(
    to left,
    color-mix(in srgb, var(--tb-bg) 25%, transparent),
    transparent 80%
  );
}

.history-overlay__bar {
  position: absolute;
  top: 0;
  bottom: 0;
  /* A thin accent edge that thickens gently with the swipe, so it reads as a
     quiet secondary signal rather than a hard line. */
  width: calc(1px + 2px * var(--history-progress, 0));
  background: var(--tb-accent);
  transition: width var(--tb-motion-fast) var(--tb-motion-ease-out);
}

.history-overlay--back .history-overlay__bar {
  left: 0;
}

.history-overlay--forward .history-overlay__bar {
  right: 0;
}

/* Subtle panel: a themed surface so the arrow always has contrast. */
.history-overlay__panel {
  position: absolute;
  top: 50%;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tb-bg) 95%, transparent);
  color: var(--tb-accent);
  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.25);
  /* Grows as the swipe arms and shrinks back as it cancels. Never below half, so
     the surface stays legible the moment it appears. The transition smooths the
     travel between frames without lagging behind the finger. */
  transform: translateY(-50%) scale(calc(0.55 + 0.85 * var(--history-progress, 0)));
  transition: transform var(--tb-motion-fast) var(--tb-motion-ease-out);
}

.history-overlay--back .history-overlay__panel {
  left: 16px;
}

.history-overlay--forward .history-overlay__panel {
  right: 16px;
}

.history-overlay__arrow {
  width: 26px;
  height: 26px;
  /* The arrow leads the panel slightly so a nearing commit reads as "more". */
  transform: scale(calc(0.8 + 0.35 * var(--history-progress, 0)));
  transition: transform var(--tb-motion-fast) var(--tb-motion-ease-out);
}

/* The arrow paths are filled Fluent glyphs (same icons as the strip's nav
   buttons). The glyph carries `fill="currentColor"`, so only the shared color
   lives here; an outline rule would override that attribute and hollow them. */
.history-overlay__arrow path {
  fill: currentColor;
}

/* Eases in when armed, reverses fast on cancel/commit (004-shell-motion). */
.history-enter-active {
  transition: opacity var(--tb-motion-fast) var(--tb-motion-ease-out);
}

.history-leave-active {
  transition: opacity var(--tb-motion-fast) var(--tb-motion-ease-in);
}

.history-enter-from,
.history-leave-to {
  opacity: 0;
}
</style>
