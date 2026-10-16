<script setup lang="ts">
import Badge from "./Badge.vue";

defineProps<{
  percent: number;
  insets: { right: number; bottom: number };
}>();
</script>

<template>
  <!--
    The transient zoom confirmation (specs/023): the current level, at the guest
    page's bottom-right corner (clear of any docked DevTools).
  -->
  <Badge data-tlachialoni-badge="zoom" :position="{ right: insets.right, bottom: insets.bottom }">
    {{ percent }}%
  </Badge>
</template>
