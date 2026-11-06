<script setup lang="ts">
/**
 * The frame status demo (specs/028).
 *
 * Four embeddings in one page: two refused by response headers, one closed port,
 * and one that loads. The three failures are what the shell marks; the fourth is
 * the control that proves a live frame is never covered.
 *
 * The endpoints come from `vite.config.ts`, so the demo needs no second server
 * and no network.
 */
interface Demo {
  id: string;
  label: string;
  note: string;
  src: string;
}

/**
 * Both refusal endpoints are same-origin, which is the case where Chromium names
 * the ancestor rather than the framed page. The marker still covers the frame and
 * says the response headers blocked it; only the X-Frame-Options one can name its
 * family, because the browser reports that one from the frame itself.
 */
const demos: Demo[] = [
  {
    id: "csp",
    label: "Refused · frame-ancestors",
    note: "The framed page forbids every ancestor.",
    src: "/frames/refused",
  },
  {
    id: "xfo",
    label: "Refused · X-Frame-Options",
    note: "The framed page sends X-Frame-Options: DENY.",
    src: "/frames/xfo",
  },
  {
    id: "closed",
    label: "Closed port",
    note: "Nothing listens on 45999, so the frame is refused.",
    src: "http://localhost:45999/",
  },
  {
    id: "live",
    label: "Allowed",
    note: "This one loads. Nothing should cover it.",
    src: "/frames/live",
  },
];
</script>

<template>
  <section class="frames">
    <p class="frames__lead">
      Three of these frames cannot load. Each failure should be covered in place, naming its reason;
      the fourth should render untouched.
    </p>

    <div class="frames__grid">
      <figure v-for="demo in demos" :key="demo.id" class="frames__item" :data-demo="demo.id">
        <figcaption class="frames__caption">
          <span class="frames__label">{{ demo.label }}</span>
          <span class="frames__note">{{ demo.note }}</span>
        </figcaption>
        <div class="frames__stage">
          <iframe :src="demo.src" :title="demo.label" loading="eager" />
        </div>
      </figure>
    </div>
  </section>
</template>

<style scoped>
.frames {
  display: grid;
  gap: 1.25rem;
  min-width: 0;
}

.frames__lead {
  margin: 0;
  max-width: 62ch;
  color: var(--muted);
}

.frames__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

@media (width < 48rem) {
  .frames__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.frames__item {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  min-width: 0;
}

.frames__caption {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}

.frames__label {
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.frames__note {
  color: var(--muted);
  font-size: 0.8rem;
}

.frames__stage {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--rule, color-mix(in srgb, var(--fg) 18%, transparent));
  background: color-mix(in srgb, var(--fg) 6%, var(--bg));
}

.frames__stage iframe {
  display: block;
  width: 100%;
  height: 12rem;
  border: 0;
}
</style>
