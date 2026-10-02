// lib/idbStorage.ts
// Native browser IndexedDB key-value storage for Lyra.
// Bypasses the strict 5MB localStorage quota limit for long conversation histories,
// image attachments, code documents, and reasoning traces.

const DB_NAME = "lyra_client_db";
const STORE_NAME = "keyval";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.warn("[idbStorage] Failed to open IndexedDB:", request.error);
        resolve(null);
      };

      request.onblocked = () => {
        console.warn("[idbStorage] IndexedDB open blocked by other tab.");
        resolve(null);
      };
    } catch (e) {
      console.warn("[idbStorage] IndexedDB initialization error:", e);
      resolve(null);
    }
  });

  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        resolve((req.result as T) ?? null);
      };

      req.onerror = () => {
        console.warn(`[idbStorage] Failed to get key '${key}':`, req.error);
        resolve(null);
      };
    } catch (err) {
      console.warn(`[idbStorage] Transaction error on get '${key}':`, err);
      resolve(null);
    }
  });
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);

      req.onsuccess = () => {
        resolve(true);
      };

      req.onerror = () => {
        console.warn(`[idbStorage] Failed to set key '${key}':`, req.error);
        resolve(false);
      };
    } catch (err) {
      console.warn(`[idbStorage] Transaction error on set '${key}':`, err);
      resolve(false);
    }
  });
}

export async function idbDelete(key: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);

      req.onsuccess = () => {
        resolve(true);
      };

      req.onerror = () => {
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}
