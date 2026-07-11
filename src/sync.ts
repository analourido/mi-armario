import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Table } from "dexie";
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut, type User, browserLocalPersistence } from "firebase/auth";
import { getApps, initializeApp } from "firebase/app";
import { collection, doc, getDocs, getFirestore, setDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadString } from "firebase/storage";
import { db, syncCollections, syncDefaults, withoutSyncTracking } from "./db";
import type { LocalSyncState, SyncMode, SyncableCollection } from "./types";

const now = () => new Date().toISOString();
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const hasConfig = Object.values(config).every(Boolean);
let persistenceReady: Promise<void> | null = null;
let activeSync: Promise<void> | null = null;

function services() {
  if (!hasConfig) throw new Error("firebase_missing_config");
  const app = getApps()[0] || initializeApp(config);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const storage = getStorage(app);
  if (!persistenceReady) {
    persistenceReady = setPersistence(auth, browserLocalPersistence).then(
      () => undefined,
    );
  }
  return { auth, firestore, storage, persistenceReady };
}

const singleImageFields: Partial<
  Record<SyncableCollection, Array<"image" | "photo" | "wornPhoto">>
> = {
  clothingItems: ["image"],
  outfits: ["image", "wornPhoto"],
  spaces: ["photo"],
};
const arrayImageFields: Partial<Record<SyncableCollection, Array<"wornPhotos">>> = {
  outfits: ["wornPhotos"],
};
function tableFor(name: SyncableCollection) {
  switch (name) {
    case "clothingItems":
      return db.clothingItems as unknown as Table<Record<string, unknown>, string>;
    case "wearLogs":
      return db.wearLogs as unknown as Table<Record<string, unknown>, string>;
    case "outfits":
      return db.outfits as unknown as Table<Record<string, unknown>, string>;
    case "settings":
      return db.settings as unknown as Table<Record<string, unknown>, string>;
    case "purchaseOrders":
      return db.purchaseOrders as unknown as Table<Record<string, unknown>, string>;
    case "saleRecords":
      return db.saleRecords as unknown as Table<Record<string, unknown>, string>;
    case "closetExits":
      return db.closetExits as unknown as Table<Record<string, unknown>, string>;
    case "wishlistItems":
      return db.wishlistItems as unknown as Table<Record<string, unknown>, string>;
    case "spaces":
      return db.spaces as unknown as Table<Record<string, unknown>, string>;
    case "resaleListings":
      return db.resaleListings as unknown as Table<Record<string, unknown>, string>;
    case "weatherLocations":
      return db.weatherLocations as unknown as Table<Record<string, unknown>, string>;
    case "userRoutines":
      return db.userRoutines as unknown as Table<Record<string, unknown>, string>;
    case "wardrobeEvents":
      return db.wardrobeEvents as unknown as Table<Record<string, unknown>, string>;
    case "trips":
      return db.trips as unknown as Table<Record<string, unknown>, string>;
    case "tripPackingItems":
      return db.tripPackingItems as unknown as Table<Record<string, unknown>, string>;
    case "tripPlannedOutfits":
      return db.tripPlannedOutfits as unknown as Table<Record<string, unknown>, string>;
  }
}

async function setSyncState(changes: Partial<LocalSyncState>) {
  await db.syncState.put({
    ...(await db.syncState.get("main")),
    ...syncDefaults,
    ...changes,
    id: "main",
  });
}

async function countPending() {
  const counts = await Promise.all(
    syncCollections.map((name) =>
      tableFor(name).filter((row: { syncStatus?: string }) => row.syncStatus !== "synced").count(),
    ),
  );
  return counts.reduce((sum: number, count: number) => sum + count, 0) + (await db.syncDeletes.filter((row) => row.syncStatus !== "synced").count());
}

async function uploadImageIfNeeded(
  userId: string,
  collectionName: SyncableCollection,
  record: Record<string, unknown>,
  storage = services().storage,
) {
  const fields = singleImageFields[collectionName] || [];
  const arrayFields = arrayImageFields[collectionName] || [];
  if (!fields.length && !arrayFields.length) return record;
  const imageUpdatedAt =
    typeof record.imageUpdatedAt === "string" ? record.imageUpdatedAt : undefined;
  const lastSyncedAt =
    typeof record.lastSyncedAt === "string" ? record.lastSyncedAt : undefined;
  if (imageUpdatedAt && lastSyncedAt && imageUpdatedAt <= lastSyncedAt)
    return record;
  let prepared = { ...record };
  for (const field of fields) {
    const imageValue = typeof prepared[field] === "string" ? prepared[field] : "";
    if (!imageValue.startsWith("data:")) continue;
    const assetRef = ref(storage, `users/${userId}/${collectionName}/${record.id}/${field}`);
    await uploadString(assetRef, imageValue, "data_url");
    const downloadURL = await getDownloadURL(assetRef);
    prepared = {
      ...prepared,
      [field]: downloadURL,
      ...(field === "image" || field === "photo"
        ? { imageUrl: downloadURL, thumbnailUrl: downloadURL }
        : {}),
    };
  }
  for (const field of arrayFields) {
    const values = Array.isArray(prepared[field]) ? (prepared[field] as unknown[]) : [];
    if (!values.some((value) => typeof value === "string" && value.startsWith("data:")))
      continue;
    const uploaded = await Promise.all(
      values.map(async (value, index) => {
        if (typeof value !== "string" || !value.startsWith("data:")) return value;
        const assetRef = ref(
          storage,
          `users/${userId}/${collectionName}/${record.id}/${field}/${index}`,
        );
        await uploadString(assetRef, value, "data_url");
        return getDownloadURL(assetRef);
      }),
    );
    prepared = { ...prepared, [field]: uploaded };
  }
  return prepared;
}

