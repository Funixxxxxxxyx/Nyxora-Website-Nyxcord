/** Remove data persisted by older Nyxcord versions. Never save editor media. */
let cleared = false;
export function clearLegacyDraft(): void {
  if (cleared) return;
  cleared = true;
  try { sessionStorage.removeItem('nyxcord-editor-settings'); } catch { /* Blocked storage. */ }
  try { localStorage.removeItem('nyxcord-editor-settings'); } catch { /* Blocked storage. */ }
  try {
    if ('indexedDB' in window) indexedDB.deleteDatabase('nyxcord-draft');
  } catch { /* Blocked storage. */ }
}
