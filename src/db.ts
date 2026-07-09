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
  oneInOneOutGoal: true,
};
db.on("populate", () => db.settings.add(defaults));
export const uid = () => crypto.randomUUID();
export const today = () => new Date().toISOString().slice(0, 10);
