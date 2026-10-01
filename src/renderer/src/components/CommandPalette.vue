<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { SCOPES, nextScope, scopeLabel, type Scope } from "@shared/commands";
import { buildRows, type Row } from "../composables/useCommands";
import { closePalette, useShell } from "../composables/useShell";

const props = defineProps<{ initial: string; scope: Scope }>();
const api = window.tlachialoni;
const { state } = useShell();

const query = ref(props.initial);
/**
 * The prefill from `⌘L` is a selected value, not an active filter, until the
 * developer edits it — so opening Location still lists recent pages.
 */
const edited = ref(false);
const effectiveQuery = computed(() => (edited.value ? query.value : ""));
const activeScope = ref<Scope>(props.scope);
const expandedHosts = ref<Set<string>>(new Set());
const selected = ref(0);
const error = ref("");
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

/**
 * When entering the Theme group we want the *active* variant highlighted, not
 * the first row. This stays armed until a current row appears (theme state may
 * arrive after mount) or the developer types.
 */
let focusCurrentPending = props.scope === "theme";

/**
 * Group switches and fallback swaps replace the whole list at once; playing the
 * staggered row motion there reads as rows piling up. Suppressing it (the hooks
 * no-op and `done()` immediately) makes those deliberate jumps instant, while
 * incremental typing keeps its motion.
 */
let suppressMotion = false;

function focusCurrentRow(): void {
  if (activeScope.value !== "theme") return;
  const index = rows.value.findIndex((row) => row.detail === "current");
  if (index >= 0) {
    selected.value = index;
    focusCurrentPending = false;
  }
}

// A `palette:open` arriving while the palette is already open (⌘P toggle aside,
// this happens for ⌘L / ⌘T) resets to the newly requested target and scope.
watch(
  () => [props.initial, props.scope] as const,
  ([initial, nextScopeValue]) => {
    suppressMotion = true;
    query.value = initial;
    activeScope.value = nextScopeValue;
    edited.value = false;
    expandedHosts.value = new Set();
    selected.value = 0;
    focusCurrentPending = nextScopeValue === "theme";
    focusCurrentRow();
    error.value = "";
    void nextTick(() => {
      suppressMotion = false;
    });
  },
);

const themeFlags = computed(() =>
  state.value ? { variant: state.value.variant, colorMode: state.value.colorMode } : undefined,
);

function rowsFor(targetScope: Scope): Row[] {
  return buildRows(
    effectiveQuery.value,
    state.value?.recents ?? [],
    undefined,
    themeFlags.value,
    state.value?.extensions ?? [],
    { scope: targetScope, expandedHosts: [...expandedHosts.value] },
  );
}

const scopedRows = computed(() => rowsFor(activeScope.value));
/** Scoped with fallback: a query with no in-group match widens to every group. */
const usingFallback = computed(
  () =>
    activeScope.value !== "all" &&
    effectiveQuery.value.trim() !== "" &&
    scopedRows.value.length === 0,
);
const rows = computed(() => (usingFallback.value ? rowsFor("all") : scopedRows.value));

watch(effectiveQuery, () => {
  if (effectiveQuery.value === "" && activeScope.value === "theme") {
    // Clearing the theme query returns the highlight to the active variant.
    focusCurrentPending = true;
    focusCurrentRow();
    return;
  }
  focusCurrentPending = false;
  selected.value = 0;
});
watch(activeScope, () => {
  suppressMotion = true;
  selected.value = 0;
  focusCurrentPending = activeScope.value === "theme";
  focusCurrentRow();
  void nextTick(() => {
    suppressMotion = false;
  });
});
watch(rows, () => {
  if (focusCurrentPending) focusCurrentRow();
});
watch(usingFallback, () => {
  suppressMotion = true;
  selected.value = 0;
  void nextTick(() => {
    suppressMotion = false;
  });
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
  if (focusCurrentPending) focusCurrentRow();
});

function move(delta: number): void {
  const count = rows.value.length;
  if (!count) return;
  selected.value = (selected.value + delta + count) % count;
}

function chooseScope(next: Scope): void {
  activeScope.value = next;
  void nextTick(() => input.value?.focus());
}

function toggleExpanded(row: Row, open: boolean): void {
  if (!row.host) return;
  const next = new Set(expandedHosts.value);
  if (open) next.add(row.host);
  else next.delete(row.host);
  expandedHosts.value = next;
  // Expanding reflows the list; keep the toggled host highlighted.
  void nextTick(() => {
    const index = rows.value.findIndex((entry) => entry.key === row.key);
    if (index >= 0) selected.value = index;
  });
}

/** Collapses a host's pages and puts the highlight back on the host row. */
function collapseHost(host: string): void {
  const next = new Set(expandedHosts.value);
  next.delete(host);
  expandedHosts.value = next;
  void nextTick(() => {
    const index = rows.value.findIndex((entry) => entry.key === `host:${host}`);
    if (index >= 0) selected.value = index;
  });
}

/**
 * Keep the highlighted row on screen as the arrow keys walk the list. `nearest`
 * scrolls only when the row has crossed an edge of the visible window, so a
 * hover, or a row that is already in view, never nudges the list.
 */
