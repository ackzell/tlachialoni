<script setup lang="ts">
import { computed } from "vue";
import { useShell } from "../composables/useShell";
import { describeTarget, splitTargetLabel } from "../utils/target";

const api = window.tlachialoni;
const { state, devtools } = useShell();

const target = computed(() => state.value?.target ?? "");
const display = computed(() => describeTarget(target.value));
const segments = computed(() => splitTargetLabel(display.value.label));

function reload(): void {
  void api.runCommand("view.reload");
}

function toggleDevtools(): void {
  void api.runCommand("devtools.toggle");
}

function close(): void {
  void api.closeWindow();
}
</script>

<template>
  <header class="strip">
    <div class="strip__target" :title="target">
      <svg
        v-if="display.secure"
        class="strip__lock"
        viewBox="0 0 16 16"
        aria-label="https"
        role="img"
      >
        <path
          d="M5 7V5a3 3 0 0 1 6 0v2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
        />
        <rect
          x="3.5"
          y="7"
          width="9"
          height="6.5"
          rx="1.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
        />
      </svg>
      <svg v-else class="strip__lock" viewBox="0 0 16 16" aria-label="http" role="img">
        <path
          d="M5 7V5a3 3 0 0 1 5.7-1.4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
        />
        <rect
          x="3.5"
          y="7"
          width="9"
          height="6.5"
          rx="1.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
        />
      </svg>
      <TransitionGroup name="strip-seg" tag="span" class="strip__host" appear>
        <span
          v-for="(segment, index) in segments"
          :key="`${target}|${index}`"
          class="strip__seg"
          :style="{ '--i': index }"
          >{{ segment }}</span
        >
      </TransitionGroup>
    </div>
    <div class="strip__actions">
      <button class="strip__btn" :style="{ '--i': segments.length }" title="Reload" @click="reload">
        ⟳
      </button>
      <button
        class="strip__btn"
        :class="{ 'is-active': devtools.open }"
        :style="{ '--i': segments.length + 1 }"
        title="Toggle DevTools"
        @click="toggleDevtools"
      >
        ⌥
      </button>
      <button
        class="strip__btn"
        :style="{ '--i': segments.length + 2 }"
        title="Close"
        @click="close"
      >
        ✕
      </button>
    </div>
  </header>
</template>

<style scoped>
.strip {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  background: var(--tb-bg-elevated);
  border-bottom: 1px solid var(--tb-border);
  user-select: none;
  -webkit-app-region: drag;
  app-region: drag;
}

/* The strip surface eases in from just above; leaving reverses fast (004). */
.strip-enter-active {
  transition:
    opacity var(--tb-motion-base) var(--tb-motion-ease-out),
    transform var(--tb-motion-base) var(--tb-motion-ease-out);
}

.strip-leave-active {
  transition:
    opacity var(--tb-motion-fast) var(--tb-motion-ease-in),
    transform var(--tb-motion-fast) var(--tb-motion-ease-in);
  pointer-events: none;
}

.strip-enter-from,
.strip-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--tb-motion-shift)));
}

.strip__target {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-left: 6px;
}

.strip__lock {
  width: 13px;
  height: 13px;
  flex: none;
  color: var(--tb-fg-muted);
}

.strip__host {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  color: var(--tb-fg-muted);
  font-size: 12px;
}

.strip__seg {
  display: inline-block;
}

/* Each reveal unit fades in with a capped stagger (004-shell-motion). */
.strip-seg-enter-active {
  transition: opacity var(--tb-motion-base) var(--tb-motion-ease-out);
  transition-delay: calc(min(var(--i, 0), var(--tb-motion-stagger-cap)) * var(--tb-motion-stagger));
}

.strip-seg-enter-from {
  opacity: 0;
}

.strip__actions {
  display: flex;
  gap: 4px;
}

.strip__btn {
  -webkit-app-region: no-drag;
  app-region: no-drag;
  width: 26px;
  height: 24px;
  display: grid;
  place-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--tb-fg-muted);
  cursor: pointer;
  font-size: 0.8rem;
  animation: strip-control-in var(--tb-motion-fast) var(--tb-motion-ease-out) backwards;
  animation-delay: calc(min(var(--i, 0), var(--tb-motion-stagger-cap)) * var(--tb-motion-stagger));
  transition:
    background-color var(--tb-motion-fast) var(--tb-motion-ease-out),
    color var(--tb-motion-fast) var(--tb-motion-ease-out),
    border-color var(--tb-motion-fast) var(--tb-motion-ease-out);
}

@keyframes strip-control-in {
  from {
    opacity: 0;
    transform: translateY(calc(-1 * var(--tb-motion-shift)));
  }
}

.strip__btn:hover {
  background: var(--tb-hover);
  color: var(--tb-fg);
}

.strip__btn.is-active {
  color: var(--tb-accent);
  border-color: var(--tb-border);
}
</style>
