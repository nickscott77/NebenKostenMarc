import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { daysInclusive } from "../js/billing.js";
import { loadState, validate, exportJson } from "../js/store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seedRaw = readFileSync(join(root, "data/seed-2025.json"), "utf8");

let passed = 0, failed = 0;
export function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL:", name, "-", e.message); }
}
export function eq(a, b, msg = "") {
  if (a !== b) throw new Error(`${msg} erwartet ${JSON.stringify(b)}, war ${JSON.stringify(a)}`);
}
export function throws(fn, msg = "") {
  try { fn(); } catch { return; }
  throw new Error(`${msg} hat nicht geworfen`);
}

// --- Smoke ---
test("runner läuft", () => eq(1, 1));

// --- Store / Seed (Task 2) ---
test("seed lädt und validiert", () => {
  const s = loadState(seedRaw);
  eq(s.garages.length, 15, "garagen+waschhaus ");
  eq(s.tenants.length, 3, "demo-mieter ");
});
test("falsche schemaVersion wird abgelehnt", () => {
  throws(() => loadState('{"schemaVersion":99}'), "schema ");
});
test("Überlappung wird erkannt", () => {
  const s = JSON.parse(seedRaw);
  s.occupancy.push({ garageId: "g1", tenantId: "t-demo-b", from: "2025-06-01", to: null });
  eq(validate(s).some((e) => e.includes("Überlappung")), true, "overlap ");
  throws(() => loadState(s), "loadState ");
});
test("export round-trippt", () => {
  const s = loadState(seedRaw);
  const s2 = loadState(exportJson(s));
  eq(s2.garages.length, s.garages.length, "roundtrip ");
});

console.log(`${passed + failed} tests, ${failed} failed`);
process.exit(failed ? 1 : 0);
