// Browser-side permanent storage (IndexedDB) for indexed documents.
export type StoredChunk = { source: string; text: string; vec: number[] };
export type StoredDoc = { name: string; chunks: number; addedAt: number };

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("folio", 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("docs", { keyPath: "name" });
      db.createObjectStore("chunks", { keyPath: "source" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const t = db.transaction(stores, mode);
        const req = fn(t);
        t.oncomplete = () => res(req ? (req.result as T) : (undefined as T));
        t.onerror = () => rej(t.error);
      }),
  );
}

export async function loadAll(): Promise<{ docs: StoredDoc[]; chunks: StoredChunk[] }> {
  const docs = await tx<StoredDoc[]>(["docs"], "readonly", (t) => t.objectStore("docs").getAll());
  const groups = await tx<{ source: string; items: StoredChunk[] }[]>(["chunks"], "readonly", (t) => t.objectStore("chunks").getAll());
  return { docs: docs.sort((a, b) => a.addedAt - b.addedAt), chunks: groups.flatMap((g) => g.items) };
}

export function saveDoc(doc: StoredDoc, items: StoredChunk[]) {
  return tx(["docs", "chunks"], "readwrite", (t) => {
    t.objectStore("docs").put(doc);
    t.objectStore("chunks").put({ source: doc.name, items });
  });
}

export function deleteDoc(name: string) {
  return tx(["docs", "chunks"], "readwrite", (t) => {
    t.objectStore("docs").delete(name);
    t.objectStore("chunks").delete(name);
  });
}
