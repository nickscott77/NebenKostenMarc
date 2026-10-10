import { daysInclusive } from "../js/billing.js";

let passed = 0, failed = 0;
export function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL:", name, "-", e.message); }
}
export function eq(a, b, msg = "") {
  if (a !== b) throw new Error(`${msg} erwartet ${b}, war ${a}`);
}
// Tests für Task 0 als Smoke:
test("runner läuft", () => eq(1, 1));
console.log(`${passed + failed} tests, ${failed} failed`);
process.exit(failed ? 1 : 0);
