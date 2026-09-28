<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import type { ExtensionPhase } from "@shared/extensions";
import { useShell } from "../composables/useShell";

/**
 * The transient extension status surface (specs/007-extension-support). It gives
 * a chromeless window a sense of what an install is doing: a subtle spinner, a
 * staged message, and a progress bar that tracks real download bytes when the
 * store reports a length. Success leaves on its own; a failure waits to be
 * dismissed. It never blocks the page underneath.
 */

const DONE_DISMISS_MS = 1600;

const api = window.tlachialoni;
const { extensionStatus } = useShell();

let timer: ReturnType<typeof setTimeout> | null = null;

const phase = computed<ExtensionPhase | null>(() => extensionStatus.value?.phase ?? null);

const busy = computed(() => {
  const current = phase.value;
  return current !== null && current !== "done" && current !== "error";
});

const title = computed(() => {
  const status = extensionStatus.value;
  if (!status) return "";
  if (status.phase === "done" || status.phase === "error") return status.message;
  return "Installing extension";
});

const subtitle = computed(() => {
  const status = extensionStatus.value;
  if (!status) return "";
  if (status.phase === "done") return "";
  if (status.phase === "error") return status.error ?? "";
  return status.message;
});

const received = computed(() => extensionStatus.value?.progress?.received ?? 0);
const total = computed(() => extensionStatus.value?.progress?.total ?? null);

const determinate = computed(
  () => phase.value === "downloading" && total.value !== null && total.value > 0,
);

const percent = computed(() => {
  if (!determinate.value) return 0;
  const size = total.value ?? 0;
  return size > 0 ? Math.min(100, Math.round((received.value / size) * 100)) : 0;
});

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function dismiss(): void {
  if (busy.value) return;
  clearTimer();
  void api.runCommand("extensions.dismissStatus");
}

watch(phase, (current) => {
  clearTimer();
  if (current === "done") timer = setTimeout(dismiss, DONE_DISMISS_MS);
});

onBeforeUnmount(clearTimer);
</script>

<template>
  <div class="status">
    <div class="status__card" @mousedown="dismiss">
      <div class="status__row">
        <span v-if="busy" class="status__spinner" aria-hidden="true" />
        <span v-else-if="phase === 'done'" class="status__glyph status__glyph--done">✓</span>
        <span v-else class="status__glyph status__glyph--error">!</span>
        <div class="status__text">
          <p class="status__title">{{ title }}</p>
          <p v-if="subtitle" class="status__subtitle">{{ subtitle }}</p>
        </div>
      </div>

      <div v-if="busy" class="status__bar" :class="{ 'is-indeterminate': !determinate }">
        <div v-if="determinate" class="status__fill" :style="{ width: `${percent}%` }" />
      </div>

      <p v-if="phase === 'error'" class="status__hint">Press Esc or click to dismiss</p>
    </div>
  </div>
</template>

<style scoped>
.status {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  /* Informational only: the page underneath stays interactive. */
  pointer-events: none;
  user-select: none;
}

.status-enter-active {
  transition: opacity var(--tb-motion-base) var(--tb-motion-ease-out);
}

.status-leave-active {
  transition: opacity var(--tb-motion-fast) var(--tb-motion-ease-in);
}

.status-enter-active .status__card {
  transition:
    opacity var(--tb-motion-base) var(--tb-motion-ease-out),
    transform var(--tb-motion-base) var(--tb-motion-ease-out);
}

.status-enter-from,
.status-leave-to {
  opacity: 0;
}

.status-enter-from .status__card {
  transform: translateY(calc(-1 * var(--tb-motion-shift)));
}

.status__card {
  pointer-events: auto;
  width: min(420px, 88vw);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: var(--tb-bg-elevated);
  border: 1px solid var(--tb-border);
  border-radius: 8px;
  box-shadow: 0 24px 60px rgb(0 0 0 / 45%);
}

.status__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status__spinner::before {
  width: 100%;
  height: 100%;
  content: " ";
  border-radius: 50%;
  box-shadow: 0 0 20px 12px color-mix(in srgb, var(--tb-surface) 35%, transparent);
  position: absolute;
}
.status__spinner {
  color: var(--tb-bg);
  background: linear-gradient(0deg, var(--tb-fg-subtle), var(--tb-accent), var(--tb-fg-subtle));
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  position: relative;
  animation:
    rotate_animation 4s ease-in-out infinite alternate,
    pulse_animation 3s ease-out infinite;
}
.status__spinner::after {
  width: calc(1.2rem - 6px);
  height: calc(1.2rem - 6px);
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

.status__glyph {
  flex: none;
  width: 1rem;
  height: 1rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 1rem;
  line-height: 1;
}

.status__glyph--done {
  color: var(--tb-bg);
  background: var(--tb-accent);
}

.status__glyph--error {
  color: var(--tb-bg);
  background: var(--tb-error);
}

.status__text {
  min-width: 0;
}

.status__title {
  margin: 0;
  color: var(--tb-fg);
  font-size: 13px;
}

.status__subtitle {
  margin: 2px 0 0;
  color: var(--tb-fg-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.status__hint {
  margin: 0;
  color: var(--tb-fg-subtle);
  font-size: 11px;
}

.status__bar {
  position: relative;
  height: 3px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--tb-surface);
}

.status__fill {
  height: 100%;
  background: var(--tb-accent);
  border-radius: 2px;
  transition: width var(--tb-motion-fast) linear;
}

.status__bar.is-indeterminate::after {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 35%;
  background: var(--tb-accent);
  border-radius: 2px;
  animation: status-sweep 1.1s var(--tb-motion-ease-out) infinite;
}

@keyframes status-sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(320%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .status__spinner {
    animation: none;
  }

  .status__bar.is-indeterminate::after {
    animation: none;
    transform: none;
  }
}
</style>
