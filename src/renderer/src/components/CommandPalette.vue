<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { buildRows, type Row } from "../composables/useCommands";
import { closePalette, useShell } from "../composables/useShell";

const props = defineProps<{ initial: string }>();
const api = window.tlachialoni;
const { state } = useShell();

const query = ref(props.initial);
const selected = ref(0);
const error = ref("");
const input = ref<HTMLInputElement | null>(null);

const rows = computed<Row[]>(() =>
  buildRows(
    query.value,
    state.value?.recents ?? [],
    undefined,
    state.value ? { variant: state.value.variant, colorMode: state.value.colorMode } : undefined,
  ),
);

watch(rows, () => {
  selected.value = 0;
});
watch(query, () => {
  error.value = "";
});

/** Live-previews the highlighted theme row; null restores the persisted variant. */
function previewSelected(): void {
  const row = rows.value[selected.value];
  const match = row?.kind === "command" ? /^theme\.variant\.(.+)$/.exec(row.id) : null;
  void api.previewVariant(match ? match[1] : null);
}

watch([selected, rows], previewSelected);

onMounted(async () => {
  await nextTick();
  input.value?.focus();
  input.value?.select();
});

function move(delta: number): void {
  const count = rows.value.length;
  if (!count) return;
  selected.value = (selected.value + delta + count) % count;
}

async function activate(row?: Row): Promise<void> {
  const chosen = row ?? rows.value[selected.value];
  if (!chosen) return;

  if (chosen.kind === "command") {
    await api.runCommand(chosen.id);
    closePalette();
    return;
  }

  const value = chosen.arg ?? query.value;
  const result = await api.runCommand("target.navigate", value);
  if (!result.ok) {
    error.value = result.reason ?? "Invalid target";
    return;
  }
  closePalette();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    closePalette();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    move(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    move(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    void activate();
  }
}

// ---- row motion (Vue docs: TransitionGroup + JS hooks) --------------------
//
// Timings read from the same motion tokens as the CSS surfaces, with fallbacks
// for the JSDOM-free unit runs. `prefersReduced()` collapses everything to a
// snap so reduced-motion users get the end state immediately.

interface MotionTiming {
  fast: number;
  stagger: number;
  cap: number;
}

function motionTiming(): MotionTiming {
  const styles = getComputedStyle(document.documentElement);
  const ms = (name: string, fallback: number): number => {
    const value = parseFloat(styles.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    fast: ms("--tb-motion-fast", 160),
    stagger: ms("--tb-motion-stagger", 36),
    cap: ms("--tb-motion-stagger-cap", 6),
  };
}

const reducedMotion = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Delay for a row currently rendered at `data-index`. */
function delayFor(el: Element): number {
  if (reducedMotion()) return 0;
  const { stagger, cap } = motionTiming();
  const index = Number((el as HTMLElement).dataset.index ?? 0);
  return Math.min(Number.isFinite(index) ? index : 0, cap) * stagger;
}

/**
 * The row animates with the Web Animations API. `done` releases the transition,
 * so a mid-flight interruption still completes cleanly.
 */
function animateRow(
  el: Element,
  keyframes: Keyframe[],
  duration: number,
  delay: number,
  done: () => void,
): void {
  const animation = el.animate(keyframes, {
    duration,
    delay,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    fill: "both",
  });
  animation.finished.then(done, done);
}

function onBeforeEnter(el: Element): void {
  (el as HTMLElement).style.opacity = "0";
}

function onEnter(el: Element, done: () => void): void {
  const { fast } = motionTiming();
  // Height eases from 0 so the list unfolds rather than jumping, as in the
  // Vue staggering example; the row's own height is fixed, so the target is a
  // constant and nothing is measured while typing.
  animateRow(
    el,
    [
      { opacity: 0, height: "0px" },
      { opacity: 1, height: "var(--palette-row-height, 34px)" },
    ],
    reducedMotion() ? 1 : fast,
    delayFor(el),
    done,
  );
}

function onLeave(el: Element, done: () => void): void {
  const { fast } = motionTiming();
  animateRow(
    el,
    [
      { opacity: 1, height: "var(--palette-row-height, 34px)" },
      { opacity: 0, height: "0px" },
    ],
    reducedMotion() ? 1 : fast,
    0,
    done,
  );
}
</script>

<template>
  <div class="palette-backdrop" @mousedown.self="closePalette()">
    <div class="palette" role="dialog" aria-label="Command palette">
      <input
        ref="input"
        v-model="query"
        class="palette__input"
        placeholder="Type a target (e.g. :5173) or a command"
        spellcheck="false"
        @keydown="onKeydown"
      />
      <p v-if="error" class="palette__error">{{ error }}</p>
      <ul class="palette__list">
        <TransitionGroup
          name="palette-row"
          :css="false"
          @before-enter="onBeforeEnter"
          @enter="onEnter"
          @leave="onLeave"
        >
          <li
            v-for="(row, index) in rows"
            :key="row.key"
            :data-index="index"
            class="palette__row"
            :class="{ 'is-selected': index === selected }"
            @mouseenter="selected = index"
            @click="activate(row)"
          >
            <span class="palette__label">{{ row.label }}</span>
            <span class="palette__meta">{{ row.accelerator ?? row.detail }}</span>
          </li>
          <li v-if="!rows.length" key="palette-empty" class="palette__empty">No matches</li>
        </TransitionGroup>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: color-mix(in srgb, var(--tb-bg) 45%, transparent);
  backdrop-filter: blur(2px);
  user-select: none;
}

.palette {
  width: min(640px, 90vw);
  background: var(--tb-bg);
  border: 1px solid var(--tb-border);
  border-radius: 8px;
  box-shadow: 0 24px 60px rgb(0 0 0 / 45%);
  overflow: hidden;
  transform-origin: top center;
}

/* Entrance grows the panel in; exit shrinks it away (004-shell-motion). */
.palette-backdrop.palette-enter-active {
  transition: opacity var(--tb-motion-base) var(--tb-motion-ease-out);
}

.palette-backdrop.palette-leave-active {
  transition: opacity var(--tb-motion-fast) var(--tb-motion-ease-in);
  pointer-events: none;
}

.palette-backdrop.palette-enter-active .palette {
  transition:
    opacity var(--tb-motion-base) var(--tb-motion-ease-out),
    transform var(--tb-motion-base) var(--tb-motion-ease-out);
  will-change: transform, opacity;
}

.palette-backdrop.palette-leave-active .palette {
  transition:
    opacity var(--tb-motion-fast) var(--tb-motion-ease-in),
    transform var(--tb-motion-fast) var(--tb-motion-ease-in);
  will-change: transform, opacity;
}

.palette-backdrop.palette-enter-from,
.palette-backdrop.palette-leave-to {
  opacity: 0;
}

.palette-backdrop.palette-enter-from .palette {
  transform: scale(var(--tb-motion-scale));
}

.palette-backdrop.palette-leave-to .palette {
  transform: scale(0.98);
}

.palette__input {
  width: 100%;
  box-sizing: border-box;
  padding: 14px 16px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--tb-border);
  outline: none;
  color: var(--tb-fg);
  font: inherit;
  font-size: 14px;
}

