const DB_NAME = "local-pdf-studio-diagnostics";
const DB_VERSION = 1;
const STORE = "diagnostics";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
  });
}

export async function indexedDbRoundTrip(value: string): Promise<string> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({ id: "round-trip", value, updatedAt: Date.now() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed."));
    });

    const result = await new Promise<{ id: string; value: string } | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get("round-trip");
      request.onsuccess = () => resolve(request.result as { id: string; value: string } | undefined);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed."));
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete("round-trip");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB cleanup failed."));
    });

    if (!result) throw new Error("IndexedDB record was not found after writing.");
    return result.value;
  } finally {
    database.close();
  }
}