watch(selected, async (index) => {
  await nextTick();
  list.value
    ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
    ?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
});

interface LabelPart {
  text: string;
  hit: boolean;
}

/**
 * Splits a row label into plain and matched segments so the fuzzy match can be
 * emphasized. `row.matches` holds ascending indices into the label; the original
 * casing is preserved because we slice `row.label`, not a lowercased copy.
 */
function labelParts(row: Row): LabelPart[] {
  const matches = row.matches;
  if (!matches?.length) return [{ text: row.label, hit: false }];

  const parts: LabelPart[] = [];
  let cursor = 0;
  for (const index of matches) {
    if (index > cursor) parts.push({ text: row.label.slice(cursor, index), hit: false });
    parts.push({ text: row.label[index] ?? "", hit: true });
    cursor = index + 1;
  }
  if (cursor < row.label.length) parts.push({ text: row.label.slice(cursor), hit: false });
  return parts;
}

async function activate(row?: Row, close = true): Promise<void> {
  const chosen = row ?? rows.value[selected.value];
  if (!chosen) return;

  // Extension rows report their progress on the status surface, so the palette
  // gets out of the way immediately instead of waiting for the install.
  if (chosen.kind === "extension") {
    void api.runCommand(chosen.id, chosen.arg);
    closePalette();
    return;
  }

  if (chosen.kind === "command") {
    await api.runCommand(chosen.id);
    // Space runs a command in place (e.g. commits the highlighted theme);
    // Enter runs it and dismisses.
    if (close) closePalette();
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
  } else if (event.key === "Tab") {
    event.preventDefault();
    chooseScope(nextScope(activeScope.value, event.shiftKey ? -1 : 1));
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    move(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    move(-1);
  } else if (event.key === "ArrowRight") {
    const row = rows.value[selected.value];
    if (row?.expandable && !row.expanded) {
      event.preventDefault();
      toggleExpanded(row, true);
    }
  } else if (event.key === "ArrowLeft") {
    // A page, or an already-expanded host: collapse it in one press.
    const row = rows.value[selected.value];
    if (row?.host && (row.depth || row.expanded)) {
      event.preventDefault();
      collapseHost(row.host);
    }
  } else if (event.key === "Enter") {
    event.preventDefault();
    void activate();
  } else if (event.key === " " && query.value === "") {
    // Space commits the highlighted row in place (no dismissal) while the query
    // is empty; once typing, it is a literal space like any text field.
    event.preventDefault();
    void activate(undefined, false);
  }
}

// ---- row motion (Vue docs: TransitionGroup + JS hooks) --------------------
//
// Timings read from the same motion tokens as the CSS surfaces, with fallbacks
// for the JSDOM-free unit runs. `prefersReduced()` collapses everything to a
// snap so reduced-motion users get the end state immediately.

interface MotionTiming {
  fast: number;
  rowLeave: number;
  rowStagger: number;
  rowCap: number;
}

function motionTiming(): MotionTiming {
  const styles = getComputedStyle(document.documentElement);
  const ms = (name: string, fallback: number): number => {
    const value = parseFloat(styles.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    fast: ms("--tb-motion-fast", 160),
    rowLeave: ms("--tb-motion-row-leave", 90),
    rowStagger: ms("--tb-motion-row-stagger", 20),
    rowCap: ms("--tb-motion-row-stagger-cap", 5),
  };
}

const reducedMotion = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Delay for a row currently rendered at `data-index`. */
function delayFor(el: Element): number {
  if (reducedMotion()) return 0;
  const { rowStagger, rowCap } = motionTiming();
  const index = Number((el as HTMLElement).dataset.index ?? 0);
  return Math.min(Number.isFinite(index) ? index : 0, rowCap) * rowStagger;
}

/**
 * The row animates with the Web Animations API. `done` releases the transition,
 * so a mid-flight interruption still completes cleanly. Only compositor-friendly
 * properties are animated (`opacity`, `height`); a transform is never used here
 * because the list is a flow layout and moving a row would need a reflow anyway.
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
  if (suppressMotion) return;
  (el as HTMLElement).style.opacity = "0";
}

function onEnter(el: Element, done: () => void): void {
  if (suppressMotion) {
    done();
    return;
  }
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
  if (suppressMotion) {
    done();
    return;
  }
  // Leaving animates opacity only. Animating height here forced a layout pass on
  // every frame for each departing row, which is what made fast typing choppy:
  // entering and leaving rows overlapped and the list reflowed continuously.
  // The row keeps its slot for the duration of the fade, so nothing jumps; the
  // list height settles when Vue unmounts it.
  animateRow(
    el,
    [{ opacity: 1 }, { opacity: 0 }],
    reducedMotion() ? 1 : motionTiming().rowLeave,
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
        aria-label="Search targets and commands"
        @input="edited = true"
        @keydown="onKeydown"
      />
      <div class="palette__groups" role="group" aria-label="Command group">
        <button
          v-for="s in SCOPES"
          :key="s"
          type="button"
          class="palette__chip"
          :class="{ 'is-active': s === activeScope }"
          :aria-pressed="s === activeScope"
          @mousedown.prevent="chooseScope(s)"
        >
          {{ scopeLabel(s) }}
        </button>
      </div>
      <p v-if="usingFallback" class="palette__hint" aria-live="polite">
        No {{ scopeLabel(activeScope) }} matches — showing all groups
      </p>
      <p v-if="error" class="palette__error">{{ error }}</p>
      <ul ref="list" class="palette__list">
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
            :class="{ 'is-selected': index === selected, 'is-child': Boolean(row.depth) }"
            @mouseenter="selected = index"
            @click="activate(row)"
          >
            <span
              class="palette__label"
              :style="row.depth ? { paddingLeft: `${row.depth * 1.1}rem` } : undefined"
            >
              <span
                v-if="row.expandable"
                class="palette__chevron"
                @click.stop="toggleExpanded(row, !row.expanded)"
              >
                {{ row.expanded ? "▾" : "▸" }}
              </span>
              <template v-for="(part, partIndex) in labelParts(row)" :key="partIndex">
                <strong v-if="part.hit" class="palette__match">{{ part.text }}</strong>
                <template v-else
                  ><span class="palette__label__part">{{ part.text }}</span></template
                >
              </template>
            </span>
            <div class="palette__meta">
              <span v-if="usingFallback" class="palette__group-tag">{{
                scopeLabel(row.group)
              }}</span>
              <div
                class="palette__meta__key"
                v-for="(char, i) in row.accelerator?.split('')"
                :key="i"
              >
                <div :class="{ palette__accelerator__modifier: !/[A-Za-z0-9]/.test(char.trim()) }">
                  {{ char }}
                </div>
              </div>
              <div>{{ row.detail }}</div>
            </div>
          </li>
          <li v-if="!rows.length" key="palette-empty" class="palette__empty">No matches</li>
        </TransitionGroup>
      </ul>
      <div class="palette__footer">Tab switches group · ↑↓ move · ↵ select · esc close</div>
    </div>
  </div>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  top: var(--shell-inset, 0px);
  right: 0;
  bottom: 0;
  left: 0;
  /* The shell root is pointer-transparent; the palette takes input back. */
  pointer-events: auto;
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
  caret-shape: block;
  caret-color: var(--tb-fg-muted);
  caret-animation: manual;
  animation: custom-caret-animation infinite linear alternate 0.95s;
}

@keyframes custom-caret-animation {
  from {
    caret-color: transparent;
  }

  to {
    caret-color: var(--tb-fg-muted);
  }
}

.palette__input::placeholder {
  color: var(--tb-fg-subtle);
}

/* Group chips: the only grouping cue for now (section headers can come later).
   Tab cycles them; clicking is the mouse accelerator. */
.palette__groups {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--tb-border);
}

