export type PhysicalStatus = "new" | "like_new" | "good" | "used" | "worn";
export type DecisionStatus = "keep" | "sell" | "donate" | "maybe" | "repair";
export type ExitType =
  "sold" | "donated" | "discarded" | "gifted" | "returned" | "lost";
export type SpaceType = "home" | "room" | "storage" | "zone";
export type SyncStatus = "synced" | "pending" | "error";
export type SyncMode = "local" | "syncing" | "synced" | "error";
export type SyncableCollection =
  | "clothingItems"
  | "wearLogs"
  | "outfits"
  | "settings"
  | "purchaseOrders"
  | "saleRecords"
  | "closetExits"
  | "wishlistItems"
  | "spaces";
export interface SyncMeta {
  userId?: string;
  syncStatus?: SyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  version?: number;
}
export interface ImageSyncMeta {
  imageUrl?: string;
  thumbnailUrl?: string;
  localImage?: string;
  imageUpdatedAt?: string;
}
export interface ClothingItem extends SyncMeta, ImageSyncMeta {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  colors: string[];
  season: string[];
  size?: string;
  brand?: string;
  store?: string;
  originalPrice?: number;
  estimatedValue?: number;
  purchaseDate?: string;
  physicalStatus: PhysicalStatus;
  decisionStatus: DecisionStatus;
  vintedStatus?: "not_listed" | "listed" | "sold";
  notes?: string;
  image?: string;
  purchaseOrderId?: string;
  soldAt?: string;
  saleRecordId?: string;
  tags?: string[];
  spaceId?: string;
  isArchived?: boolean;
  archivedAt?: string;
  archiveReason?: ExitType;
  createdAt: string;
  updatedAt: string;
}
export interface WearLog extends SyncMeta {
  id: string;
  clothingItemIds: string[];
  outfitId?: string;
  date: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface Outfit extends SyncMeta, ImageSyncMeta {
  id: string;
  name: string;
  clothingItemIds: string[];
  occasion?: string;
  season: string[];
  notes?: string;
  image?: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface PurchaseOrder extends SyncMeta {
  id: string;
  date: string;
  store: string;
  orderName?: string;
  totalCost: number;
  shippingCost?: number;
  discount?: number;
  notes?: string;
  clothingItemIds: string[];
  createdAt: string;
  updatedAt: string;
}
export interface SaleRecord extends SyncMeta {
  id: string;
  clothingItemId: string;
  date: string;
  platform: "vinted" | "wallapop" | "other";
  salePrice: number;
  shippingIncluded?: boolean;
  fees?: number;
  netProfit?: number;
  buyer?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export interface ClosetExit extends SyncMeta {
  id: string;
  clothingItemId: string;
  date: string;
  type: ExitType;
  amount?: number;
  platform?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export interface WishlistItem extends SyncMeta {
  id: string;
  name: string;
  category?: string;
  colors?: string[];
  store?: string;
  estimatedPrice?: number;
  priority: "low" | "medium" | "high";
  reason?: string;
  status: "pending" | "bought" | "discarded";
  createdAt: string;
  updatedAt: string;
}
export interface Space extends SyncMeta, ImageSyncMeta {
  id: string;
  name: string;
  type: SpaceType;
  parentId?: string;
  photo?: string;
  notes?: string;
  capacity?: number;
  createdAt: string;
  updatedAt: string;
}
export interface Settings extends SyncMeta {
  id: string;
  categories: string[];
  colors: string[];
  seasons: string[];
  stores: string[];
  occasions: string[];
  salePlatforms: string[];
  frequentTags?: string[];
  monthlyClothingBudget?: number;
  oneInOneOutGoal?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
export interface LocalSyncState {
  id: string;
  syncEnabled: boolean;
  mode: SyncMode;
  lastSyncedAt?: string;
  lastError?: string;
  hasCompletedInitialSync?: boolean;
}
export interface SyncDelete {
  id: string;
  collection: SyncableCollection;
  docId: string;
  userId?: string;
  deletedAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  version: number;
}
