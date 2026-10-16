<script setup lang="ts">
import { formatViewportSize } from "@shared/viewport";
import Badge from "./Badge.vue";

defineProps<{
  size: { width: number; height: number };
  insets: { top: number; right: number };
}>();
</script>

<template>
  <!--
    The transient resize readout (specs/024): the guest page's viewport size, at
    the page's top-right corner (clear of any docked DevTools).
  -->
  <Badge data-tlachialoni-badge="size" :position="{ top: insets.top, right: insets.right }">
    {{ formatViewportSize(size) }}
  </Badge>
</template>
