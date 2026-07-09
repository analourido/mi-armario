import Dexie, { type EntityTable } from "dexie";
import type {
  ClothingItem,
  WearLog,
  Outfit,
  PurchaseOrder,
  SaleRecord,
  Settings,
  ClosetExit,
  WishlistItem,
  Space,
  ResaleListing,
  WeatherLocation,
  WeatherCache,
  UserRoutine,
  WardrobeEvent,
  Trip,
  TripPackingItem,
  TripPlannedOutfit,
  LocalSyncState,
  SyncDelete,
  SyncableCollection,
} from "./types";
export const db = new Dexie("MiVestidor") as Dexie & {
  clothingItems: EntityTable<ClothingItem, "id">;
  wearLogs: EntityTable<WearLog, "id">;
  outfits: EntityTable<Outfit, "id">;
  purchaseOrders: EntityTable<PurchaseOrder, "id">;
  saleRecords: EntityTable<SaleRecord, "id">;
  closetExits: EntityTable<ClosetExit, "id">;
  wishlistItems: EntityTable<WishlistItem, "id">;
  spaces: EntityTable<Space, "id">;
  resaleListings: EntityTable<ResaleListing, "id">;
  weatherLocations: EntityTable<WeatherLocation, "id">;
  weatherCache: EntityTable<WeatherCache, "id">;
  userRoutines: EntityTable<UserRoutine, "id">;
  wardrobeEvents: EntityTable<WardrobeEvent, "id">;
  trips: EntityTable<Trip, "id">;
  tripPackingItems: EntityTable<TripPackingItem, "id">;
  tripPlannedOutfits: EntityTable<TripPlannedOutfit, "id">;
  syncState: EntityTable<LocalSyncState, "id">;
  syncDeletes: EntityTable<SyncDelete, "id">;
  settings: EntityTable<Settings, "id">;
};
db.version(1).stores({
  clothingItems:
    "id,name,category,decisionStatus,createdAt,purchaseOrderId,saleRecordId",
  wearLogs: "id,date,*clothingItemIds,outfitId",
  outfits: "id,name,favorite",
  settings: "id",
  purchaseOrders: "id,date,store,*clothingItemIds",
  saleRecords: "id,date,clothingItemId,platform",
});
db.version(2).stores({
  clothingItems:
    "id,name,category,decisionStatus,createdAt,purchaseOrderId,saleRecordId,isArchived,*tags",
  wearLogs: "id,date,*clothingItemIds,outfitId",
  outfits: "id,name,favorite",
  settings: "id",
  purchaseOrders: "id,date,store,*clothingItemIds",
  saleRecords: "id,date,clothingItemId,platform",
  closetExits: "id,date,clothingItemId,type",
  wishlistItems: "id,status,priority,category,createdAt",
});
db.version(3).stores({
  clothingItems:
    "id,name,category,decisionStatus,createdAt,purchaseOrderId,saleRecordId,isArchived,spaceId,*tags",
  wearLogs: "id,date,*clothingItemIds,outfitId",
  outfits: "id,name,favorite",
  settings: "id",
  purchaseOrders: "id,date,store,*clothingItemIds",
  saleRecords: "id,date,clothingItemId,platform",
  closetExits: "id,date,clothingItemId,type",
  wishlistItems: "id,status,priority,category,createdAt",
  spaces: "id,type,parentId,createdAt",
});
db.version(4).stores({
  clothingItems:
    "id,name,category,decisionStatus,createdAt,updatedAt,purchaseOrderId,saleRecordId,isArchived,spaceId,userId,syncStatus,lastSyncedAt,*tags",
  wearLogs: "id,date,updatedAt,userId,syncStatus,*clothingItemIds,outfitId",
  outfits: "id,name,favorite,updatedAt,userId,syncStatus",
  settings: "id,updatedAt,userId,syncStatus",
  purchaseOrders: "id,date,store,updatedAt,userId,syncStatus,*clothingItemIds",
  saleRecords: "id,date,clothingItemId,platform,updatedAt,userId,syncStatus",
  closetExits: "id,date,clothingItemId,type,updatedAt,userId,syncStatus",
  wishlistItems: "id,status,priority,category,createdAt,updatedAt,userId,syncStatus",
  spaces: "id,type,parentId,createdAt,updatedAt,userId,syncStatus",
  syncState: "id,syncEnabled,mode,lastSyncedAt",
  syncDeletes: "id,collection,docId,userId,syncStatus,updatedAt",
});
db.version(5).stores({
  clothingItems:
    "id,name,category,decisionStatus,createdAt,updatedAt,purchaseOrderId,saleRecordId,isArchived,spaceId,resaleListingId,userId,syncStatus,lastSyncedAt,*tags",
  wearLogs: "id,date,updatedAt,userId,syncStatus,*clothingItemIds,outfitId",
  outfits: "id,name,favorite,updatedAt,userId,syncStatus",
  settings: "id,updatedAt,userId,syncStatus",
  purchaseOrders: "id,date,store,updatedAt,userId,syncStatus,*clothingItemIds",
  saleRecords: "id,date,clothingItemId,platform,updatedAt,userId,syncStatus",
  closetExits: "id,date,clothingItemId,type,updatedAt,userId,syncStatus",
  wishlistItems: "id,status,priority,category,createdAt,updatedAt,userId,syncStatus",
  spaces: "id,type,parentId,createdAt,updatedAt,userId,syncStatus",
  resaleListings:
    "id,clothingItemId,platform,status,listedAt,soldAt,updatedAt,userId,syncStatus",
  syncState: "id,syncEnabled,mode,lastSyncedAt",
  syncDeletes: "id,collection,docId,userId,syncStatus,updatedAt",
});
db.version(6).stores({
  clothingItems:
    "id,name,category,decisionStatus,createdAt,updatedAt,purchaseOrderId,saleRecordId,isArchived,spaceId,resaleListingId,userId,syncStatus,lastSyncedAt,*tags",
  wearLogs: "id,date,updatedAt,userId,syncStatus,*clothingItemIds,outfitId",
  outfits: "id,name,favorite,updatedAt,userId,syncStatus",
  settings: "id,updatedAt,userId,syncStatus",
  purchaseOrders: "id,date,store,updatedAt,userId,syncStatus,*clothingItemIds",
  saleRecords: "id,date,clothingItemId,platform,updatedAt,userId,syncStatus",
  closetExits: "id,date,clothingItemId,type,updatedAt,userId,syncStatus",
  wishlistItems:
    "id,status,priority,category,createdAt,updatedAt,purchaseAdvice,userId,syncStatus",
  spaces: "id,type,parentId,createdAt,updatedAt,userId,syncStatus",
  resaleListings:
    "id,clothingItemId,platform,status,listedAt,soldAt,updatedAt,userId,syncStatus",
  syncState: "id,syncEnabled,mode,lastSyncedAt",
  syncDeletes: "id,collection,docId,userId,syncStatus,updatedAt",
});
db.version(7).stores({
  clothingItems:
    "id,name,category,decisionStatus,createdAt,updatedAt,purchaseOrderId,saleRecordId,isArchived,spaceId,resaleListingId,userId,syncStatus,lastSyncedAt,*tags",
  wearLogs: "id,date,updatedAt,userId,syncStatus,*clothingItemIds,outfitId",
  outfits: "id,name,favorite,updatedAt,userId,syncStatus",
  settings: "id,updatedAt,userId,syncStatus",
  purchaseOrders: "id,date,store,updatedAt,userId,syncStatus,*clothingItemIds",
  saleRecords: "id,date,clothingItemId,platform,updatedAt,userId,syncStatus",
  closetExits: "id,date,clothingItemId,type,updatedAt,userId,syncStatus",
  wishlistItems:
    "id,status,priority,category,createdAt,updatedAt,purchaseAdvice,userId,syncStatus",
  spaces: "id,type,parentId,createdAt,updatedAt,userId,syncStatus",
  resaleListings:
    "id,clothingItemId,platform,status,listedAt,soldAt,updatedAt,userId,syncStatus",
  weatherLocations:
    "id,name,isDefault,updatedAt,userId,syncStatus,lastSyncedAt",
  weatherCache: "id,locationId,date,fetchedAt",
  userRoutines: "id,dayOfWeek,type,updatedAt,userId,syncStatus,lastSyncedAt",
  wardrobeEvents: "id,date,type,updatedAt,userId,syncStatus,lastSyncedAt",
  syncState: "id,syncEnabled,mode,lastSyncedAt",
  syncDeletes: "id,collection,docId,userId,syncStatus,updatedAt",
});
db.version(8).stores({
  clothingItems:
    "id,name,category,decisionStatus,createdAt,updatedAt,purchaseOrderId,saleRecordId,isArchived,spaceId,resaleListingId,userId,syncStatus,lastSyncedAt,*tags",
  wearLogs: "id,date,updatedAt,userId,syncStatus,*clothingItemIds,outfitId",
  outfits: "id,name,favorite,updatedAt,userId,syncStatus",
  settings: "id,updatedAt,userId,syncStatus",
  purchaseOrders: "id,date,store,updatedAt,userId,syncStatus,*clothingItemIds",
  saleRecords: "id,date,clothingItemId,platform,updatedAt,userId,syncStatus",
  closetExits: "id,date,clothingItemId,type,updatedAt,userId,syncStatus",
  wishlistItems:
    "id,status,priority,category,createdAt,updatedAt,purchaseAdvice,userId,syncStatus",
  spaces: "id,type,parentId,createdAt,updatedAt,userId,syncStatus",
  resaleListings:
    "id,clothingItemId,platform,status,listedAt,soldAt,updatedAt,userId,syncStatus",
  weatherLocations:
    "id,name,isDefault,updatedAt,userId,syncStatus,lastSyncedAt",
  weatherCache: "id,locationId,date,fetchedAt",
  userRoutines: "id,dayOfWeek,type,updatedAt,userId,syncStatus,lastSyncedAt",
  wardrobeEvents: "id,date,type,updatedAt,userId,syncStatus,lastSyncedAt",
  trips: "id,startDate,endDate,type,updatedAt,userId,syncStatus,lastSyncedAt",
  tripPackingItems:
    "id,tripId,clothingItemId,checked,updatedAt,userId,syncStatus,lastSyncedAt",
  tripPlannedOutfits:
    "id,tripId,date,outfitId,updatedAt,userId,syncStatus,lastSyncedAt,*clothingItemIds",
  syncState: "id,syncEnabled,mode,lastSyncedAt",
  syncDeletes: "id,collection,docId,userId,syncStatus,updatedAt",
});
const stamp = new Date().toISOString();
export const defaults: Settings = {
  id: "main",
  categories: [
    "Tops",
    "Camisas",
    "Jerseys",
    "Pantalones",
    "Vaqueros",
    "Faldas",
    "Vestidos",
    "Chaquetas",
    "Abrigos",
    "Zapatos",
    "Bolsos",
    "Accesorios",
    "Ropa de deporte",
    "Ropa de casa",
    "Otros",
  ],
  colors: [
    "Negro",
    "Blanco",
    "Beige",
    "Marrón",
    "Gris",
    "Azul",
    "Verde",
    "Rojo",
    "Rosa",
    "Amarillo",
    "Morado",
    "Naranja",
  ],
  seasons: [
    "Primavera",
    "Verano",
    "Otoño",
    "Invierno",
    "Entretiempo",
    "Todo el año",
  ],
  stores: ["Zara", "Mango", "H&M", "Vinted", "Otra"],
  occasions: [
    "Diario",
    "Trabajo",
    "Cena",
    "Evento",
    "Fiesta",
    "Viaje",
    "Playa",
    "Casual",
    "Arreglado",
    "Cómodo",
  ],
  salePlatforms: ["Vinted", "Wallapop", "Otra"],
  frequentTags: [
    "oficina",
    "fiesta",
    "básico",
    "cómodo",
    "arreglado",
    "vacaciones",
    "me encanta",
  ],
  preferredWorkTags: ["trabajo", "oficina", "cómodo", "arreglado", "básico"],
  preferredWeekendTags: ["cómodo", "casual", "relajado"],
  preferredNightTags: ["noche", "favorito", "arreglado"],
  preferredEventTags: ["evento", "especial", "arreglado"],
  oneInOneOutGoal: true,
  createdAt: stamp,
  updatedAt: stamp,
};
export const syncDefaults: LocalSyncState = {
  id: "main",
  syncEnabled: false,
  mode: "local",
};
export const syncCollections = [
  "clothingItems",
  "wearLogs",
  "outfits",
  "settings",
  "purchaseOrders",
  "saleRecords",
  "closetExits",
  "wishlistItems",
  "spaces",
  "resaleListings",
  "weatherLocations",
  "userRoutines",
  "wardrobeEvents",
  "trips",
  "tripPackingItems",
  "tripPlannedOutfits",
] as const satisfies readonly SyncableCollection[];
let muteSyncTracking = 0;
export async function withoutSyncTracking<T>(task: () => Promise<T>) {
  muteSyncTracking += 1;
  try {
    return await task();
  } finally {
    muteSyncTracking -= 1;
  }
}
const shouldTrackSync = () => !muteSyncTracking;
syncCollections.forEach((tableName) => {
  const table = db.table(tableName);
  table.hook("creating", (_, obj) => {
    if (!shouldTrackSync()) return;
    const at = new Date().toISOString();
    if ("createdAt" in obj && !obj.createdAt) obj.createdAt = at;
    if ("updatedAt" in obj && !obj.updatedAt) obj.updatedAt = at;
    obj.syncStatus = "pending";
    obj.lastSyncedAt = undefined;
    obj.deletedAt = undefined;
    obj.version = (obj.version || 0) + 1;
  });
  table.hook("updating", (mods, _, obj: Record<string, unknown>) => {
    if (!shouldTrackSync()) return mods;
    const nextMods: Record<string, unknown> = {
      ...mods,
      syncStatus: "pending",
      lastSyncedAt: undefined,
      version: Number(obj.version || 0) + 1,
    };
    if ("updatedAt" in obj) nextMods.updatedAt = new Date().toISOString();
    return nextMods;
  });
});
db.on("populate", () =>
  db.transaction("rw", [db.settings, db.syncState], async () => {
    await db.settings.add(defaults);
    await db.syncState.add(syncDefaults);
  }),
);
export async function queueSoftDelete(
  collection: SyncableCollection,
  docId: string,
  userId?: string,
) {
  const at = new Date().toISOString();
  await db.syncDeletes.put({
    id: `${collection}:${docId}`,
    collection,
    docId,
    userId,
    deletedAt: at,
    updatedAt: at,
    syncStatus: "pending",
    version: 1,
  });
}
export const uid = () => crypto.randomUUID();
export const today = () => new Date().toISOString().slice(0, 10);
