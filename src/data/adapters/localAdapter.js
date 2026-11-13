// Local persistence adapter (browser localStorage). Implements the same
// load/save contract a Firebase/Firestore adapter would.
const KEY = 'relayline:v1';
export const localAdapter = {
  name: 'local',
  load() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { console.warn('Relayline: could not persist state', e); return false; }
  },
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};
