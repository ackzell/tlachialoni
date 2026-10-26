/**
 * Assembles the README GIFs from the frames a scenes capture recorded.
 *
 * `pnpm gifs` runs the capture in scenes mode, which writes one folder of PNGs
 * per scene plus a `manifest.json` describing the frame order and how long each
 * frame should be held (`docs/screenshots/.frames`). This script turns each scene
 * into `docs/gifs/<scene>.gif` and every scene, in order, into `docs/gifs/tour.gif`.
 *
 * Getting per-frame timing out of ffmpeg needs a small dance. The obvious inputs
 * do not work: the concat demuxer's `duration` is applied as a time bound (so an
 * image is duplicated into one frame per output-fps tick), and `-fps_mode
 * passthrough` on those images yields a uniform 25 fps. Duplicated frames are also
 * not free — a 2 s hold at 20 fps costs ~2.5 MB of identical frames.
 *
 * So each frame is first encoded on its own as a one-frame GIF whose framerate is
 * `1 / hold`, which is how a GIF carries a per-frame delay. Those one-frame GIFs
 * are then concatenated with `-fps_mode passthrough`, and the delays survive a
 * palette pass on the way out. The result is one encoded frame per image with a
 * per-frame delay, which is both exact and small.
 *
 * Needs ffmpeg on PATH. The frames are committed nowhere (see .gitignore); only
 * the GIFs are.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname ?? process.cwd(), "..");

/** Long edge of the committed GIFs. The README renders them near ~830 px wide. */
const DEFAULT_WIDTH = 760;
const DEFAULT_FRAMES = path.join(ROOT, "docs/screenshots/.frames");
const DEFAULT_OUT = path.join(ROOT, "docs/gifs");

function parseArgs(argv) {
  const args = { width: DEFAULT_WIDTH, frames: DEFAULT_FRAMES, out: DEFAULT_OUT, only: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--width") args.width = Number(argv[++i]);
    else if (arg === "--frames") args.frames = path.resolve(argv[++i]);
    else if (arg === "--out") args.out = path.resolve(argv[++i]);
    else if (arg === "--only")
      args.only = argv[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
  });
}

/**
 * Encodes one PNG as a single-frame GIF whose delay is `holdMs`. 1/fps is how the
 * GIF muxer derives a frame delay, so the framerate is the hold.
 *
 * The palette pass here is not for looks: ffmpeg's GIF encoder dithers by
 * default, and re-quantising a dithered frame is both lossy and — because the
 * dither is noise — expensive to compress. Quantising without dither keeps the
 * intermediate honest, so the final palette pass reproduces it almost exactly.
 */
function encodeHoldFrame(png, holdMs, out) {
  const filter =
    "split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=full[p];" +
    "[s1][p]paletteuse=dither=none";
  ffmpeg(["-i", png, "-frames:v", "1", "-vf", filter, "-r", String(1000 / holdMs), out]);
}

/**
 * Concatenates one-frame GIFs into a single looping GIF, applying the palette and
 * the scale on the way out. `-fps_mode passthrough` is what keeps the per-frame
 * delays the one-frame GIFs already carry.
 */
function concatGifs(frameGifs, out, width) {
  const listPath = path.join(path.dirname(out), `.concat-${path.basename(out, ".gif")}.txt`);
  fs.writeFileSync(listPath, frameGifs.map((file) => `file '${file}'`).join("\n") + "\n");
  try {
    const filter =
      `scale=${width}:-2:flags=lanczos,` +
      "split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=full[p];" +
      "[s1][p]paletteuse=dither=none";
    ffmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-fps_mode",
      "passthrough",
      "-vf",
      filter,
      "-loop",
      "0",
      out,
    ]);
  } finally {
    fs.rmSync(listPath, { force: true });
  }
}

function buildGif(frames, framesRoot, out, width, tmp) {
  const gifs = frames.map((frame, index) => {
    const gif = path.join(tmp, `${String(index).padStart(3, "0")}.gif`);
    encodeHoldFrame(path.join(framesRoot, frame.file), Math.max(20, frame.holdMs), gif);
    return gif;
  });
  concatGifs(gifs, out, width);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg is not on PATH; install it (brew install ffmpeg) and re-run.");
  }

  const manifestPath = path.join(args.frames, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`no manifest at ${manifestPath}. Run the scenes capture first: pnpm gifs`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const scenes = manifest.scenes.filter(
    (scene) => scene.frames.length > 0 && (!args.only || args.only.includes(scene.name)),
  );
  if (scenes.length === 0) throw new Error("the manifest has no frames to assemble");

  fs.mkdirSync(args.out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tlachialoni-gifs-"));

  const rows = [];
  try {
    for (const scene of scenes) {
      const out = path.join(args.out, `${scene.name}.gif`);
      buildGif(scene.frames, args.frames, out, args.width, tmp);
      rows.push([scene.name, scene.frames.length, fs.statSync(out).size]);
    }

    const tourFrames = scenes.flatMap((scene) => scene.frames);
    const tourOut = path.join(args.out, "tour.gif");
    buildGif(tourFrames, args.frames, tourOut, args.width, tmp);
    rows.push(["tour", tourFrames.length, fs.statSync(tourOut).size]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const kib = (bytes) => `${(bytes / 1024).toFixed(0)} KiB`;
  const width = Math.max(...rows.map(([name]) => name.length));
  process.stdout.write(
    `\n${"gif".padEnd(width)}  ${"frames".padStart(6)}  ${"size".padStart(9)}\n`,
  );
  for (const [name, frames, bytes] of rows) {
    process.stdout.write(
      `${name.padEnd(width)}  ${String(frames).padStart(6)}  ${kib(bytes).padStart(9)}\n`,
    );
  }
  const total = rows.reduce((sum, [, , bytes]) => sum + bytes, 0);
  process.stdout.write(
    `${"".padEnd(width)}  ${"".padStart(6)}  ${kib(total).padStart(9)}  total\n`,
  );
  if (manifest.demoUp === false) {
    process.stdout.write("\nnote: the test card was unreachable, so themed-devtools was skipped\n");
  }
  for (const warning of manifest.warnings ?? []) process.stdout.write(`warning: ${warning}\n`);
}

main();
