<script setup lang="ts">
import CommandPalette from "./components/CommandPalette.vue";
import DragStrip from "./components/DragStrip.vue";
import FailureView from "./components/FailureView.vue";
import LoadingVeil from "./components/LoadingVeil.vue";
import { useShell } from "./composables/useShell";

const { state, loading, failed, paletteOpen, paletteInitial } = useShell();
</script>

<template>
  <div class="shell-root">
    <LoadingVeil v-if="loading && !failed" />
    <FailureView v-else-if="failed" :url="failed.url" :reason="failed.reason" />
    <DragStrip v-if="state?.stripVisible && !paletteOpen" />
    <CommandPalette v-if="paletteOpen" :initial="paletteInitial" />
  </div>
</template>
