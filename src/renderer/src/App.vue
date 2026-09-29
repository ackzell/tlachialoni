<script setup lang="ts">
import { computed } from "vue";
import { isBlankSurfaceVisible, isStripSurfaceVisible } from "@shared/shell";
import BlankView from "./components/BlankView.vue";
import CommandPalette from "./components/CommandPalette.vue";
import DragBand from "./components/DragBand.vue";
import DragStrip from "./components/DragStrip.vue";
import FailureView from "./components/FailureView.vue";
import InstallStatus from "./components/InstallStatus.vue";
import LoadingVeil from "./components/LoadingVeil.vue";
import {
  markSurfaceLeaveCancelled,
  markSurfaceLeaving,
  markSurfaceLeft,
  notifyPaletteClosed,
  useShell,
} from "./composables/useShell";

const {
  state,
  loading,
  failed,
  paletteOpen,
  paletteInitial,
  paletteScope,
  peeking,
  extensionStatus,
} = useShell();

// Main shows the native macOS traffic lights off the same predicate, so the
// strip surface and its window controls stay in lockstep (specs/009, specs/013).
const stripVisible = computed(() =>
  state.value
    ? isStripSurfaceVisible(
        { stripVisible: state.value.stripVisible, peeking: peeking.value },
        paletteOpen.value,
      )
    : false,
);

// A window that has never loaded a target shows the blank "new page" watermark.
// Main keeps the shell full-window in this state, so it stays painted whether or
// not the location palette is open. The veil and failure view own the window
// during a load or a failure, so the watermark yields to them.
const blankVisible = computed(() =>
  state.value ? isBlankSurfaceVisible(state.value) && !loading.value && !failed.value : false,
);
</script>

<template>
  <div class="shell-root">
    <BlankView v-if="blankVisible" />

    <Transition
      name="veil"
      @leave="markSurfaceLeaving"
      @after-leave="markSurfaceLeft"
      @leave-cancelled="markSurfaceLeaveCancelled"
    >
      <LoadingVeil v-if="loading && !failed" />
    </Transition>

    <Transition
      name="failure"
      @leave="markSurfaceLeaving"
      @after-leave="markSurfaceLeft"
      @leave-cancelled="markSurfaceLeaveCancelled"
    >
      <FailureView
        v-if="failed"
        :url="failed.url"
        :reason="failed.reason"
        :previous-url="failed.previousUrl"
      />
    </Transition>

    <DragBand />

    <Transition
      name="strip"
      @leave="markSurfaceLeaving"
      @after-leave="markSurfaceLeft"
      @leave-cancelled="markSurfaceLeaveCancelled"
    >
      <DragStrip v-if="stripVisible" />
    </Transition>

    <Transition
      name="palette"
      @leave="markSurfaceLeaving"
      @after-leave="notifyPaletteClosed"
      @leave-cancelled="markSurfaceLeaveCancelled"
    >
      <CommandPalette v-if="paletteOpen" :initial="paletteInitial" :scope="paletteScope" />
    </Transition>

    <Transition
      name="status"
      @leave="markSurfaceLeaving"
      @after-leave="markSurfaceLeft"
      @leave-cancelled="markSurfaceLeaveCancelled"
    >
      <InstallStatus v-if="extensionStatus" />
    </Transition>
  </div>
</template>
