import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { daysInclusive, meterUsage, billTenant } = require("../js/billing.js");
const { loadState, validate, exportJson } = require("../js/store.js");

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

// --- Billing (Task 3) ---
const demo = loadState(seedRaw);
test("tage inklusiv", () => {
  eq(daysInclusive("2025-01-01", "2025-12-31"), 365, "jahr ");
  eq(daysInclusive("2025-06-01", "2025-06-01"), 1, "ein tag ");
});
test("zählerdifferenz ganzjährig", () => {
  const u = meterUsage(demo.readings, "m-g1", "2025-01-01", "2025-12-31");
  eq(u.kwh, 7.84, "g1 ");
  eq(u.estimated, false, "exakt ");
});
test("sammelrechnung demo A = 19,26 €", () => {
  const b = billTenant(demo, "t-demo-a", "2025-01-01", "2025-12-31");
  eq(b.total, 19.26, "total ");
  eq(b.lines.filter((l) => l.kind === "strom").length, 2, "stromzeilen ");
});
test("wechsel g3: B + C = ganzjahr ±1ct", () => {
  const bB = billTenant(demo, "t-demo-b", "2025-01-01", "2025-06-30");
  const bC = billTenant(demo, "t-demo-c", "2025-07-01", "2025-12-31");
  const g3 = (b) => b.lines.filter((l) => l.garage === "Garage 3").reduce((s, l) => s + l.amount, 0);
  const full = 57.91 * 0.33 + 100 / 14;
  const diff = Math.abs(g3(bB) + g3(bC) - full);
  eq(diff < 0.02, true, `diff ${diff} `);
});
test("fehlende ablesung wird markiert", () => {
  const s = JSON.parse(exportJson(demo));
  s.readings = s.readings.filter((r) => r.meterId !== "m-g2");
  const b = billTenant(loadState(s), "t-demo-a", "2025-01-01", "2025-12-31");
  eq(b.lines.find((l) => l.garage === "Garage 2").estimated, true, "schaetzung ");
  eq(b.hints.length > 0, true, "hinweis ");
});
test("mieter ohne belegung = 0,00 €", () => {
  const s = JSON.parse(exportJson(demo));
  s.tenants.push({ id: "t-leer", firstName: "Leer", lastName: "Mieter" });
  eq(billTenant(loadState(s), "t-leer", "2025-01-01", "2025-12-31").total, 0, "leer ");
});

test("wechsel OHNE stichtag: schätzung, B + C ≈ ganzjahr", () => {
  const s = JSON.parse(exportJson(demo));
  s.readings = s.readings.filter((r) => !(r.meterId === "m-g3" && r.date === "2025-06-30"));
  const st = loadState(s);
  const bB = billTenant(st, "t-demo-b", "2025-01-01", "2025-06-30");
  const bC = billTenant(st, "t-demo-c", "2025-07-01", "2025-12-31");
  const g3 = (b) => b.lines.filter((l) => l.garage === "Garage 3");
  eq(g3(bB).every((l) => l.kind !== "strom" || l.estimated), true, "B geschaetzt ");
  eq(g3(bC).every((l) => l.kind !== "strom" || l.estimated), true, "C geschaetzt ");
  const sum = g3(bB).concat(g3(bC)).reduce((t, l) => t + l.amount, 0);
  const full = 57.91 * 0.33 + 100 / 14;
  eq(Math.abs(sum - full) < 0.05, true, `sum ${sum} vs ${full} `);
});
test("fallender zählerstand wird erkannt", () => {
  const s = JSON.parse(exportJson(demo));
  s.readings.push({ meterId: "m-g1", date: "2026-01-01", value: 5 });
  eq(validate(s).some((e) => e.includes("fallender")), true, "validate ");
  const u = meterUsage(s.readings, "m-g1", "2025-12-31", "2026-01-01");
  eq(u.estimated, true, "flag ");
  eq(u.kwh, 0, "kein negativ ");
});
test("grundgebühr wird umgelegt", () => {
  const s = JSON.parse(exportJson(demo));
  s.years[0].baseFeeTotal = 150;
  const b = billTenant(loadState(s), "t-demo-a", "2025-01-01", "2025-12-31");
  eq(b.lines.filter((l) => l.kind === "grundgebuehr").length, 2, "zeilen ");
  eq(b.lines.filter((l) => l.kind === "grundgebuehr").reduce((t, l) => t + l.amount, 0), 20, "10+10 ");
});
test("schaltjahr hat 366 tage", () => {
  eq(daysInclusive("2024-01-01", "2024-12-31"), 366, "2024 ");
});
test("unbekannter umlageschlüssel wird gemeldet", () => {
  const s = JSON.parse(exportJson(demo));
  s.years[0].costs.push({ date: "2025-05-01", label: "X", amount: 50, key: "pro-kwh" });
  const b = billTenant(loadState(s), "t-demo-a", "2025-01-01", "2025-12-31");
  eq(b.hints.some((h) => h.includes("pro-kwh")), true, "hint ");
});
test("zeitraum validierung: leere/vertauschte daten werfen", () => {
  throws(() => billTenant(demo, "t-demo-a", "", "2025-12-31"), "leer ");
  throws(() => billTenant(demo, "t-demo-a", "2025-12-31", "2025-01-01"), "vertauscht ");
});
test("doppelte ablesung (zaehler+datum) wird erkannt", () => {
  const s = JSON.parse(exportJson(demo));
  s.readings.push({ meterId: "m-g1", date: "2025-12-31", value: 8 });
  eq(validate(s).some((e) => e.includes("doppelte Ablesung")), true, "validate ");
  throws(() => loadState(s), "loadState ");
});
test("seed-data.js synchron mit seed-2025.json", () => {
  const gen = readFileSync(join(root, "js/seed-data.js"), "utf8");
  const m = gen.match(/^window\.NKM_SEED = (.*);$/s);
  eq(!!m, true, "format ");
  eq(JSON.stringify(JSON.parse(m[1])), JSON.stringify(JSON.parse(seedRaw)), "inhalt ");
});

