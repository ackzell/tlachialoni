<script setup lang="ts">
import LandmarkPanel from "../components/LandmarkPanel.vue";
import SpecimenPanel from "../components/SpecimenPanel.vue";
</script>

<template>
  <div class="card-page">
    <LandmarkPanel page-id="two" />
    <SpecimenPanel page-id="two" variant="grid" />
  </div>
</template>
