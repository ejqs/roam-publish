/** Thin UI notify seam — swap alerts for a toast later without touching domain code. */

export function notify(message) {
  window.alert(message);
}
