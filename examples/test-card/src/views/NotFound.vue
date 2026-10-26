<script setup lang="ts">
import { RouterLink } from "vue-router";
import { normalizedEditPoints } from "../edit-points";

const points = normalizedEditPoints;
</script>

<template>
  <section class="not-found">
    <p class="not-found__identity">LOST</p>
    <h1 class="not-found__title">{{ points.copy.notFoundTitle }}</h1>
    <p class="not-found__body">{{ points.copy.notFoundBody }}</p>
    <RouterLink class="not-found__link" to="/">{{ points.copy.notFoundAction }}</RouterLink>
  </section>
</template>
