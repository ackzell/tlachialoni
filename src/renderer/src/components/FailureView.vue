<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ url: string; reason: string }>();
const api = window.localbrowser;

const displayUrl = computed(() => props.url || "the current target");

function retry(): void {
  void api.runCommand("failure.retry");
}

function editUrl(): void {
  void api.runCommand("palette.editUrl");
}
</script>

<template>
  <div class="failure">
    <div class="failure__card">
      <h1 class="failure__title">Can't reach this target</h1>
      <p class="failure__url">{{ displayUrl }}</p>
      <p class="failure__reason">{{ reason }}</p>
      <div class="failure__actions">
        <button class="failure__btn failure__btn--primary" @click="retry">Retry</button>
        <button class="failure__btn" @click="editUrl">Edit URL</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.failure {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--lb-bg);
}

.failure__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  width: min(440px, 88vw);
  padding: 28px 24px;
  text-align: center;
  background: var(--lb-bg-elevated);
  border: 1px solid var(--lb-border);
  border-radius: 10px;
}

.failure__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--lb-fg);
}

.failure__url {
  margin: 0;
  color: var(--lb-accent);
  font-size: 12px;
  word-break: break-all;
}

.failure__reason {
  margin: 0;
  color: var(--lb-fg-muted);
  font-size: 12px;
}

.failure__actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.failure__btn {
  padding: 6px 14px;
  background: var(--lb-surface);
  border: 1px solid var(--lb-border);
  border-radius: 6px;
  color: var(--lb-fg);
  cursor: pointer;
}

.failure__btn:hover {
  background: var(--lb-hover);
}

.failure__btn--primary {
  color: var(--lb-accent);
  border-color: var(--lb-signature);
}
</style>
