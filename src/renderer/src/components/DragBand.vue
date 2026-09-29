<template>
  <!--
    The always-available drag band (specs/013). It paints nothing; it exists only
    to give the frameless window a draggable top surface at all times, whether the
    strip is hidden, peeking, or pinned.
  -->
  <div class="drag-band" aria-hidden="true"></div>
</template>

<style scoped>
.drag-band {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  /* Must match DRAG_BAND_HEIGHT in src/shared/shell.ts. */
  height: 36px;
  user-select: none;
  -webkit-app-region: drag;
  app-region: drag;
}
</style>