function remotePayload(
  collectionName: SyncableCollection,
  record: Record<string, unknown>,
  userId: string,
) {
  const payload: Record<string, unknown> = { ...record, userId };
  delete payload.syncStatus;
  delete payload.lastSyncedAt;
  delete payload.localImage;
  if (collectionName === "settings") delete payload.syncEnabled;
  return payload;
}

function applyRemoteImages(
  collectionName: SyncableCollection,
  remote: Record<string, unknown>,
  local?: Record<string, unknown>,
) {
  const fields = singleImageFields[collectionName] || [];
  const arrayFields = arrayImageFields[collectionName] || [];
  if (!fields.length && !arrayFields.length) return remote;
  let merged = { ...remote };
  for (const field of fields) {
    const localImage = local?.[field] as string | undefined;
    const remoteImage = remote[field] as string | undefined;
    merged = {
      ...merged,
      [field]:
        localImage?.startsWith("data:")
          ? localImage
          : remoteImage || (remote.imageUrl as string | undefined),
    };
  }
  for (const field of arrayFields) {
    const localImages = Array.isArray(local?.[field]) ? (local?.[field] as string[]) : [];
    merged = {
      ...merged,
      [field]: localImages.some((value) => value.startsWith("data:"))
        ? localImages
        : remote[field],
    };
  }
  return merged;
}

async function pushPendingRecords(userId: string) {
  const { firestore, storage } = services();
  for (const name of syncCollections) {
    const rows = await tableFor(name)
      .filter((row: { syncStatus?: string }) => row.syncStatus !== "synced")
      .toArray();
    for (const row of rows as Record<string, unknown>[]) {
      const prepared = await uploadImageIfNeeded(userId, name, row, storage);
      await setDoc(
        doc(collection(firestore, `users/${userId}/${name}`), String(row.id)),
        remotePayload(name, {
          ...prepared,
          userId,
          lastSyncedAt: now(),
        }, userId),
        { merge: true },
      );
      await withoutSyncTracking(async () => {
        await tableFor(name).put({
          ...row,
          ...applyRemoteImages(name, prepared, row),
          userId,
          syncStatus: "synced",
          lastSyncedAt: now(),
        });
      });
    }
  }
}

async function pushDeletes(userId: string) {
  const { firestore } = services();
  const deletes = await db.syncDeletes
    .filter((row) => row.syncStatus !== "synced")
    .toArray();
  for (const tombstone of deletes) {
    await setDoc(
      doc(collection(firestore, `users/${userId}/${tombstone.collection}`), tombstone.docId),
      {
        id: tombstone.docId,
        userId,
        deletedAt: tombstone.deletedAt,
        updatedAt: tombstone.updatedAt,
        version: tombstone.version,
      },
      { merge: true },
    );
    await db.syncDeletes.delete(tombstone.id);
  }
}

async function pullRemoteRecords(userId: string) {
  const { firestore } = services();
  for (const name of syncCollections) {
    const snapshot = await getDocs(collection(firestore, `users/${userId}/${name}`));
    const locals = await tableFor(name).toArray();
    const byId = new Map(
      (locals as Record<string, unknown>[]).map((entry) => [String(entry.id), entry]),
    );
    for (const remoteDoc of snapshot.docs) {
      const remote = remoteDoc.data() as Record<string, unknown>;
      const id = String(remoteDoc.id);
      if (typeof remote.deletedAt === "string" && remote.deletedAt) {
        await withoutSyncTracking(async () => {
          await tableFor(name).delete(id);
        });
        continue;
      }
      const local = byId.get(id);
      const remoteUpdatedAt =
        typeof remote.updatedAt === "string" ? remote.updatedAt : "";
      const localUpdatedAt =
        typeof local?.updatedAt === "string" ? local.updatedAt : "";
      if (local && localUpdatedAt > remoteUpdatedAt) continue;
      const merged = applyRemoteImages(name, {
        ...remote,
        id,
        userId,
        syncStatus: "synced",
        lastSyncedAt: now(),
      }, local);
      await withoutSyncTracking(async () => {
        await tableFor(name).put(merged as Record<string, unknown>);
      });
    }
  }
}

export async function markEverythingPending() {
  await Promise.all(
    syncCollections.map(async (name) => {
      const rows = (await tableFor(name).toArray()) as Record<string, unknown>[];
      if (!rows.length) return;
      await tableFor(name).bulkPut(
        rows.map((row) => ({
          ...row,
          syncStatus: "pending",
          lastSyncedAt: undefined,
        })),
      );
    }),
  );
}

