export type PhysicalStatus = "new" | "like_new" | "good" | "used" | "worn";
export type DecisionStatus = "keep" | "sell" | "donate" | "maybe" | "repair";
export type ExitType =
  "sold" | "donated" | "discarded" | "gifted" | "returned" | "lost";
export type SpaceType = "home" | "room" | "storage" | "zone";
export interface ClothingItem {
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
export interface WearLog {
  id: string;
  clothingItemIds: string[];
  outfitId?: string;
  date: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface Outfit {
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
export interface PurchaseOrder {
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
export interface SaleRecord {
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
export interface ClosetExit {
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
export interface WishlistItem {
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
export interface Space {
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
export interface Settings {
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
}
