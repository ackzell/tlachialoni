<script setup lang="ts">
import { computed } from "vue";
import { RouterView } from "vue-router";
import PageHeader from "./components/PageHeader.vue";
import { editCssVars, editPoints, normalizedEditPoints } from "./edit-points";
import type { LoadProof } from "./lib/load-proof";

defineProps<{ loadProof: LoadProof }>();

// Keep the live config visible in the DevTools component inspector.
const edit = editPoints;
const cssVars = editCssVars;
const layout = computed(() => normalizedEditPoints.value.layout);
</script>

<template>
  <div class="site" :style="cssVars" :data-layout="layout">
    <PageHeader :load-proof="loadProof" />
    <main class="site__main">
      <RouterView />
    </main>
  </div>
</template>
