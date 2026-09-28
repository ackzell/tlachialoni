/**
 * Spike harness: mounts one row-animation candidate over the app's real row
 * model so the probe can compare techniques like-for-like.
 *
 * Selected with ?tech=A|B|C|D|E. The probe reads `window.__harness` to learn the
 * model row count and drives input through `window.__harness.type()`.
 */
import { createApp, h, ref, computed, TransitionGroup, nextTick } from "/vue.js";
import { buildRows } from "/app/src/renderer/src/composables/useCommands.ts";
import { PALETTE_COMMANDS } from "/app/src/shared/commands.ts";

const params = new URLSearchParams(location.search);
const tech = (params.get("tech") ?? "A").toUpperCase();

const query = ref("");
const rows = computed(() => buildRows(query.value, [], PALETTE_COMMANDS));

// Mirrors the app's key choice. `row.key` is now the app's stable identity, so
// the harness must use it too or it would test a key scheme the app no longer has.
const rowKey = (row) => row.key;
const label = (row) => row.label;
const meta = (row) => row.accelerator ?? row.detail ?? "";

/** Row children, identical across candidates. */
const rowChildren = (row) => [
  h("span", { class: "palette__label" }, label(row)),
  h("span", { class: "palette__meta" }, meta(row)),
];

const listProps = { class: "palette__list" };

function emptyRow() {
  return h(
    "li",
    { key: "__empty__", class: "palette__empty", "data-row": "__empty__" },
    "No matches",
  );
}

/** Candidate A: plain list, no animation. */
function plainList() {
  return h("ul", { ...listProps, "data-list": "" }, [
    ...rows.value.map((row, index) =>
      h(
        "li",
        {
          key: rowKey(row),
          class: ["palette__row", { "is-selected": index === 0 }],
          "data-row": row.id,
        },
        rowChildren(row),
      ),
    ),
    rows.value.length === 0 ? emptyRow() : null,
  ]);
}

/** Candidates B, C, E: TransitionGroup variants. */
function transitionGroupList(name) {
  const children = rows.value.length
    ? rows.value.map((row, index) =>
        h(
          "li",
          {
            key: rowKey(row),
            class: ["palette__row", { "is-selected": index === 0 }],
            "data-row": row.id,
          },
          rowChildren(row),
        ),
      )
    : [emptyRow()];
  return h(
    TransitionGroup,
    { tag: "ul", ...listProps, "data-list": "", name },
    { default: () => children },
  );
}

/** Candidate D: plain list, keyframe entry for keys that are new this render. */
const seenKeys = new Set();
function keyframeList() {
  const nodes = rows.value.map((row, index) => {
    const key = rowKey(row);
    const isNew = !seenKeys.has(key);
    return h(
      "li",
      {
        key,
        class: ["palette__row", { "is-selected": index === 0, "row-in": isNew }],
        "data-row": row.id,
      },
      rowChildren(row),
    );
  });
  if (rows.value.length === 0) nodes.push(emptyRow());
  return h("ul", { ...listProps, "data-list": "" }, nodes);
}

const RENDERERS = {
  A: plainList,
  B: () => transitionGroupList("palette-row"),
  C: () => transitionGroupList("palette-row"),
  D: keyframeList,
  E: () => transitionGroupList("palette-row"),
};

// A real component with a render function (not a bare setup() object).
const Root = { name: `candidate-${tech}`, render: RENDERERS[tech] ?? RENDERERS.A };
createApp(Root).mount("#mount");

// Candidate C's defining hack: leaving rows leave the flow.
if (tech === "C") {
  const style = document.createElement("style");
  style.textContent = `.palette-row-leave-active { position: absolute; left: 6px; right: 6px; width: auto; }`;
  document.head.appendChild(style);
}

const input = document.getElementById("query");
input.addEventListener("input", () => {
  query.value = input.value;
  nextTick(() => {
    for (const row of rows.value) seenKeys.add(rowKey(row));
  });
});

window.__harness = {
  tech,
  get modelRows() {
    return rows.value.length;
  },
  type(value) {
    input.value = value;
    input.dispatchEvent(new Event("input"));
  },
};
