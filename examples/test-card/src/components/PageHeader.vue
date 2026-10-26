<script setup lang="ts">
import { RouterLink } from "vue-router";
import { normalizedEditPoints } from "../edit-points";
import type { LoadProof as LoadProofData } from "../lib/load-proof";
import LoadProof from "./LoadProof.vue";

defineProps<{ loadProof: LoadProofData }>();

const points = normalizedEditPoints;
</script>

<template>
  <header class="masthead">
    <div class="masthead__brand">
      <p class="masthead__kicker">{{ points.copy.brand }}</p>
      <p class="masthead__eyebrow">{{ points.copy.eyebrow }}</p>
    </div>

    <nav class="masthead__nav" :aria-label="points.copy.navAriaLabel">
      <RouterLink class="masthead__link" to="/">
        {{ points.copy.pages.one.navLabel }}
      </RouterLink>
      <RouterLink class="masthead__link" to="/grid">
        {{ points.copy.pages.two.navLabel }}
      </RouterLink>
      <RouterLink class="masthead__link" to="/notes">
        {{ points.copy.pages.three.navLabel }}
      </RouterLink>
    </nav>

    <LoadProof :load-proof="loadProof" />
  </header>
</template>
