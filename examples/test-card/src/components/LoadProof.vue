<script setup lang="ts">
import { computed } from "vue";
import { normalizedEditPoints } from "../edit-points";
import { formatLoadCount, formatLoadTime, type LoadProof } from "../lib/load-proof";

const props = defineProps<{ loadProof: LoadProof }>();

const points = normalizedEditPoints;
const count = computed(() => formatLoadCount(props.loadProof.count));
const time = computed(() => formatLoadTime(props.loadProof.lastLoadAt));
</script>

<template>
  <div class="load-proof" aria-label="Load proof">
    <div class="load-proof__block">
      <span class="load-proof__label">{{ points.copy.loadCountLabel }}</span>
      <strong class="load-proof__count">{{ count }}</strong>
    </div>
    <div class="load-proof__block">
      <span class="load-proof__label">{{ points.copy.lastLoadLabel }}</span>
      <span class="load-proof__time">{{ time }}</span>
    </div>
  </div>
</template>
