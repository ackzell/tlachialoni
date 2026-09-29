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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="0.85rem"
          height="0.85rem"
          viewBox="0 0 32 32"
        >
          <!-- Icon from Fluent UI System Icons by Microsoft Corporation - https://github.com/microsoft/fluentui-system-icons/blob/main/LICENSE -->
          <path
            fill="currentColor"
            d="M5.5 16c0-5.799 4.701-10.5 10.5-10.5c2.594 0 4.968.94 6.801 2.5H20.75a1.25 1.25 0 1 0 0 2.5h5c.69 0 1.25-.56 1.25-1.25v-5a1.25 1.25 0 1 0-2.5 0v1.914A12.95 12.95 0 0 0 16 3C8.82 3 3 8.82 3 16s5.82 13 13 13s13-5.82 13-13q0-.419-.026-.831a1.25 1.25 0 1 0-2.495.157q.021.335.021.674c0 5.799-4.701 10.5-10.5 10.5S5.5 21.799 5.5 16"
          />
        </svg>
      </button>
      <button
        class="strip__btn"
        :class="{ 'is-active': devtools.open }"
        :style="{ '--i': segments.length + 1 }"
        title="Toggle DevTools"
        @click="toggleDevtools"
      >
        <svg v-if="devtools.open" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28">
          <!-- Icon from Fluent UI System Icons by Microsoft Corporation - https://github.com/microsoft/fluentui-system-icons/blob/main/LICENSE -->
          <path
            fill="currentColor"
            d="M11.367 2.805a.75.75 0 0 1 .742-.014A6.498 6.498 0 0 1 11 14.683V24l-.01.204A2 2 0 0 1 7 24v-9.317A6.499 6.499 0 0 1 5.89 2.79A.75.75 0 0 1 7 3.449V6.5l.01.204A2 2 0 0 0 9 8.5l.204-.01A2 2 0 0 0 11 6.5V3.45c0-.265.14-.51.367-.645M25 22a4 4 0 0 1-8 0v-3.5h8zM22.183 2.007a.75.75 0 0 1 .554.379l1.25 2.25a.75.75 0 0 1 .03.669l-.935 2.104V14h1.168a.75.75 0 0 1 .75.75V17h-8v-2.25a.75.75 0 0 1 .75-.75h1.332V7.41l-.936-2.105a.75.75 0 0 1 .03-.67l1.25-2.25l.055-.084A.75.75 0 0 1 20.082 2h2z"
          />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28">
          <!-- Icon from Fluent UI System Icons by Microsoft Corporation - https://github.com/microsoft/fluentui-system-icons/blob/main/LICENSE -->
          <path
            fill="currentColor"
            d="M10.308 2.416a.75.75 0 0 1 .67-.11a6.499 6.499 0 0 1 .521 12.192V23.5a2.5 2.5 0 0 1-4.999 0v-9.001a6.499 6.499 0 0 1 .521-12.192A.75.75 0 0 1 8 3.02V7.5l.005.103A1 1 0 0 0 10 7.5V3.021a.75.75 0 0 1 .308-.605m11.793-.41a.75.75 0 0 1 .554.38l1.25 2.25a.75.75 0 0 1 .03.669L23 7.409V14h1.25a.75.75 0 0 1 .75.75v6.75a4.5 4.5 0 1 1-9 0v-6.75a.75.75 0 0 1 .75-.75H18V7.41l-.936-2.105a.75.75 0 0 1 .03-.67l1.25-2.25l.055-.084A.75.75 0 0 1 19 2h3zM11.5 7.5l-.013.256A2.5 2.5 0 0 1 6.5 7.5V4.17A5 5 0 0 0 4 8.5l.004.208a5 5 0 0 0 3.475 4.555a.75.75 0 0 1 .521.714V23.5a1 1 0 1 0 2 0v-9.522a.75.75 0 0 1 .521-.715a5 5 0 0 0 3.475-4.555L14 8.5a5 5 0 0 0-2.5-4.33zm6 14a3 3 0 1 0 6 0v-3h-6zm0-4.5h6v-1.5h-6zm1.087-11.964l.849 1.91c.042.095.064.2.064.304V14h2V7.25q0-.16.064-.305l.848-1.909L21.56 3.5h-2.12z"
          />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.strip {
  /* Matches STRIP_HEIGHT (src/shared/shell.ts); the shell overlay grows to this
     while the strip is shown so it is not clipped, then shrinks to the thin
     DRAG_BAND_HEIGHT band when it is dismissed (specs/013). */
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* Left inset reserves room for the native macOS traffic lights, which main
     shows whenever this strip is on screen (see AppWindow.syncWindowButtons). */
  padding: 0 8px 0 68px;
  background: var(--tb-bg);
  border-bottom: 1px solid var(--tb-fg-subtle);
  user-select: none;
  /* Paints above the drag band (z-index 1) so its controls stay clickable; the
     band is always mounted now, including under full-window surfaces. */
  position: relative;
  z-index: 2;
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
  font-size: 1rem;
  animation: strip-control-in var(--tb-motion-fast) var(--tb-motion-ease-out) backwards;
  animation-delay: calc(min(var(--i, 0), var(--tb-motion-stagger-cap)) * var(--tb-motion-stagger));
  transition:
    background-color var(--tb-motion-fast) var(--tb-motion-ease-out),
    color var(--tb-motion-fast) var(--tb-motion-ease-out),
    border-color var(--tb-motion-fast) var(--tb-motion-ease-out);

  svg {
    width: 0.7rem;
    height: 0.7rem;
  }
}

@keyframes strip-control-in {
  from {
    opacity: 0;
    transform: translateY(calc(-1 * var(--tb-motion-shift)));
  }
}

.strip__btn:hover {
  /* background: var(--tb-hover); */
  color: var(--tb-accent);
}

.strip__btn.is-active {
  color: var(--tb-accent);
  border-color: var(--tb-border);
}
</style>
