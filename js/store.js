// State-Verwaltung (DOM-frei, localStorage nur im Browser angefasst).
export function loadState(json) {
  throw new Error("not implemented");
}
export function validate(state) {
  throw new Error("not implemented");
}
export function exportJson(state) {
  throw new Error("not implemented");
}
if (typeof window !== "undefined") {
  window.NKM = window.NKM || {};
  window.NKM.store = { loadState, validate, exportJson };
}
