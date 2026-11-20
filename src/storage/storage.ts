/**
 * localStorage + IndexedDB 儲存層（含 schema version 與遷移）。
 * 人物/設定 → localStorage；照片 Blob、紀錄 → IndexedDB。
 */
import type { KuaNumber } from "../domain/bazhai/mingGua";

export const SCHEMA_VERSION = 1;
export const LS_KEY = "bazigfun.v1";
export const IDB_NAME = "bazigfun";
export const IDB_VERSION = 1;

export interface Person {
  id: string;
  name: string;
  birthDate: string; // YYYY-MM-DD
  birthTime: string | null; // HH:mm
  sex: "male" | "female";
  /** 命卦由版本化引擎計算後快取（顯示用） */
  kua: KuaNumber;
  createdAt: string;
}

export interface PhotoRecordMeta {
  id: string;
  personId: string;
  title: string;
  note: string;
  capturedAt: string; // ISO 8601
  azimuthRaw: number | null;
  azimuthDisplay: number;
  source: "sensor" | "manual";
  northReference: "magnetic" | "true";
  palace: string;
  star: string;
  quality: "valid" | "uncertain" | "unavailable";
  nearBoundary: boolean;
  photoId: string;
  schemaVersion: number;
}

export interface AppSettings {
  northReference: "magnetic" | "true";
  manualOffsetDeg: number;
  currentPersonId: string | null;
}

export interface LSData {
  schemaVersion: number;
  persons: Person[];
  settings: AppSettings;
}

export function defaultSettings(): AppSettings {
  return { northReference: "magnetic", manualOffsetDeg: 0, currentPersonId: null };
}

export function loadLS(): LSData {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { schemaVersion: SCHEMA_VERSION, persons: [], settings: defaultSettings() };
    const data = JSON.parse(raw) as LSData;
    return migrateLS(data);
  } catch {
    return { schemaVersion: SCHEMA_VERSION, persons: [], settings: defaultSettings() };
  }
}

function migrateLS(data: LSData): LSData {
  // v1 為初始版本；未來在此依 data.schemaVersion 逐步遷移
  if (!data.settings) data.settings = defaultSettings();
  if (!data.persons) data.persons = [];
  data.schemaVersion = SCHEMA_VERSION;
  return data;
}

export function saveLS(data: LSData): void {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

/* ---------- IndexedDB ---------- */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" }); // {id, blob, mimeType, createdAt}
      }
      if (!db.objectStoreNames.contains("records")) {
        const s = db.createObjectStore("records", { keyPath: "id" });
        s.createIndex("personId", "personId");
        s.createIndex("capturedAt", "capturedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export async function putPhoto(id: string, blob: Blob, mimeType: string): Promise<void> {
  await tx("photos", "readwrite", (s) =>
    s.put({ id, blob, mimeType, createdAt: new Date().toISOString() }),
  );
}

export async function getPhoto(id: string): Promise<{ id: string; blob: Blob; mimeType: string } | undefined> {
  return tx("photos", "readonly", (s) => s.get(id) as IDBRequest<{ id: string; blob: Blob; mimeType: string } | undefined>);
}

export async function listPhotos(): Promise<Array<{ id: string; blob: Blob; mimeType: string; createdAt: string }>> {
  return tx("photos", "readonly", (s) => s.getAll() as IDBRequest<Array<{ id: string; blob: Blob; mimeType: string; createdAt: string }>>);
}

export async function deletePhoto(id: string): Promise<void> {
  await tx("photos", "readwrite", (s) => s.delete(id));
}

export async function putRecord(r: PhotoRecordMeta): Promise<void> {
  await tx("records", "readwrite", (s) => s.put(r));
}

export async function listRecords(): Promise<PhotoRecordMeta[]> {
  const all = await tx("records", "readonly", (s) => s.getAll() as IDBRequest<PhotoRecordMeta[]>);
  return all.sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1));
}

export async function deleteRecord(id: string): Promise<void> {
  await tx("records", "readwrite", (s) => s.delete(id));
}

export function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (navigator.storage?.estimate) {
    return navigator.storage.estimate().then((e) => ({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
  }
  return Promise.resolve(null);
}

export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
