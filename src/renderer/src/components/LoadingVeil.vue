<script setup lang="ts">
import { computed } from "vue";
import { useShell } from "../composables/useShell";
import { describeTarget } from "../utils/target";

const { loadingTarget } = useShell();

const label = computed(() => describeTarget(loadingTarget.value).label);
</script>

<template>
  <div class="veil">
    <div class="veil__spinner" />
    <p class="veil__label"><span class="loading__label">Loading</span> {{ label }}</p>
  </div>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--tb-bg);
}

.veil__spinner::before {
  width: 100%;
  height: 100%;
  content: " ";
  border-radius: 50%;
  box-shadow: 0 0 20px 12px color-mix(in srgb, var(--tb-surface) 35%, transparent);
  position: absolute;
}
.veil__spinner {
  color: var(--tb-bg);
  background: linear-gradient(0deg, var(--tb-fg-subtle), var(--tb-accent), var(--tb-fg-subtle));
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  position: relative;
  animation:
    rotate_animation 4s ease-in-out infinite alternate,
    pulse_animation 3s ease-out infinite;
}
.veil__spinner::after {
  width: calc(2rem - 6px);
  height: calc(2rem - 6px);
  background-color: currentColor;
  content: " ";
  position: absolute;
  top: 3px;
  left: 3px;
  border-radius: 50%;
  animation: pulse_animation 3s ease-out infinite;
  animation-delay: 0.2s;
}

@keyframes rotate_animation {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(600deg);
  }
}

@keyframes pulse_animation {
  0%,
  40% {
    box-shadow: 0 0 5px 0px color-mix(in srgb, var(--tb-signature) 20%, transparent);
  }
  100% {
    box-shadow: 0 0 5px 80px color-mix(in srgb, var(--tb-bg) 0%, transparent);
  }
}

@keyframes rotation {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
@keyframes scale50 {
  0%,
  100% {
    transform: scale(0);
  }
  50% {
    transform: scale(1);
  }
}

@keyframes pulsIn {
  0% {
    box-shadow: inset 0 0 0 1rem var(--color-2);
    opacity: 1;
  }
  50%,
  100% {
    box-shadow: inset 0 0 0 0 var(--color-2);
    opacity: 0;
  }
}

@keyframes pulsOut {
  0%,
  50% {
    box-shadow: 0 0 0 0 var(--color-2);
    opacity: 0;
  }
  100% {
    box-shadow: 0 0 0 1rem var(--color-2);
    opacity: 1;
  }
}

.veil__label {
  margin: 0;
  max-width: 80vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tb-fg-muted);
  font-size: 12px;
  margin-top: 1rem;
}

.loading__label {
  color: var(--tb-fg-subtle);
}

@keyframes veil-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
