import type { ProjectManifest, ViewerPreferences } from "../types/project";

const DB_NAME = "local-pdf-studio";
const DB_VERSION = 13;

export type StoreName = "projects" | "viewerStates" | "sourceFiles" | "diagnostics" | "editorStates" | "editorAssets" | "securityStates" | "ocrJobs" | "ocrPages" | "ocrLanguages" | "batchRecipes" | "activityReceipts" | "workspaceSessions" | "workspaceEvents" | "workspaceCheckpoints" | "nativeStates" | "complianceStates" | "documentRevisions" | "documentTransactions";

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("projects")) {
        const store = database.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("checksum", "checksum");
      }
      if (!database.objectStoreNames.contains("viewerStates")) {
        database.createObjectStore("viewerStates", { keyPath: "projectId" });
      }
      if (!database.objectStoreNames.contains("sourceFiles")) {
        database.createObjectStore("sourceFiles", { keyPath: "projectId" });
      }
      if (!database.objectStoreNames.contains("diagnostics")) {
        database.createObjectStore("diagnostics", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("editorStates")) {
        database.createObjectStore("editorStates", { keyPath: "projectId" });
      }
      if (!database.objectStoreNames.contains("editorAssets")) {
        const store = database.createObjectStore("editorAssets", { keyPath: "id" });
        store.createIndex("projectId", "projectId");
      }
      if (!database.objectStoreNames.contains("securityStates")) {
        database.createObjectStore("securityStates", { keyPath: "projectId" });
      }
      if (!database.objectStoreNames.contains("ocrJobs")) {
        const store = database.createObjectStore("ocrJobs", { keyPath: "id" });
        store.createIndex("projectId", "projectId");
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!database.objectStoreNames.contains("ocrPages")) {
        const store = database.createObjectStore("ocrPages", { keyPath: "id" });
        store.createIndex("jobId", "jobId");
        store.createIndex("projectId", "projectId");
      }
      if (!database.objectStoreNames.contains("ocrLanguages")) {
        database.createObjectStore("ocrLanguages", { keyPath: "code" });
      }
      if (!database.objectStoreNames.contains("batchRecipes")) {
        database.createObjectStore("batchRecipes", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("activityReceipts")) {
        const store = database.createObjectStore("activityReceipts", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains("workspaceSessions")) {
        database.createObjectStore("workspaceSessions", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("workspaceEvents")) {
        const store = database.createObjectStore("workspaceEvents", { keyPath: "id" });
        store.createIndex("projectId", "projectId");
        store.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains("workspaceCheckpoints")) {
        const store = database.createObjectStore("workspaceCheckpoints", { keyPath: "id" });
        store.createIndex("projectId", "projectId");
        store.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains("nativeStates")) {
        database.createObjectStore("nativeStates", { keyPath: "projectId" });
      }
      if (!database.objectStoreNames.contains("complianceStates")) {
        database.createObjectStore("complianceStates", { keyPath: "projectId" });
      }
      if (!database.objectStoreNames.contains("documentRevisions")) {
        const store = database.createObjectStore("documentRevisions", { keyPath: "id" });
        store.createIndex("projectId", "projectId");
        store.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains("documentTransactions")) {
        const store = database.createObjectStore("documentTransactions", { keyPath: "id" });
        store.createIndex("projectId", "projectId");
        store.createIndex("startedAt", "startedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
  });
}

export async function idbGet<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error ?? new Error(`IndexedDB read failed for ${storeName}.`));
    });
  } finally {
    database.close();
  }
}

export async function idbPut<T>(storeName: StoreName, value: T): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error(`IndexedDB write failed for ${storeName}.`));
      transaction.onabort = () => reject(transaction.error ?? new Error(`IndexedDB write was aborted for ${storeName}.`));
    });
  } finally {
    database.close();
  }
}

export async function idbDelete(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error(`IndexedDB delete failed for ${storeName}.`));
      transaction.onabort = () => reject(transaction.error ?? new Error(`IndexedDB delete was aborted for ${storeName}.`));
    });
  } finally {
    database.close();
  }
}

export async function idbGetAll<T>(storeName: StoreName): Promise<T[]> {
  const database = await openDatabase();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error ?? new Error(`IndexedDB list failed for ${storeName}.`));
    });
  } finally {
    database.close();
  }
}

export type ProjectRecord = ProjectManifest;
export type ViewerStateRecord = ViewerPreferences;

export async function idbGetAllByIndex<T>(storeName: StoreName, indexName: string, key: IDBValidKey): Promise<T[]> {
  const database = await openDatabase();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).index(indexName).getAll(key);
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error ?? new Error(`IndexedDB indexed read failed for ${storeName}.`));
    });
  } finally {
    database.close();
  }
}

export async function idbDeleteAllByIndex(storeName: StoreName, indexName: string, key: IDBValidKey): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.index(indexName).openKeyCursor(IDBKeyRange.only(key));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error(`IndexedDB indexed delete failed for ${storeName}.`));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error(`IndexedDB indexed delete failed for ${storeName}.`));
      transaction.onabort = () => reject(transaction.error ?? new Error(`IndexedDB indexed delete was aborted for ${storeName}.`));
    });
  } finally {
    database.close();
  }
}
