export type PhysicalStatus = "new" | "like_new" | "good" | "used" | "worn";
export type DecisionStatus = "keep" | "sell" | "donate" | "maybe" | "repair";
export type ExitType =
  "sold" | "donated" | "discarded" | "gifted" | "returned" | "lost";
export type SpaceType = "home" | "room" | "storage" | "zone";
export type ApproximateAgeRange =
  | "less_1_year"
  | "1_2_years"
  | "3_5_years"
  | "more_5_years"
  | "unknown";
export type EstimatedPastUse =
  | "never"
  | "rarely"
  | "sometimes"
  | "often"
  | "very_often"
  | "unknown";
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
  | "spaces"
  | "resaleListings"
  | "weatherLocations"
  | "userRoutines"
  | "wardrobeEvents"
  | "trips"
  | "tripPackingItems"
  | "tripPlannedOutfits";
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
  approximatePurchaseYear?: number;
  approximateAgeRange?: ApproximateAgeRange;
  estimatedPastUse?: EstimatedPastUse;
  currentLoveLevel?: 1 | 2 | 3 | 4 | 5;
  currentFitLevel?: 1 | 2 | 3 | 4 | 5;
  currentStyleMatch?: 1 | 2 | 3 | 4 | 5;
  comfortLevel?: 1 | 2 | 3 | 4 | 5;
  doubtReason?: string;
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
  resaleListingId?: string;
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
  wornPhoto?: string;
  wornPhotos?: string[];
  fitRating?: 1 | 2 | 3 | 4 | 5;
  confidenceRating?: 1 | 2 | 3 | 4 | 5;
  lastWornAt?: string;
  notesAfterWearing?: string;
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
  maxPrice?: number;
  targetSeason?: string[];
  plannedUse?: string;
  similarItemIds?: string[];
  waitForSale?: boolean;
  purchaseAdvice?: "buy" | "wait" | "skip" | "review";
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
export interface ResaleListing extends SyncMeta {
  id: string;
  clothingItemId: string;
  platform: "vinted" | "wallapop" | "other";
  status:
    | "to_photo"
    | "photos_done"
    | "draft"
    | "listed"
    | "reserved"
    | "sold"
    | "withdrawn"
    | "donated_instead";
  askingPrice?: number;
  minimumPrice?: number;
  soldPrice?: number;
  fees?: number;
  netProfit?: number;
  photosTaken: boolean;
  descriptionReady: boolean;
  listedAt?: string;
  lastUpdatedAt?: string;
  reservedAt?: string;
  soldAt?: string;
  withdrawnAt?: string;
  title?: string;
  description?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export interface WeatherLocation extends SyncMeta {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface WeatherCache {
  id: string;
  locationId: string;
  date: string;
  data: any;
  fetchedAt: string;
}
export interface UserRoutine extends SyncMeta {
  id: string;
  dayOfWeek: number;
  type: "work" | "free" | "study" | "other";
  startTime?: string;
  endTime?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export interface WardrobeEvent extends SyncMeta {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  type:
    | "work"
    | "dinner"
    | "party"
    | "travel"
    | "beach"
    | "event"
    | "casual"
    | "formal"
    | "other";
  dressCode?:
    | "casual"
    | "smart_casual"
    | "formal"
    | "party"
    | "comfortable"
    | "beach";
  locationName?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export interface Trip extends SyncMeta {
  id: string;
  name: string;
  destinationName: string;
  latitude?: number;
  longitude?: number;
  startDate: string;
  endDate: string;
  type:
    | "vacation"
    | "work"
    | "festival"
    | "wedding"
    | "beach"
    | "city"
    | "other";
  coverImage?: string;
  coverImageUpdatedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export interface TripPackingItem extends SyncMeta {
  id: string;
  tripId: string;
  clothingItemId?: string;
  customName?: string;
  category?: string;
  quantity?: number;
  checked: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export interface TripPlannedOutfit extends SyncMeta {
  id: string;
  tripId: string;
  date?: string;
  eventLabel?: string;
  outfitId?: string;
  clothingItemIds: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export type WardrobeColor = {
  id: string;
  name: string;
  hex: string;
  family?: string;
};
export interface Settings extends SyncMeta {
  id: string;
  categories: string[];
  subcategories?: string[];
  colors: string[];
  wardrobeColors?: WardrobeColor[];
  seasons: string[];
  stores: string[];
  brands?: string[];
  tags?: string[];
  occasions: string[];
  eventTypes?: string[];
  tripTypes?: string[];
  salePlatforms: string[];
  frequentTags?: string[];
  preferredWorkTags?: string[];
  preferredWeekendTags?: string[];
  preferredNightTags?: string[];
  preferredEventTags?: string[];
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
