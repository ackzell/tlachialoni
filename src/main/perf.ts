/**
 * Dev-only startup timing and process metrics.
 *
 * Everything here is inert unless an env flag turns it on:
 *
 * - `TLACHIALONI_PERF=1` records marks into one ordered timeline and prints it.
 * - `TLACHIALONI_METRICS=1` prints a per-process table (type, pid, working set,
 *   CPU percent) on demand.
 *
 * With neither flag set the module samples a monotonic timestamp and does
 * nothing else, so a normal run stays byte-for-byte identical to one without
 * this file. The dump handlers are installed by `installPerfHooks`, never at
 * module load.
 */

import { performance } from "node:perf_hooks";
import { app } from "electron";

const PERF = process.env.TLACHIALONI_PERF === "1";
const METRICS = process.env.TLACHIALONI_METRICS === "1";

/** Monotonic origin, sampled once when this module first loads. */
const origin = performance.now();

interface Mark {
  name: string;
  /** Milliseconds since `origin`. */
  at: number;
}

const marks: Mark[] = [];

/** Records one point on the startup timeline (a no-op unless perf is on). */
export function mark(name: string): void {
  if (!PERF) return;
  marks.push({ name, at: performance.now() - origin });
}

/** Prints the ordered mark timeline (a no-op unless perf is on). */
export function report(): void {
  if (!PERF) return;
  const rows = marks.map((entry, index) => {
    const previous = index === 0 ? 0 : marks[index - 1].at;
    const delta = entry.at - previous;
    const at = entry.at.toFixed(2).padStart(9);
    const step = `+${delta.toFixed(2)}`.padStart(9);
    return `  ${at} ms  ${step} ms  ${entry.name}`;
  });
  process.stdout.write(`[perf] startup marks\n${rows.join("\n")}\n`);
}

/** Prints the per-process metrics table (a no-op unless metrics is on). */
function printMetrics(): void {
  if (!METRICS) return;
  const rows = app.getAppMetrics().map((metric) => ({
    type: metric.type,
    pid: String(metric.pid),
    rssMiB: (metric.memory.workingSetSize / 1024).toFixed(1),
    cpuPct: metric.cpu.percentCPUUsage.toFixed(1),
  }));

  const columns = [
    { header: "process", values: rows.map((row) => row.type) },
    { header: "pid", values: rows.map((row) => row.pid) },
    { header: "rss mib", values: rows.map((row) => row.rssMiB) },
    { header: "cpu %", values: rows.map((row) => row.cpuPct) },
  ];
  const widths = columns.map((column) =>
    Math.max(column.header.length, ...column.values.map((value) => value.length)),
  );
  const format = (cells: string[]): string =>
    cells.map((cell, index) => cell.padStart(widths[index])).join("  ");

  const header = format(columns.map((column) => column.header));
  const body = rows
    .map((row) => format([row.type, row.pid, row.rssMiB, row.cpuPct]))
    .join("\n");
  process.stdout.write(`[metrics]\n${header}\n${body}\n`);
}

/**
 * Wires the quit and `SIGUSR2` dumps. A no-op when both flags are absent, so a
 * normal run installs no extra handlers. Call once, after `app` is available.
 */
export function installPerfHooks(): void {
  if (!PERF && !METRICS) return;
  const dump = (): void => {
    report();
    printMetrics();
  };
  app.on("before-quit", dump);
  process.on("SIGUSR2", dump);
}
