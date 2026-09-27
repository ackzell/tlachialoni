<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ url: string; reason: string; previousUrl?: string | null }>();
const api = window.tlachialoni;

const displayUrl = computed(() => props.url || "the current target");

function retry(): void {
  void api.runCommand("failure.retry");
}

function editUrl(): void {
  // Prefill the target that actually failed, not the last successful one.
  void api.runCommand("palette.editUrl", props.url || undefined);
}

function goBack(): void {
  void api.runCommand("failure.dismiss");
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
        <button v-if="previousUrl" class="failure__btn" @click="goBack">Go Back</button>
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
  background: var(--tb-bg);
}

.failure__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  width: min(440px, 88vw);
  padding: 28px 24px;
  text-align: center;
  background: var(--tb-bg-elevated);
  border: 1px solid var(--tb-border);
  border-radius: 10px;
}

.failure__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--tb-fg);
}

.failure__url {
  margin: 0;
  color: var(--tb-accent);
  font-size: 12px;
  word-break: break-all;
}

.failure__reason {
  margin: 0;
  color: var(--tb-fg-muted);
  font-size: 12px;
}

.failure__actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.failure__btn {
  padding: 6px 14px;
  background: var(--tb-surface);
  border: 1px solid var(--tb-border);
  border-radius: 6px;
  color: var(--tb-fg);
  cursor: pointer;
}

.failure__btn:hover {
  background: var(--tb-hover);
}

.failure__btn--primary {
  color: var(--tb-accent);
  border-color: var(--tb-signature);
}
</style>
