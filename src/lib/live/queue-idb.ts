import { MemoryStore, type QueueEntry, type QueueStore } from "./queue";

const DB = "bigair-live-queue";
const STORE = "items";

/**
 * The phone's own copy of what has not been sent yet, so a reload or a closed tab loses nothing (IndexedDB). Where IndexedDB is not available
 * (some private windows) it falls back to memory and says so once through `onFallback`, so the screen can warn in one line.
 */
export function createIdbStore(name: string, onFallback?: () => void): QueueStore {
  const memory = new MemoryStore();
  let db: Promise<IDBDatabase | null> | null = null;
  const open = () => {
    db ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          onFallback?.();
          resolve(null);
        };
      } catch {
        onFallback?.();
        resolve(null);
      }
    });
    return db;
  };
  return {
    async load(): Promise<QueueEntry[]> {
      const d = await open();
      if (!d) return memory.load();
      return new Promise((resolve) => {
        try {
          const req = d.transaction(STORE, "readonly").objectStore(STORE).get(name);
          req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as QueueEntry[]) : []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    },
    async save(items: QueueEntry[]): Promise<void> {
      const d = await open();
      if (!d) return memory.save(items);
      await new Promise<void>((resolve) => {
        try {
          const tx = d.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(JSON.parse(JSON.stringify(items)), name);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    },
  };
}
