// State-Verwaltung (DOM-frei; localStorage/download nur im Browser).
const SCHEMA_VERSION = 1;
const LS_KEY = "nkm-v1";

function isISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Akzeptiert Objekt oder JSON-String. Wirft bei falscher schemaVersion.
function loadState(input) {
  const state = typeof input === "string" ? JSON.parse(input) : input;
  if (!state || state.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`schemaVersion ${state && state.schemaVersion} wird nicht unterstützt (erwartet ${SCHEMA_VERSION})`);
  }
  const errs = validate(state);
  if (errs.length) throw new Error("ungültige Daten: " + errs.join("; "));
  return state;
}

// Gibt Array von Fehlerstrings zurück ([] = ok).
function validate(state) {
  const errs = [];
  if (!state || typeof state !== "object") return ["kein State-Objekt"];
  const garageIds = new Set((state.garages || []).map((g) => g.id));
  const tenantIds = new Set((state.tenants || []).map((t) => t.id));
  for (const g of state.garages || []) {
    if (!g.id || !g.label || !g.meterId) errs.push(`Garage unvollständig: ${JSON.stringify(g)}`);
  }
  for (const [name, ids] of [["Garage", (state.garages || []).map((g) => g.id)],
      ["Zähler", (state.garages || []).map((g) => g.meterId).concat(["central"])],
      ["Mieter", (state.tenants || []).map((t) => t.id)]]) {
    if (new Set(ids).size !== ids.length) errs.push(`doppelte ${name}-ID`);
  }
  // Belegungen: bekannte IDs, Datumsformat, keine Überlappung je Garage.
  const byGarage = {};
  for (const o of state.occupancy || []) {
    if (!garageIds.has(o.garageId)) errs.push(`unbekannte Garage: ${o.garageId}`);
    if (!tenantIds.has(o.tenantId)) errs.push(`unbekannter Mieter: ${o.tenantId}`);
    if (!isISODate(o.from) || (o.to !== null && !isISODate(o.to))) {
      errs.push(`Datumsformat ungültig: ${o.garageId}/${o.tenantId}`);
      continue;
    }
    if (o.to !== null && o.to < o.from) errs.push(`Zeitraum negativ: ${o.garageId}/${o.tenantId}`);
    (byGarage[o.garageId] = byGarage[o.garageId] || []).push(o);
  }
  for (const gid of Object.keys(byGarage)) {
    const list = byGarage[gid].slice().sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    for (let i = 1; i < list.length; i++) {
      const prevEnd = list[i - 1].to || "9999-12-31";
      if (list[i].from <= prevEnd) errs.push(`Überlappung bei ${gid}: ${list[i - 1].from}–${list[i - 1].to} vs ${list[i].from}`);
    }
  }
  const knownMeters = new Set((state.garages || []).map((g) => g.meterId).concat(["central"]));
  const byMeter = {};
  for (const r of state.readings || []) {
    if (!knownMeters.has(r.meterId)) errs.push(`unbekannter Zähler: ${r.meterId}`);
    if (!isISODate(r.date) || !Number.isFinite(r.value) || r.value < 0) {
      errs.push(`Ablesung ungültig: ${JSON.stringify(r)}`);
    }
    (byMeter[r.meterId] = byMeter[r.meterId] || []).push(r);
  }
  for (const mid of Object.keys(byMeter)) {
    const list = byMeter[mid].slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (let i = 1; i < list.length; i++) {
      if (list[i].value < list[i - 1].value) errs.push(`fallender Zählerstand ${mid}: ${list[i - 1].date}→${list[i].date}`);
      if (list[i].date === list[i - 1].date) errs.push(`doppelte Ablesung ${mid}: ${list[i].date}`);
    }
  }
  for (const y of state.years || []) {
    if (!Number.isFinite(y.kwhPrice) || y.kwhPrice < 0) errs.push(`kwhPrice ungültig (${y.year})`);
    if (y.baseFeeTotal != null && (!Number.isFinite(y.baseFeeTotal) || y.baseFeeTotal < 0)) errs.push(`Grundgebühr ungültig (${y.year})`);
    for (const c of y.costs || []) {
      if (!Number.isFinite(c.amount) || c.amount < 0 || !isISODate(c.date)) errs.push(`Kostenposten ungültig: ${c.label}`);
    }
  }
  return errs;
}

// Reiner JSON-Export (String). Datei-Download passiert in app.js.
function exportJson(state) {
  return JSON.stringify(state, null, 2);
}

// Browser-Persistenz (no-op ohne window, damit Node-Tests laufen).
function saveSnapshot(state) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  window.localStorage.setItem(LS_KEY, exportJson(state));
  return true;
}
function loadSnapshot() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(LS_KEY);
  return raw ? loadState(raw) : null;
}

if (typeof window !== "undefined") {
  window.NKM = window.NKM || {};
  window.NKM.store = { loadState, validate, exportJson, saveSnapshot, loadSnapshot, SCHEMA_VERSION };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { loadState, validate, exportJson, saveSnapshot, loadSnapshot, SCHEMA_VERSION };
}
