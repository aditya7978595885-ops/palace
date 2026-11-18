import { DEFAULT_CUSTOMIZATION } from '../data/defaultContent';
import { PalaceCustomization } from '../types/palace';

const DB_NAME = 'TheRoyalRegencyDB';
const DB_VERSION = 1;
const STORE_NAME = 'palaceState';
const STATE_KEY = 'customization_v1';
const LS_FALLBACK_KEY = 'the_royal_regency_state_v1';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

export function mergeWithDefaults(
  raw: Partial<PalaceCustomization> | null | undefined
): PalaceCustomization {
  if (!raw || typeof raw !== 'object') {
    return structuredClone(DEFAULT_CUSTOMIZATION);
  }

  return {
    ...DEFAULT_CUSTOMIZATION,
    ...raw,
    plaque: {
      ...DEFAULT_CUSTOMIZATION.plaque,
      ...(raw.plaque ?? {}),
    },
    decoratives: {
      ...DEFAULT_CUSTOMIZATION.decoratives,
      ...(raw.decoratives ?? {}),
    },
    assets: {
      ...DEFAULT_CUSTOMIZATION.assets,
      ...(raw.assets ?? {}),
    },
    photos:
      Array.isArray(raw.photos) && raw.photos.length > 0
        ? raw.photos
        : structuredClone(DEFAULT_CUSTOMIZATION.photos),
    memories:
      Array.isArray(raw.memories)
        ? raw.memories
        : structuredClone(DEFAULT_CUSTOMIZATION.memories),
  };
}

export async function saveCustomization(data: PalaceCustomization): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(data, STATE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('Failed to save to IndexedDB'));
    });
    db.close();
  } catch {
    try {
      window.localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Unable to persist customization locally:', err);
    }
  }
}

export async function loadCustomization(): Promise<PalaceCustomization> {
  try {
    const db = await openDatabase();
    const result = await new Promise<Partial<PalaceCustomization> | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(STATE_KEY);
        req.onsuccess = () => resolve(req.result as Partial<PalaceCustomization> | undefined);
        req.onerror = () => reject(req.error ?? new Error('Failed to read IndexedDB'));
      }
    );
    db.close();
    if (result) {
      return mergeWithDefaults(result);
    }
  } catch {
    // Fall back to localStorage below
  }

  try {
    const raw = window.localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PalaceCustomization>;
      return mergeWithDefaults(parsed);
    }
  } catch {
    // Ignore malformed fallback
  }

  return structuredClone(DEFAULT_CUSTOMIZATION);
}

export async function clearCustomization(): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(STATE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    // Ignore
  }

  try {
    window.localStorage.removeItem(LS_FALLBACK_KEY);
  } catch {
    // Ignore
  }
}
