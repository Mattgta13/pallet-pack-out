/**
 * Moving saved data between computers: everything the app keeps in this
 * browser (libraries, current job, logo, settings) as one JSON file.
 */
const PREFIX = 'ppo.';
const FORMAT = 'pallet-pack-out-backup';

export function exportData() {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) data[k] = localStorage.getItem(k) ?? '';
  }
  const file = { format: FORMAT, version: 1, saved: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pallet-pack-out-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Replace this browser's data with a backup file, then reload. Returns an error message on failure. */
export async function importData(f: File): Promise<string | null> {
  let file: { format?: string; data?: Record<string, unknown> };
  try {
    file = JSON.parse(await f.text());
  } catch {
    return 'That file is not a Pallet Pack-Out backup.';
  }
  if (file.format !== FORMAT || !file.data || typeof file.data !== 'object') return 'That file is not a Pallet Pack-Out backup.';
  const entries = Object.entries(file.data).filter(([k, v]) => k.startsWith(PREFIX) && typeof v === 'string') as [string, string][];
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    for (const [k, v] of entries) localStorage.setItem(k, v);
  } catch {
    return 'The backup could not be saved in this browser (storage full or blocked).';
  }
  location.reload();
  return null;
}
