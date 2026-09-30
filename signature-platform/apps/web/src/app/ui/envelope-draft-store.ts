const DATABASE = "signeo";
const STORE = "drafts";
const KEY = "new-envelope";

export type StoredEnvelopeDraft = {
  updatedAt: string;
  title: string;
  message: string;
  documents: { file: File; hiddenRecipientIds?: string[] }[];
  selected: number;
  fields: unknown[];
  recipients: unknown[];
  collectionRequests: unknown[];
  expiresAt: string;
  allowDecline: boolean;
  signingMode: string;
  step: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadEnvelopeDraft(): Promise<StoredEnvelopeDraft | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    request.onsuccess = () => { database.close(); resolve(request.result ?? null); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

export async function saveEnvelopeDraft(draft: StoredEnvelopeDraft): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, "readwrite").objectStore(STORE).put(draft, KEY);
    request.onsuccess = () => { database.close(); resolve(); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

export async function clearEnvelopeDraft(): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, "readwrite").objectStore(STORE).delete(KEY);
    request.onsuccess = () => { database.close(); resolve(); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}
