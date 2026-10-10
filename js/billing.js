// Abrechnungslogik (DOM-frei). Browser: window.NKM. Node: ESM-Import.
export function daysInclusive(fromISO, toISO) {
  throw new Error("not implemented");
}
export function meterUsage(readings, meterId, fromISO, toISO) {
  throw new Error("not implemented");
}
export function billTenant(state, tenantId, fromISO, toISO) {
  throw new Error("not implemented");
}
if (typeof window !== "undefined") {
  window.NKM = window.NKM || {};
  window.NKM.billing = { daysInclusive, meterUsage, billTenant };
}