.palette__chip {
  padding: 3px 9px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--tb-fg-subtle);
  font: inherit;
  font-size: 12px;
  cursor: default;
  transition:
    background-color var(--tb-motion-fast) var(--tb-motion-ease-out),
    color var(--tb-motion-fast) var(--tb-motion-ease-out);
}

.palette__chip:hover {
  color: var(--tb-fg-muted);
}

.palette__chip.is-active {
  background: var(--tb-bg);
  /* border-col or: var(--tb-fg-subtle); */
  color: var(--tb-fg);
}

.palette__hint {
  margin: 0;
  padding: 8px 16px 0;
  color: var(--tb-fg-subtle);
  font-size: 12px;
}

.palette__group-tag {
  align-self: center;
  padding: 0 6px;
  border: 1px solid var(--tb-border);
  border-radius: 3px;
  font-size: 10px;
  line-height: 1.4;
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
  outline: none;
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

.palette__row.is-child {
  color: var(--tb-fg-subtle);
}

.palette__label {
  /* min-width: 0 lets this flex child shrink below its content width so the
     ellipsis engages instead of the text overflowing or wrapping. */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tb-fg);
}

.palette__chevron {
  display: inline-block;
  width: 1em;
  margin-right: 4px;
  color: var(--tb-fg-muted);
}

/* Fuzzy-match emphasis: the characters the query matched go bold in the theme
   accent, so the hit reads at a glance. Inline elements only, so the label's
   single-line ellipsis behavior is unaffected. */
.palette__match {
  font-weight: 600;
  color: var(--tb-accent);
}

.palette__meta {
  color: var(--tb-fg-subtle);
  font-size: 12px;
  flex: none;
  white-space: nowrap;

  display: flex;
  flex-direction: row;
  gap: 0.65rem;
  text-align: center;
  line-height: 1.5rem;
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

.palette__meta__key {
  border: 1px solid var(--tb-border);
  border-radius: 3px;
  width: 1.4rem;
  height: 1.4rem;
}

.palette__accelerator__modifier {
  font-size: 1.35rem;
}

.palette__footer {
  padding: 6px 12px;
  border-top: 1px solid var(--tb-border);
  color: var(--tb-fg-subtle);
  font-size: 11px;
  text-align: center;
}
</style>
