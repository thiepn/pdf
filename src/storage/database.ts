import { measureRuntimeAsync } from "../performance/runtimeMetrics";
import type { ProjectManifest, ViewerPreferences } from "../types/project";
import { WORKSPACE_SCHEMA_VERSION, type WorkspaceSession } from "../types/workspace";
import { assertReadableStateSchema } from "../projects/stateSchemaGuard";

const DB_NAME = "local-pdf-studio";
const DB_VERSION = 13;

export type StoreName = "projects" | "viewerStates" | "sourceFiles" | "diagnostics" | "editorStates" | "editorAssets" | "securityStates" | "ocrJobs" | "ocrPages" | "ocrLanguages" | "batchRecipes" | "activityReceipts" | "workspaceSessions" | "workspaceEvents" | "workspaceCheckpoints" | "nativeStates" | "complianceStates" | "documentRevisions" | "documentTransactions";

export function openDatabase(): Promise<IDBDatabase> {
  return measureRuntimeAsync("storage", "indexeddb.open", () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("projects")) {
        const store = database.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("checksum", "checksum");
      }
      if (!database.objectStoreNames.contains("viewerStates")) database.createObjectStore("viewerStates", { keyPath: "projectId" });
      if (!database.objectStoreNames.contains("sourceFiles")) database.createObjectStore("sourceFiles", { keyPath: "projectId" });
      if (!database.objectStoreNames.contains("diagnostics")) database.createObjectStore("diagnostics", { keyPath: "id" });
      if (!database.objectStoreNames.contains("editorStates")) database.createObjectStore("editorStates", { keyPath: "projectId" });
      if (!database.objectStoreNames.contains("editorAssets")) {
        const store = database.createObjectStore("editorAssets", { keyPath: "id" });
        store.createIndex("projectId", "projectId");
      }
      if (!database.objectStoreNames.contains("securityStates")) database.createObjectStore("securityStates", { keyPath: "projectId" });
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
      if (!database.objectStoreNames.contains("ocrLanguages")) database.createObjectStore("ocrLanguages", { keyPath: "code" });
      if (!database.objectStoreNames.contains("batchRecipes")) database.createObjectStore("batchRecipes", { keyPath: "id" });
      if (!database.objectStoreNames.contains("activityReceipts")) {
        const store = database.createObjectStore("activityReceipts", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains("workspaceSessions")) database.createObjectStore("workspaceSessions", { keyPath: "id" });
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
      if (!database.objectStoreNames.contains("nativeStates")) database.createObjectStore("nativeStates", { keyPath: "projectId" });
      if (!database.objectStoreNames.contains("complianceStates")) database.createObjectStore("complianceStates", { keyPath: "projectId" });
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
  }));
}

export async function idbGet<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return measureRuntimeAsync("storage", "indexeddb.get", async () => {
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
  }, { store: storeName });
}

export async function idbPut<T>(storeName: StoreName, value: T): Promise<void> {
  return measureRuntimeAsync("storage", "indexeddb.put", async () => {
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
  }, { store: storeName });
}

export async function idbDelete(storeName: StoreName, key: IDBValidKey): Promise<void> {
  return measureRuntimeAsync("storage", "indexeddb.delete", async () => {
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
  }, { store: storeName });
}

/**
 * Commit project-manifest and IndexedDB source deletion in one transaction.
 * A failed or interrupted transaction retains both records; callers must
 * finish any OPFS recovery staging before invoking this irreversible commit.
 */
/**
 * Atomically removes the project manifest, staged source and project-owned
 * IndexedDB sidecars. A failed transaction retains *all* records, including
 * the verified OPFS fallback source staged before this call.
 * WorkspaceSession tab references are removed in this same transaction.
 */
