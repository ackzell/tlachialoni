<script setup lang="ts">
import { computed } from "vue";
import { isStripSurfaceVisible } from "@shared/shell";
import CommandPalette from "./components/CommandPalette.vue";
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

const { state, loading, failed, paletteOpen, paletteInitial, paletteScope, extensionStatus } =
  useShell();

// Main shows the native macOS traffic lights off the same predicate, so the
// strip surface and its window controls stay in lockstep (specs/009).
const stripVisible = computed(() =>
  state.value ? isStripSurfaceVisible(state.value, paletteOpen.value) : false,
);
</script>

<template>
  <div class="shell-root">
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
