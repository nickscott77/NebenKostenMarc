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
function bootPage(beforeBoot) {
  const { JSDOM } = require("jsdom");
  const html = readFileSync(join(root, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  if (beforeBoot) beforeBoot(w);
  for (const src of [...w.document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src"))) {
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

test("mobil: media-query + ios-zoom-fix im stylesheet", () => {
  const css = readFileSync(join(root, "css/style.css"), "utf8");
  eq(css.includes("@media (max-width: 640px)"), true, "media query ");
  eq(css.includes("input, select { font-size: 16px; }"), true, "ios zoom fix ");
  eq(css.includes("table { display: block; overflow-x: auto; }"), true, "table scroll ");
});
test("mobil: stylesheet cache-bust aktuell (?v=4)", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  eq(html.includes("css/style.css?v=4"), true, "cache bust ");
});

// --- Live-Abrechnung und sichere Wiederherstellung ---
function openTab(w, tab) {
  const button = w.document.querySelector(`[data-tab="${tab}"]`);
  if (button) button.click();
  else if (tab !== "daten" || !w.document.getElementById("file-import")) throw new Error("Reiter fehlt: " + tab);
}
function fillAndSubmit(w, id, values) {
  const form = w.document.getElementById(id);
  for (const [name, value] of Object.entries(values)) form.querySelector(`[name="${name}"]`).value = value;
  submitForm(w, form);
}
function calculateDemo(w, from = "2025-01-01", to = "2025-12-31") {
  openTab(w, "abrechnung");
  fillAndSubmit(w, "f-bill", { tenant: "t-demo-a", from, to });
}
function invoiceTotal(w) {
  return w.document.querySelector("table tr:last-child th:last-child").textContent;
}
// FileReader synchron für diesen synchronen Runner; echter Import-Handler bleibt unverändert.
function importJson(w, text, failRead = false) {
  openTab(w, "daten");
  const input = w.document.getElementById("file-import");
  Object.defineProperty(input, "files", { configurable: true, value: [{ name: "synthetic.json" }] });
  w.FileReader = class {
    readAsText() {
      if (failRead) { this.onerror(); return; }
      this.result = text;
      this.onload();
    }
  };
  input.onchange();
}
function captureDownload(w) {
  let blob = null, filename = null;
  w.URL.createObjectURL = (value) => { blob = value; return "blob:synthetic"; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  w.Blob = class {
    constructor(parts) { this.text = parts.join(""); }
  };
  return () => ({ text: blob && blob.text, filename });
}

test("store: fehlende Pflichtlisten und falsche Einträge liefern Validierungsfehler", () => {
  throws(() => loadState({ schemaVersion: 1 }), "fehlende Listen ");
  for (const name of ["garages", "tenants", "occupancy", "readings", "years"]) {
    for (const value of [undefined, null, {}, "falsch", [null], [1], [[]]]) {
      const state = JSON.parse(seedRaw);
      state[name] = value;
      eq(validate(state).length > 0, true, name + " ");
      throws(() => loadState(state), name + " ");
    }
  }
});
test("store: ungültige verschachtelte Kosten und Stammdaten werden abgelehnt", () => {
  const invalid = [
    (s) => { s.years[0].costs = null; },
    (s) => { s.years[0].costs = [null]; },
    (s) => { s.years[0].year = "2025"; },
    (s) => { s.tenants[0].id = null; },
    (s) => { s.garages[0].label = {}; },
    (s) => { s.landlord = "falsch"; },
    (s) => { s.landlord.bank = []; },
  ];
  for (const mutate of invalid) {
    const state = JSON.parse(seedRaw);
    mutate(state);
    eq(validate(state).length > 0, true, "Validierungsfehler ");
    throws(() => loadState(state));
  }
});
test("store: leere Pflichtlisten bleiben gültig, fehlendes Jahr bleibt 0 €", () => {
  const state = loadState({ schemaVersion: 1, garages: [], tenants: [], occupancy: [], readings: [], years: [] });
  eq(validate(state).length, 0, "leerer State ");
  const s = JSON.parse(seedRaw);
  s.years = [];
  eq(billTenant(loadState(s), "t-demo-a", "2025-01-01", "2025-12-31").total, 0, "Fallback unverändert ");
});
test("dom: neue Kosten ändern bestehende Rechnung ohne Berechnen-Klick", () => {
  const w = bootPage();
  try {
    calculateDemo(w);
    eq(invoiceTotal(w), "19,26\u00a0€");
    openTab(w, "kosten");
    fillAndSubmit(w, "f-cost", { date: "2025-05-01", label: "Zusatzkosten", amount: "140" });
    openTab(w, "abrechnung");
    eq(invoiceTotal(w), "39,26\u00a0€", "aktualisierte Rechnung ");
  } finally { w.close(); }
});
test("dom: neue Ablesung wirkt sofort auf bestehende Rechnung", () => {
  const s = JSON.parse(seedRaw);
  s.years.push({ year: 2026, kwhPrice: 0.5, baseFeeTotal: 0, costs: [], allocateShared: false });
  const w = bootPage((win) => win.localStorage.setItem("nkm-v1", exportJson(s)));
  try {
    calculateDemo(w, "2026-01-01", "2026-12-31");
    eq(invoiceTotal(w), "0,00\u00a0€");
    openTab(w, "zaehler");
    const select = w.document.getElementById("meter-sel");
    select.value = "m-g1";
    select.dispatchEvent(new w.Event("change"));
    fillAndSubmit(w, "f-reading", { date: "2026-12-31", value: "27.84" });
    openTab(w, "abrechnung");
    eq(invoiceTotal(w), "10,00\u00a0€");
  } finally { w.close(); }
});
test("dom: Belegungsänderung aktualisiert Rechnung und erhält Zeitraum", () => {
  const w = bootPage();
  try {
    calculateDemo(w);
    openTab(w, "mieter");
    const removal = w.document.querySelector('[data-del-occ^="g1|t-demo-a|"]');
    removal.click();
    openTab(w, "abrechnung");
    eq(invoiceTotal(w), "9,53\u00a0€");
    eq(w.document.querySelector('#f-bill [name="from"]').value, "2025-01-01");
    openTab(w, "mieter");
    fillAndSubmit(w, "f-occ", { tenantId: "t-demo-a", garageId: "g1", from: "2025-01-01" });
    openTab(w, "abrechnung");
    eq(invoiceTotal(w), "19,26\u00a0€", "neue Belegung wirkt sofort ");
  } finally { w.close(); }
});
test("dom: neu angelegtes Kostenjahr aktualisiert bestehende Rechnung", () => {
  const s = JSON.parse(seedRaw);
  s.readings.push({ meterId: "m-g1", date: "2026-12-31", value: 27.84 });
  const w = bootPage((win) => win.localStorage.setItem("nkm-v1", exportJson(s)));
  try {
    calculateDemo(w, "2026-01-01", "2026-12-31");
    eq(invoiceTotal(w), "0,00\u00a0€");
    openTab(w, "kosten");
    fillAndSubmit(w, "f-year", { year: "2026", kwhPrice: "0.5" });
    openTab(w, "abrechnung");
    eq(invoiceTotal(w), "10,00\u00a0€");
  } finally { w.close(); }
});
test("dom: central und leere Garagenfelder werden vor Speicherung abgelehnt", () => {
  const w = bootPage((win) => win.localStorage.setItem("nkm-v1", seedRaw));
  try {
    for (const fields of [{ label: "Neue Garage", meterId: "central" }, { label: "   ", meterId: "m-neu" }]) {
      fillAndSubmit(w, "f-garage", fields);
      eq(w.document.querySelectorAll("table tr").length, 16, "keine neue Garage ");
      eq(w.localStorage.getItem("nkm-v1"), seedRaw, "Snapshot unverändert ");
      eq(!!w.document.querySelector(".error"), true, "Fehler sichtbar ");
    }
  } finally { w.close(); }
});
test("dom: ungültiger Import erhält State, Snapshot und bestehende Rechnung", () => {
  const w = bootPage((win) => win.localStorage.setItem("nkm-v1", seedRaw));
  try {
    calculateDemo(w);
    for (const raw of ['{"schemaVersion":1}', '{unlesbar', JSON.stringify({ ...JSON.parse(seedRaw), garages: [null] })]) {
      importJson(w, raw);
      eq(w.localStorage.getItem("nkm-v1"), seedRaw, "Snapshot unverändert ");
      eq(!!w.document.querySelector(".error"), true);
      openTab(w, "abrechnung");
      eq(invoiceTotal(w), "19,26\u00a0€", "Rechnung unverändert ");
    }
  } finally { w.close(); }
});
test("dom: FileReader-Fehler verändert keine gespeicherten Daten", () => {
  const w = bootPage((win) => win.localStorage.setItem("nkm-v1", seedRaw));
  try {
    importJson(w, seedRaw, true);
    eq(w.localStorage.getItem("nkm-v1"), seedRaw);
    eq(!!w.document.querySelector(".error"), true, "Lesefehler sichtbar ");
  } finally { w.close(); }
});
test("dom: defekter Snapshot bleibt erhalten, ist exportierbar und verlangt bestätigten Ersatz", () => {
  for (const raw of ['{kaputt', '{"schemaVersion":1}', '']) {
    const w = bootPage((win) => win.localStorage.setItem("nkm-v1", raw));
    try {
      eq(w.document.getElementById("app-status").textContent, "Wiederherstellung nötig");
      eq(!!w.document.querySelector(".error"), true);
      eq(w.document.querySelectorAll("[data-del-garage]").length, 0, "keine Demo als Arbeitsdaten ");
      const download = captureDownload(w);
      w.document.getElementById("btn-export-raw").click();
      eq(download().text, raw, "Rohdaten gesichert ");
      eq(download().filename, "nebenkosten-wiederherstellung.json");
      w.confirm = () => false;
      importJson(w, seedRaw);
      eq(w.localStorage.getItem("nkm-v1"), raw, "abgebrochener Ersatz ");
      w.confirm = () => true;
      importJson(w, seedRaw);
      eq(w.document.getElementById("app-status").textContent, "bereit");
      eq(loadState(w.localStorage.getItem("nkm-v1")).garages.length, 15);
    } finally { w.close(); }
  }
});
test("dom: Demo-Ersatz im Wiederherstellungsmodus ist ausdrücklich bestätigt", () => {
  const w = bootPage((win) => win.localStorage.setItem("nkm-v1", "{kaputt"));
  try {
    w.confirm = () => false;
    w.document.getElementById("btn-seed").click();
    eq(w.localStorage.getItem("nkm-v1"), "{kaputt");
    w.confirm = () => true;
    w.document.getElementById("btn-seed").click();
    eq(w.document.getElementById("app-status").textContent, "bereit");
    eq(loadState(w.localStorage.getItem("nkm-v1")).garages.length, 15);
  } finally { w.close(); }
});
test("dom: Schreibfehler werden überall sichtbar, Export und Live-Rechnung bleiben nutzbar", () => {
  const w = bootPage((win) => win.localStorage.setItem("nkm-v1", seedRaw));
  try {
    calculateDemo(w);
    const originalSetItem = w.Storage.prototype.setItem;
    w.Storage.prototype.setItem = () => { throw new w.DOMException("voll", "QuotaExceededError"); };
    openTab(w, "kosten");
    fillAndSubmit(w, "f-cost", { date: "2025-05-01", label: "Zusatzkosten", amount: "140" });
    eq(w.localStorage.getItem("nkm-v1"), seedRaw, "alter Snapshot erhalten ");
    eq(w.document.getElementById("app").textContent.includes("Nicht gespeichert"), true);
    openTab(w, "abrechnung");
    eq(invoiceTotal(w), "39,26\u00a0€");
    eq(w.document.getElementById("app").textContent.includes("Nicht gespeichert"), true);
    openTab(w, "daten");
    const download = captureDownload(w);
    w.document.getElementById("btn-export").click();
    eq(JSON.parse(download().text).years[0].costs.length, 2, "Arbeitsdaten exportiert ");
    w.Storage.prototype.setItem = originalSetItem;
    openTab(w, "vermieter");
    fillAndSubmit(w, "f-landlord", { name: "Demo Vermieter" });
    eq(w.document.getElementById("app").textContent.includes("Nicht gespeichert"), false, "Speicherung wieder möglich ");
    eq(loadState(w.localStorage.getItem("nkm-v1")).years[0].costs.length, 2);
  } finally { w.close(); }
});
test("dom: gesperrter Speicher beim Start zeigt Fehler statt stiller Demo", () => {
  const w = bootPage((win) => {
    Object.defineProperty(win, "localStorage", { get() { throw new win.DOMException("gesperrt", "SecurityError"); } });
  });
  try {
    eq(w.document.getElementById("app-status").textContent, "Wiederherstellung nötig");
    eq(!!w.document.querySelector(".error"), true);
    eq(w.document.querySelectorAll("[data-del-garage]").length, 0);
  } finally { w.close(); }
});
test("dom: gültiger Import synchronisiert Jahresauswahl und übersteht Reload", () => {
  const w = bootPage();
  let saved;
  try {
    const s = JSON.parse(seedRaw);
    s.years[0].year = 2026;
    s.years[0].costs = [];
    importJson(w, exportJson(s));
    openTab(w, "kosten");
    eq(w.document.getElementById("year-sel").value, "2026");
    fillAndSubmit(w, "f-cost", { date: "2026-05-01", label: "Kosten 2026", amount: "14" });
    eq(w.document.querySelector(".error"), null);
    saved = w.localStorage.getItem("nkm-v1");
    eq(loadState(saved).years[0].costs.length, 1);
  } finally { w.close(); }
  const reload = bootPage((win) => win.localStorage.setItem("nkm-v1", saved));
  try {
    eq(reload.document.getElementById("app-status").textContent, "bereit");
    openTab(reload, "kosten");
    eq(reload.document.getElementById("year-sel").value, "2026");
    eq(reload.document.getElementById("app").textContent.includes("Kosten 2026"), true);
  } finally { reload.close(); }
});

// Asynchroner Integrationsnachweis mit jsdoms echtem FileReader und File/Blob.
async function importRealFile(w, text) {
  const input = w.document.getElementById("file-import");
  Object.defineProperty(input, "files", { configurable: true, value: [new w.File([text], "synthetic.json", { type: "application/json" })] });
  await new Promise((resolve, reject) => {
    const observer = new w.MutationObserver(() => {
      observer.disconnect(); w.clearTimeout(timeout); resolve();
    });
    const timeout = w.setTimeout(() => { observer.disconnect(); reject(new Error("Import-Timeout")); }, 2000);
    observer.observe(w.document.getElementById("app"), { childList: true });
    input.dispatchEvent(new w.Event("change", { bubbles: true }));
  });
}
try {
  const w = bootPage((win) => win.localStorage.setItem("nkm-v1", seedRaw));
  try {
    if (w.document.readyState !== "complete") await new Promise((resolve) => w.addEventListener("load", resolve, { once: true }));
    calculateDemo(w);
    openTab(w, "daten");
    const next = JSON.parse(seedRaw);
    next.years[0].costs.push({ date: "2025-05-01", label: "Importierte Zusatzkosten", amount: 140, key: "nach-faktor" });
    await importRealFile(w, exportJson(next));
    const saved = w.localStorage.getItem("nkm-v1");
    eq(loadState(saved).years[0].costs.length, 2);
    openTab(w, "abrechnung");
    eq(invoiceTotal(w), "39,26\u00a0€");
    openTab(w, "daten");
    await importRealFile(w, '{"schemaVersion":1}');
    eq(w.localStorage.getItem("nkm-v1"), saved, "echter ungültiger Import erhält Snapshot ");
    eq(!!w.document.querySelector(".error"), true);
  } finally { w.close(); }
  passed++;
} catch (e) { failed++; console.error("FAIL: dom: echter FileReader importiert sicher und aktualisiert Rechnung -", e.message); }

console.log(`${passed + failed} tests, ${failed} failed`);
process.exit(failed ? 1 : 0);