export async function idbDeleteProjectAndSource(projectId: string): Promise<void> {
  return measureRuntimeAsync("storage", "indexeddb.deleteProjectAndSource", async () => {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const direct: StoreName[] = [
          "projects", "sourceFiles", "viewerStates", "editorStates",
          "securityStates", "nativeStates", "complianceStates"
        ];
        const indexed: Array<[StoreName, string]> = [
          ["editorAssets", "projectId"],
          ["ocrJobs", "projectId"],
          ["ocrPages", "projectId"],
          ["documentRevisions", "projectId"],
          ["documentTransactions", "projectId"],
          ["workspaceEvents", "projectId"],
          ["workspaceCheckpoints", "projectId"]
        ];
        const stores = [...direct, ...indexed.map(([name]) => name), "workspaceSessions"] as StoreName[];
        const transaction = database.transaction(stores, "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Project deletion transaction failed."));
        transaction.onabort = () => reject(transaction.error ?? new Error("Project deletion transaction was aborted."));

        const failClosed = (reason: unknown) => {
          try { transaction.abort(); } catch { /* Already aborted by IndexedDB. */ }
          reject(reason);
        };
        try {
          for (const name of direct) transaction.objectStore(name).delete(projectId);
          for (const [name, indexName] of indexed) {
            const store = transaction.objectStore(name);
            const request = store.index(indexName).openKeyCursor(IDBKeyRange.only(projectId));
            request.onsuccess = () => {
              try {
                const cursor = request.result;
                if (!cursor) return;
                store.delete(cursor.primaryKey);
                cursor.continue();
              } catch (reason) { failClosed(reason); }
            };
            request.onerror = () => failClosed(request.error ?? new Error("Project sidecar deletion failed."));
          }
          // Commit workspace tab cleanup with the same project/source deletion.
          // If the browser interrupts the session write, the entire transaction
          // aborts; no deleted project can remain in the saved tab list.
          const sessionStore = transaction.objectStore("workspaceSessions");
          const sessionRequest = sessionStore.get("primary");
          sessionRequest.onsuccess = () => {
            try {
              const session = sessionRequest.result as WorkspaceSession | undefined;
              if (!session) return;
              assertReadableStateSchema(session.schemaVersion, WORKSPACE_SCHEMA_VERSION, "Workspace session");
              if (!Array.isArray(session.tabs) || !Array.isArray(session.recentlyClosed)) {
                throw new Error("The workspace tab state is invalid. Project deletion was not committed.");
              }
              const tabs = session.tabs.filter((tab) => tab.projectId !== projectId);
              const recentlyClosed = session.recentlyClosed.filter((tab) => tab.projectId !== projectId);
              if (tabs.length !== session.tabs.length || recentlyClosed.length !== session.recentlyClosed.length || session.activeProjectId === projectId) {
                sessionStore.put({
                  ...session,
                  tabs,
                  recentlyClosed,
                  activeProjectId: session.activeProjectId === projectId ? undefined : session.activeProjectId,
                  updatedAt: Date.now()
                } satisfies WorkspaceSession);
              }
            } catch (reason) { failClosed(reason); }
          };
          sessionRequest.onerror = () => failClosed(sessionRequest.error ?? new Error("Workspace session deletion update failed."));
        } catch (reason) { failClosed(reason); }
      });
    } finally {
      database.close();
    }
  }, { projectId });
}

export async function idbGetAll<T>(storeName: StoreName): Promise<T[]> {
  return measureRuntimeAsync("storage", "indexeddb.getAll", async () => {
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
  }, { store: storeName });
}

export type ProjectRecord = ProjectManifest;
export type ViewerStateRecord = ViewerPreferences;

export async function idbGetAllByIndex<T>(storeName: StoreName, indexName: string, key: IDBValidKey): Promise<T[]> {
  return measureRuntimeAsync("storage", "indexeddb.getAllByIndex", async () => {
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
  }, { store: storeName, index: indexName });
}

export async function idbDeleteAllByIndex(storeName: StoreName, indexName: string, key: IDBValidKey): Promise<void> {
  return measureRuntimeAsync("storage", "indexeddb.deleteAllByIndex", async () => {
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
  }, { store: storeName, index: indexName });
}
