<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { buildRows, type Row } from "../composables/useCommands";
import { closePalette, useShell } from "../composables/useShell";

const props = defineProps<{ initial: string }>();
const api = window.localbrowser;
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
        <li
          v-for="(row, index) in rows"
          :key="row.id + row.label"
          class="palette__row"
          :class="{ 'is-selected': index === selected }"
          @mouseenter="selected = index"
          @click="activate(row)"
        >
          <span class="palette__label">{{ row.label }}</span>
          <span class="palette__meta">{{ row.accelerator ?? row.detail }}</span>
        </li>
        <li v-if="!rows.length" class="palette__empty">No matches</li>
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
  background: color-mix(in srgb, var(--lb-bg) 45%, transparent);
  backdrop-filter: blur(2px);
  user-select: none;
}

.palette {
  width: min(640px, 90vw);
  background: var(--lb-bg-elevated);
  border: 1px solid var(--lb-border);
  border-radius: 8px;
  box-shadow: 0 24px 60px rgb(0 0 0 / 45%);
  overflow: hidden;
}

.palette__input {
  width: 100%;
  box-sizing: border-box;
  padding: 14px 16px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--lb-border);
  outline: none;
  color: var(--lb-fg);
  font: inherit;
  font-size: 14px;
}

.palette__input::placeholder {
  color: var(--lb-fg-subtle);
}

.palette__error {
  margin: 0;
  padding: 8px 16px;
  color: var(--lb-error);
  font-size: 12px;
}

.palette__list {
  margin: 0;
  padding: 6px;
  list-style: none;
  max-height: 46vh;
  overflow-y: auto;
}

.palette__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  color: var(--lb-fg-muted);
  cursor: default;
}

.palette__row.is-selected {
  background: var(--lb-hover);
  color: var(--lb-fg);
}

.palette__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette__meta {
  color: var(--lb-fg-subtle);
  font-size: 12px;
  flex: none;
}

/* The hover fill lands near --lb-fg-subtle, so lift the meta on the active row. */
.palette__row.is-selected .palette__meta {
  color: var(--lb-fg-muted);
}

.palette__empty {
  padding: 10px;
  color: var(--lb-fg-subtle);
  font-size: 12px;
}
</style>