// --- DOM-Smoke (jsdom): echtes index.html booten wie im Browser ---
function bootPage() {
  const { JSDOM } = require("jsdom");
  const html = readFileSync(join(root, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  for (const src of ["js/seed-data.js", "js/billing.js", "js/store.js", "js/app.js"]) {
    w.eval(readFileSync(join(root, src), "utf8"));
  }
  if (w.document.readyState === "loading") {
    w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  }
  return w;
}
function submitForm(w, form) {
  form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
}
test("dom: boot rendert 7 reiter, status bereit", () => {
  const w = bootPage();
  eq(w.document.querySelectorAll("nav.tabs button").length, 7, "reiter ");
  eq(w.document.getElementById("app-status").textContent, "bereit", "status ");
});
test("dom: vermieter-tab formular + speichern in localStorage", () => {
  const w = bootPage();
  w.document.querySelector('[data-tab="vermieter"]').click();
  const f = w.document.getElementById("f-landlord");
  eq(!!f, true, "formular ");
  f.querySelector('[name="name"]').value = "Neue Garagenvermietung";
  submitForm(w, f);
  const snap = JSON.parse(w.localStorage.getItem("nkm-v1"));
  eq(snap.landlord.name, "Neue Garagenvermietung", "gespeichert ");
});
test("dom: sammelrechnung zeigt vermieterkopf + bankdaten", () => {
  const w = bootPage();
  w.document.querySelector('[data-tab="abrechnung"]').click();
  const f = w.document.getElementById("f-bill");
  f.querySelector('[name="from"]').value = "2025-01-01";
  f.querySelector('[name="to"]').value = "2025-12-31";
  submitForm(w, f);
  const h = w.document.getElementById("app").innerHTML;
  eq(h.includes("Garagenvermietung Muster"), true, "vermieterkopf ");
  eq(h.includes("DE00 0000 0000 0000 0000 00"), true, "iban ");
  eq(h.includes("Rechnungsbetrag"), true, "summe ");
});
test("dom: vertauschter zeitraum zeigt fehler statt 0,00 €", () => {
  const w = bootPage();
  w.document.querySelector('[data-tab="abrechnung"]').click();
  const f = w.document.getElementById("f-bill");
  f.querySelector('[name="from"]').value = "2025-12-31";
  f.querySelector('[name="to"]').value = "2025-01-01";
  submitForm(w, f);
  eq(w.document.querySelector(".error") !== null, true, "fehlerbox ");
});

console.log(`${passed + failed} tests, ${failed} failed`);
process.exit(failed ? 1 : 0);
