<script setup lang="ts">
import LandmarkPanel from "../components/LandmarkPanel.vue";
import SpecimenPanel from "../components/SpecimenPanel.vue";
</script>

<template>
  <div class="card-page">
    <LandmarkPanel page-id="three" />
    <SpecimenPanel page-id="three" variant="lines" />
  </div>
</template>
