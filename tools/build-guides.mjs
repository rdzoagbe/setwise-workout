#!/usr/bin/env node
// Generates the offline exercise-guide bundle from the upstream RepDB dataset.
//
// WHY THIS EXISTS
// RepDB's free-tier data licence (LICENSE-DATA.md) permits "in-app use only" and
// forbids republishing the dataset "as a dataset, dataset repository, or API".
// So the RepDB records and images must NOT live in this git repository. They are
// fetched here and written into the deployed artifact only. Both outputs are
// gitignored; CI runs this before publishing.
//
// Outputs (generated, never committed):
//   bundled-guides.js      ~120 KB  records keyed by Setwise exercise name
//   assets/guides/*.webp   ~2.1 MB  real image files, not base64
//
// The emitted `images` map holds relative URLs rather than data URIs, which is
// what exercise-guide.js:safeImageUrl() already expects — so no consumer code
// changes. Real files also let the service worker runtime-cache them
// individually instead of forcing one atomic 2.3 MB precache.
//
// Run locally with:  node tools/build-guides.mjs

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/";
const DATASET = UPSTREAM + "exercises.json";
const IMAGE_DIR = "assets/guides";
const OUT_JS = "bundled-guides.js";

// Guard rails. A silent upstream change must fail the build, not ship an empty
// guide file that nobody notices until a user opens an exercise offline.
const MIN_RECORDS = 45;
// Only fields present on all 49 selected records. Verified against upstream:
// `equipment` (44/49) and `secondary_muscles` (47/49) are legitimately absent on
// some bodyweight and single-muscle movements, so they must NOT be required.
const REQUIRED_FIELDS = [
  "id", "name_en", "body_part", "primary_muscles", "instructions_en", "images",
];

const fail = (msg) => {
  console.error(`\n  build-guides: ${msg}\n`);
  process.exit(1);
};

async function fetchOk(url, as) {
  const res = await fetch(url);
  if (!res.ok) fail(`GET ${url} -> HTTP ${res.status}`);
  return as === "buffer" ? Buffer.from(await res.arrayBuffer()) : res.json();
}

const manifest = JSON.parse(
  await readFile(resolve(ROOT, "tools/guide-manifest.json"), "utf8"),
);
const wanted = Object.entries(manifest);
console.log(`build-guides: ${wanted.length} exercises in manifest`);

const payload = await fetchOk(DATASET);
const upstream = payload.exercises;
if (!Array.isArray(upstream)) fail("upstream payload has no `exercises` array");
console.log(`build-guides: upstream dataset has ${upstream.length} exercises`);
console.log(`build-guides: upstream licence field: ${JSON.stringify(payload.license)}`);

const byId = new Map(upstream.map((e) => [e.id, e]));

const records = {};
const imageTasks = new Map(); // upstream relative path -> local basename
const missing = [];

for (const [key, id] of wanted) {
  const rec = byId.get(id);
  if (!rec) { missing.push(`${key} (id: ${id})`); continue; }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in rec)) fail(`record "${id}" is missing required field "${field}" — upstream schema changed`);
  }

  records[key] = rec;

  // Most records carry a start/peak pair. Static holds (plank, farmer carry)
  // carry a single `main` image instead, which exercise-guide.js falls back to.
  const flat = rec.images?.flat ?? {};
  for (const path of [flat.start, flat.peak, flat.main]) {
    if (typeof path !== "string") continue;
    // Mirror the exact pattern exercise-guide.js:safeImageUrl() accepts.
    if (!/^images\/flat\/[a-z0-9-]+\.webp$/i.test(path)) {
      fail(`record "${id}" has an unexpected image path: ${path}`);
    }
    imageTasks.set(path, path.split("/").pop());
  }
}

if (missing.length) {
  fail(`${missing.length} manifest entries are absent upstream:\n    ` + missing.join("\n    "));
}
const count = Object.keys(records).length;
if (count < MIN_RECORDS) fail(`only ${count} records resolved, expected at least ${MIN_RECORDS}`);

// Fetch images with a small concurrency cap so we don't hammer the CDN.
await mkdir(resolve(ROOT, IMAGE_DIR), { recursive: true });
const tasks = [...imageTasks.entries()];
const images = {};
let bytes = 0;

const worker = async () => {
  for (;;) {
    const next = tasks.shift();
    if (!next) return;
    const [path, basename] = next;
    const buf = await fetchOk(UPSTREAM + path, "buffer");
    if (buf.length === 0) fail(`image ${path} came back empty`);
    await writeFile(resolve(ROOT, IMAGE_DIR, basename), buf);
    images[path] = `./${IMAGE_DIR}/${basename}`;
    bytes += buf.length;
  }
};
await Promise.all(Array.from({ length: 8 }, worker));

const banner =
  "// GENERATED FILE - DO NOT EDIT, DO NOT COMMIT.\n" +
  "// Rebuild with: node tools/build-guides.mjs\n" +
  "// Exercise data by RepDB (https://repdb.co), used in-app under its free-tier\n" +
  "// licence: https://github.com/RepDB/exercise-dataset/blob/main/LICENSE-DATA.md\n";

await writeFile(
  resolve(ROOT, OUT_JS),
  banner + "window.SetwiseBundledGuides=" + JSON.stringify({ records, images }) + ";\n",
);

const jsKb = Math.round((await readFile(resolve(ROOT, OUT_JS))).length / 1024);
console.log(
  `build-guides: wrote ${OUT_JS} (${jsKb} KB, ${count} records) ` +
  `and ${Object.keys(images).length} images into ${IMAGE_DIR}/ (${Math.round(bytes / 1024)} KB)`,
);