export async function syncNow() {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    const state = (await db.syncState.get("main")) || syncDefaults;
    if (!state.syncEnabled) return;
    if (!hasConfig) {
      await setSyncState({
        mode: "error",
        lastError: "Falta configurar Firebase en este dispositivo.",
      });
      return;
    }
    if (!navigator.onLine) {
      await setSyncState({
        mode: "error",
        lastError: "Sin conexión. Se sincronizará cuando vuelva internet.",
      });
      return;
    }
    const { auth, persistenceReady } = services();
    await persistenceReady;
    const user = auth.currentUser;
    if (!user) {
      await setSyncState({
        mode: "error",
        lastError: "Inicia sesión para sincronizar entre dispositivos.",
      });
      return;
    }
    await setSyncState({ mode: "syncing", lastError: undefined });
    try {
      await pushPendingRecords(user.uid);
      await pushDeletes(user.uid);
      await pullRemoteRecords(user.uid);
      await setSyncState({
        mode: "synced",
        lastSyncedAt: now(),
        lastError: undefined,
        hasCompletedInitialSync: true,
      });
    } catch {
      await setSyncState({
        mode: "error",
        lastError: "No hemos podido sincronizar ahora mismo. Tus cambios seguirán guardados en local.",
      });
    }
  })().finally(() => {
    activeSync = null;
  });
  return activeSync;
}

export async function setSyncEnabled(syncEnabled: boolean) {
  await setSyncState({
    syncEnabled,
    mode: syncEnabled ? "local" : "local",
    lastError: undefined,
  });
}

export async function signInWithEmail(email: string, password: string) {
  if (!hasConfig) throw new Error("firebase_missing_config");
  const { auth, persistenceReady } = services();
  await persistenceReady;
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email: string, password: string) {
  if (!hasConfig) throw new Error("firebase_missing_config");
  const { auth, persistenceReady } = services();
  await persistenceReady;
  await createUserWithEmailAndPassword(auth, email, password);
}

export async function signOutFromSync() {
  if (!hasConfig) return;
  const { auth } = services();
  await signOut(auth);
  await setSyncState({
    mode: "local",
    lastError: undefined,
  });
}

export function useSyncSummary() {
  const localState =
    useLiveQuery(async () => (await db.syncState.get("main")) || syncDefaults, []) ||
    syncDefaults;
  const pendingChanges = useLiveQuery(countPending, []) ?? 0;
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    if (!hasConfig) {
      setAuthReady(true);
      return;
    }
    const { auth, persistenceReady } = services();
    let stop: () => void = () => {};
    persistenceReady.then(() => {
      stop = onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setAuthReady(true);
      });
    });
    return () => {
      stop();
    };
  }, []);

  useEffect(() => {
    const handle = () => setOnline(navigator.onLine);
    window.addEventListener("online", handle);
    window.addEventListener("offline", handle);
    return () => {
      window.removeEventListener("online", handle);
      window.removeEventListener("offline", handle);
    };
  }, []);

  const mode: SyncMode = useMemo(() => {
    if (!localState.syncEnabled || !user) return "local";
    return localState.mode;
  }, [localState.mode, localState.syncEnabled, user]);

  return {
    user,
    authReady,
    online,
    hasConfig,
    pendingChanges,
    mode,
    syncEnabled: localState.syncEnabled,
    lastSyncedAt: localState.lastSyncedAt,
    lastError: localState.lastError,
    hasCompletedInitialSync: localState.hasCompletedInitialSync,
  };
}

export function useSyncController() {
  const sync = useSyncSummary();
  useEffect(() => {
    if (
      sync.syncEnabled &&
      sync.online &&
      sync.user &&
      sync.hasCompletedInitialSync
    ) {
      void syncNow();
    }
  }, [
    sync.hasCompletedInitialSync,
    sync.online,
    sync.syncEnabled,
    sync.user?.uid,
  ]);

  useEffect(() => {
    if (!sync.syncEnabled || !sync.user || !sync.online || !sync.hasCompletedInitialSync)
      return;
    const timer = window.setInterval(() => {
      void syncNow();
    }, 45000);
    return () => window.clearInterval(timer);
  }, [
    sync.hasCompletedInitialSync,
    sync.online,
    sync.syncEnabled,
    sync.user?.uid,
  ]);
}

export function syncStatusText(sync: ReturnType<typeof useSyncSummary>) {
  if (!sync.syncEnabled)
    return "Tus datos están solo en este dispositivo";
  if (sync.syncEnabled && !sync.user)
    return "Activa la sincronización para usar tu armario en iPad, móvil y ordenador";
  if (!sync.online)
    return "Sin conexión. Se sincronizará cuando vuelva internet";
  if (sync.mode === "syncing") return "Sincronizando ahora…";
  if (sync.lastError) return sync.lastError;
  return "Sincronización activa entre tus dispositivos";
}

export function lastSyncText(lastSyncedAt?: string) {
  if (!lastSyncedAt) return "Todavía no se ha sincronizado";
  const minutes = Math.max(1, Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000));
  return `Hace ${minutes} min`;
}
