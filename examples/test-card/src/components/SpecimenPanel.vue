<script setup lang="ts">
import { computed } from "vue";
import { normalizedEditPoints, type PageId } from "../edit-points";

const props = defineProps<{
  pageId: PageId;
  variant: "bars" | "grid" | "lines";
}>();

const points = normalizedEditPoints;
const label = computed(() => points.value.copy.pages[props.pageId].specimenLabel);

const values = computed(() =>
  props.variant === "lines"
    ? [92, 68, 84, 54, 76, 48]
    : [18, 26, 22, 38, 30, 52, 44, 66, 50, 58, 36, 72],
);

function itemStyle(value: number): Record<string, string> {
  if (props.variant === "bars") return { height: `${value}%` };
  if (props.variant === "lines") return { width: `${value}%` };
  return {};
}
</script>

<template>
  <section class="specimen" :class="`specimen--${variant}`">
    <p class="specimen__label">{{ label }}</p>
    <div class="specimen__field" aria-hidden="true">
      <span
        v-for="(value, index) in values"
        :key="index"
        class="specimen__item"
        :style="itemStyle(value)"
      />
    </div>
  </section>
</template>
