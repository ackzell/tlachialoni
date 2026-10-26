<script setup lang="ts">
import LandmarkPanel from "../components/LandmarkPanel.vue";
import SpecimenPanel from "../components/SpecimenPanel.vue";
</script>

<template>
  <div class="card-page">
    <LandmarkPanel page-id="one" />
    <SpecimenPanel page-id="one" variant="bars" />
  </div>
</template>