.palette__input::placeholder {
  color: var(--tb-fg-subtle);
}

.palette__error {
  margin: 0;
  padding: 8px 16px;
  color: var(--tb-error);
  font-size: 12px;
}

/* Rows are a plain v-for list: adding matches is instant and, crucially, rows
   cannot accumulate (a TransitionGroup leave lifecycle left duplicates behind
   here). The list keeps a fixed ceiling and a reserved scrollbar gutter so
   typing never resizes or reflows the container. */
.palette__list {
  margin: 0;
  padding: 6px;
  list-style: none;
  max-height: 46vh;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

/*
 * Row motion is driven from JavaScript (Vue docs: TransitionGroup with
 * `:css="false"` and enter/leave hooks), so the rows carry no CSS transition
 * classes of their own. Timings come from the same motion tokens as the rest of
 * the shell, read at runtime in the component.
 *
 * Row height is fixed so the hooks animate toward a constant instead of
 * measuring the DOM on every keystroke, and so a long label can never reflow
 * the list.
 */
.palette__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  color: var(--tb-fg-muted);
  cursor: default;
  /* One line, always: rows never change height, so the list height is a pure
     function of the row count and a long label can never reflow it. */
  height: var(--palette-row-height, 34px);
  box-sizing: border-box;
  overflow: hidden;
  transition:
    background-color var(--tb-motion-fast) var(--tb-motion-ease-out),
    color var(--tb-motion-fast) var(--tb-motion-ease-out);
}

.palette__row.is-selected {
  background: var(--tb-hover);
  color: var(--tb-fg);
}

.palette__label {
  /* min-width: 0 lets this flex child shrink below its content width so the
     ellipsis engages instead of the text overflowing or wrapping. */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette__meta {
  color: var(--tb-fg-subtle);
  font-size: 12px;
  flex: none;
  white-space: nowrap;
}

/* The hover fill lands near --tb-fg-subtle, so lift the meta on the active row. */
.palette__row.is-selected .palette__meta {
  color: var(--tb-fg-muted);
}

.palette__empty {
  padding: 10px;
  color: var(--tb-fg-subtle);
  font-size: 12px;
}
</style>
