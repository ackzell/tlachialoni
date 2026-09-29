<script setup lang="ts">
/**
 * The blank "new page" surface: shown on a window that has never loaded a
 * target (a fresh ⌘N window or a restored blank one). Main keeps the shell full
 * window in that state so this stays painted even after the location palette is
 * dismissed. The page itself is the native window backdrop; this surface only
 * adds the logo watermark, so it stays non-interactive.
 *
 * The mark is inlined (rather than a background image) so two of its inner
 * chevrons can take `currentColor` and pick up the window's theme accent.
 */
import logoSvg from "../assets/logo.svg?raw";
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- static, first-party asset -->
  <div class="blank" aria-hidden="true" v-html="logoSvg" />
</template>

<style scoped>
.blank {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: var(--tb-accent);
  opacity: 0.35;
}

.blank :deep(svg) {
  display: block;
  width: min(46vmin, 360px);
  height: auto;
}
</style>

<!--
  The mode override is a global rule on purpose: `:root[data-mode]` sits outside
  this component, so a scoped ancestor selector is not available (and Vue's
  `:global()` prefix drops the local descendant). It still targets `.blank`, so
  it only reaches this surface. The art carries an opaque white disc; invert it
  on light themes so the watermark reads as a dark mark instead of vanishing.
  `hue-rotate(180deg)` cancels the hue flip that `invert` alone would apply to
  the `currentColor` chevrons, so a colored variant keeps its hue in light mode.
-->
<style>
:root[data-mode="light"] .blank {
  filter: invert(1) hue-rotate(180deg);
  opacity: 0.25;
}
</style>
