import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Archive,
  AlertCircle,
  BadgeCheck,
  BarChart3,
  Brain,
  CalendarDays,
  Camera,
  Check,
  CheckCircle,
  ChevronLeft,
  CircleHelp,
  CircleDollarSign,
  Clipboard,
  ClipboardList,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Download,
  FileText,
  Gift,
  Heart,
  Home,
  Image as ImageIcon,
  LogIn,
  LogOut,
  Menu,
  MapPin,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Shirt,
  Shuffle,
  ShoppingBag,
  Snowflake,
  Sparkles,
  Star,
  Store,
  Sun,
  Tag,
  Thermometer,
  Luggage,
  Trash2,
  Undo2,
  Umbrella,
  Upload,
  WalletCards,
  Wifi,
  WifiOff,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import {
  db,
  defaults,
  queueSoftDelete,
  syncDefaults,
  today,
  uid,
  withoutSyncTracking,
} from "./db";
import {
  lastSyncText,
  markEverythingPending,
  setSyncEnabled as saveSyncEnabled,
  signInWithEmail,
  signOutFromSync,
  signUpWithEmail,
  syncNow,
  syncStatusText,
  useSyncController,
  useSyncSummary,
} from "./sync";
import type {
  ClothingItem,
  ClosetExit,
  DecisionStatus,
  EstimatedPastUse,
  ExitType,
  ApproximateAgeRange,
  LocalSyncState,
  Outfit,
  PhysicalStatus,
  PurchaseOrder,
  ResaleListing,
  SaleRecord,
  Settings,
  Space,
  SpaceType,
  Trip,
  TripPackingItem,
  TripPlannedOutfit,
  UserRoutine,
  WardrobeEvent,
  WeatherCache,
  WeatherLocation,
  WardrobeColor,
  WishlistItem,
} from "./types";
import {
  buildWeatherContext,
  defaultWeatherLocation,
  fetchWeatherForecast,
  searchWeatherLocations,
  type DailyWeatherSummary,
  type WeatherLocationSearchResult,
} from "./weather";

const money = (n = 0) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    n,
  );
const dateFmt = (s?: string) =>
  s
    ? new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(s + "T12:00:00"))
    : "—";
const now = () => new Date().toISOString(),
  month = (s: string) => s.slice(0, 7),
  currentMonth = () => today().slice(0, 7);
const decisions: Record<DecisionStatus, string> = {
  keep: "Conservar",
  sell: "Vender",
  donate: "Donar",
  maybe: "Duda",
  repair: "Arreglar",
};
const physical: Record<PhysicalStatus, string> = {
  new: "Nuevo",
  like_new: "Como nuevo",
  good: "Buen estado",
  used: "Usado",
  worn: "Gastado",
};
const decisionIcons = {
  keep: Heart,
  sell: Tag,
  donate: Gift,
  maybe: CircleHelp,
  repair: Wrench,
} satisfies Record<DecisionStatus, typeof Heart>;
const physicalIcons = {
  new: Sparkles,
  like_new: Star,
  good: CheckCircle,
  used: Shirt,
  worn: AlertCircle,
} satisfies Record<PhysicalStatus, typeof Shirt>;
const statusClass: Record<DecisionStatus, string> = {
  keep: "keep",
  sell: "sell",
  donate: "donate",
  maybe: "maybe",
  repair: "repair",
};
const ageRanges: Record<ApproximateAgeRange, string> = {
  less_1_year: "Menos de 1 año",
  "1_2_years": "1-2 años",
  "3_5_years": "3-5 años",
  more_5_years: "Más de 5 años",
  unknown: "No lo sé",
};
const estimatedUses: Record<EstimatedPastUse, string> = {
  never: "Nunca",
  rarely: "Pocas veces",
  sometimes: "A veces",
  often: "A menudo",
  very_often: "Muchísimo",
  unknown: "No lo sé",
};
const resaleStatuses = {
  to_photo: "Pendiente de fotos",
  photos_done: "Fotos hechas",
  draft: "En borrador",
  listed: "Subida",
  reserved: "Reservada",
  sold: "Vendida",
  withdrawn: "Retirada",
  donated_instead: "Donada al final",
} as const;
const resaleIcons = {
  to_photo: Camera,
  photos_done: ImageIcon,
  draft: FileText,
  listed: Upload,
  reserved: CalendarDays,
  sold: BadgeCheck,
  withdrawn: Archive,
  donated_instead: Gift,
} satisfies Record<keyof typeof resaleStatuses, typeof Camera>;
const resalePipeline = [
  "to_photo",
  "photos_done",
  "draft",
  "listed",
  "reserved",
  "sold",
] as const;
const spaceTypes: Record<SpaceType, string> = {
  home: "Casa o base",
  room: "Habitación",
  storage: "Mueble o contenedor",
  zone: "Zona concreta",
};
const spaceTypeRank: Record<SpaceType, number> = {
  home: 0,
  room: 1,
  storage: 2,
  zone: 3,
};
function daysSince(date?: string) {
  if (!date) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 86400000),
  );
}
function resaleAge(listing: ResaleListing) {
  return daysSince(listing.listedAt || listing.createdAt);
}
function suggestedDrop(listing: ResaleListing) {
  if (!listing.askingPrice) return;
  const ratio = resaleAge(listing) >= 60 ? 0.2 : 0.1;
  const next = Math.round(listing.askingPrice * (1 - ratio));
  return listing.minimumPrice
    ? Math.max(next, listing.minimumPrice)
    : next;
}
function buildListingCopy(item: ClothingItem, listing?: ResaleListing) {
  const attrs = [
    item.brand,
    item.category,
    item.size ? `talla ${item.size}` : "",
    item.colors?.[0] ? `color ${item.colors[0].toLowerCase()}` : "",
    item.notes || "",
  ].filter(Boolean);
  const title = [
    item.brand,
    item.name,
    item.size ? `T${item.size}` : "",
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 70);
  const priceBase = listing?.askingPrice || item.estimatedValue || item.originalPrice;
  const description = [
    `${item.name}${item.brand ? ` de ${item.brand}` : ""}.`,
    item.category ? `Categoría: ${item.category}.` : "",
    item.size ? `Talla: ${item.size}.` : "",
    item.colors?.length ? `Color: ${item.colors.join(", ")}.` : "",
    `Estado: ${physical[item.physicalStatus]}.`,
    item.notes ? `Detalle: ${item.notes}.` : "",
    "Es una prenda cuidada y lista para una nueva vida.",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    title: listing?.title || title,
    description: listing?.description || description,
    suggestedPrice: priceBase ? Math.round(priceBase) : undefined,
    summary: attrs.join(" · "),
  };
}

const defaultWardrobeColors: WardrobeColor[] = [
  { id: "blanco", name: "Blanco", hex: "#FFFFFF", family: "neutro" },
  { id: "negro", name: "Negro", hex: "#111111", family: "neutro" },
  { id: "gris", name: "Gris", hex: "#9CA3AF", family: "neutro" },
  { id: "beige", name: "Beige", hex: "#D8C7B1", family: "neutro" },
  { id: "marron", name: "Marrón", hex: "#7A5238", family: "tierra" },
  { id: "azul", name: "Azul", hex: "#3B5F8A", family: "frío" },
  { id: "vaquero", name: "Vaquero", hex: "#6F8FAF", family: "frío" },
  { id: "rojo", name: "Rojo", hex: "#B91C1C", family: "cálido" },
  { id: "rosa", name: "Rosa", hex: "#E8A2B8", family: "cálido" },
  { id: "verde", name: "Verde", hex: "#4F7A5A", family: "frío" },
  { id: "amarillo", name: "Amarillo", hex: "#EAB308", family: "cálido" },
  { id: "naranja", name: "Naranja", hex: "#EA580C", family: "cálido" },
  { id: "morado", name: "Morado", hex: "#7C3AED", family: "frío" },
  { id: "multicolor", name: "Multicolor", hex: "#8B5CF6", family: "especial" },
];
const normalizeKey = (value: string) =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const prettyValue = (value: string) => {
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean) return "";
  return clean
    .split(" ")
    .map((part) =>
      part.length <= 3 && part === part.toUpperCase()
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(" ");
};
function addUnique(list: string[] = [], value?: string) {
  const clean = prettyValue(value || "");
  if (!clean) return list;
  return list.some((entry) => normalizeKey(entry) === normalizeKey(clean))
    ? list
    : [...list, clean];
}
function addManyUnique(list: string[] = [], values: string[] = []) {
  return values.reduce((next, value) => addUnique(next, value), list);
}
function wardrobeColors(settings?: Settings) {
  const configured = settings?.wardrobeColors?.length
    ? settings.wardrobeColors
    : defaultWardrobeColors;
  const byName = new Map(configured.map((color) => [normalizeKey(color.name), color]));
  (settings?.colors || []).forEach((name) => {
    const key = normalizeKey(name);
    if (!byName.has(key)) {
      byName.set(key, {
        id: key || uid(),
        name,
        hex: defaultWardrobeColors.find((color) => normalizeKey(color.name) === key)?.hex || "#D4D4D4",
      });
    }
  });
  return [...byName.values()];
}
function colorValue(c: string, settings?: Settings) {
  return (
    wardrobeColors(settings).find((color) => normalizeKey(color.name) === normalizeKey(c))
      ?.hex || "#c2bab3"
  );
}
function colorLabelForName(color: string, base: string) {
  const key = normalizeKey(color);
  const feminine = /\b(chaqueta|camisa|falda|cazadora|americana|sobrecamisa|blusa)\b/i.test(base);
  const map: Record<string, [string, string]> = {
    blanco: ["blanco", "blanca"],
    negro: ["negro", "negra"],
    rojo: ["rojo", "roja"],
    amarillo: ["amarillo", "amarilla"],
    morado: ["morado", "morada"],
  };
  return map[key] ? map[key][feminine ? 1 : 0] : color.toLowerCase();
}
function suggestedItemName(form: Partial<ClothingItem>) {
  const base = (form.subcategory || form.category || "").trim();
  if (!base) return "";
  const colors = form.colors || [];
  const color =
    colors.length > 1
      ? "multicolor"
      : colors[0]
        ? colorLabelForName(colors[0], base)
        : "";
  const source = (form.brand || form.store || "").trim();
  const text = [base.toLowerCase(), color].filter(Boolean).join(" ");
  return prettyValue(source ? `${text} de ${source}` : text);
}
function weatherVisual(weather?: DailyWeatherSummary) {
  const description = `${weather?.description || ""}`.toLowerCase();
  if (!weather) return { Icon: CloudSun, label: "Sin clima", hint: "Actualiza el clima para afinar el look." };
  if (description.includes("tormenta")) return { Icon: CloudLightning, label: "Tormenta", hint: "Capas y calzado cerrado." };
  if (description.includes("lluv")) return { Icon: CloudRain, label: "Lluvia", hint: "Zapato cerrado y prenda exterior." };
  if (description.includes("niebla")) return { Icon: CloudFog, label: "Niebla", hint: "Capas suaves y visibilidad." };
  if (weather.windSpeedMax >= 26) return { Icon: Wind, label: "Viento", hint: "Evita prendas delicadas." };
  if (weather.temperatureMax < 10) return { Icon: Snowflake, label: "Frío", hint: "Abrigo y zapato cerrado." };
  if (weather.temperatureMax > 23) return { Icon: Sun, label: "Calor", hint: "Ropa ligera y cómoda." };
  if (description.includes("nub")) return { Icon: Cloud, label: "Nubes", hint: "Entretiempo cómodo." };
  return { Icon: CloudSun, label: "Entretiempo", hint: "Look flexible por capas." };
}
type ConfidenceLevel = "alto" | "medio" | "bajo";
type SmartInsight = {
  id: string;
  kind:
    | "sell"
    | "donate"
    | "keep"
    | "forgotten"
    | "category"
    | "renewal"
    | "duplicate"
    | "wishlist";
  title: string;
  explanation: string;
  confidence: ConfidenceLevel;
  itemIds?: string[];
  category?: string;
  action?: DecisionStatus | "review_later";
};
function confidenceLevel(score: number): ConfidenceLevel {
  return score >= 72 ? "alto" : score >= 45 ? "medio" : "bajo";
}
function average(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}
function usesForItem(itemId: string, wears: Data["wears"]) {
  return wears.filter((w) => w.clothingItemIds.includes(itemId)).length;
}
function recentUsesForItem(itemId: string, wears: Data["wears"], days: number) {
  const limit = Date.now() - days * 86400000;
  return wears.filter(
    (w) =>
      w.clothingItemIds.includes(itemId) &&
      new Date(w.date).getTime() >= limit,
  ).length;
}
function wishlistAdviceText(
  wish: WishlistItem,
  data: Data,
): { advice: "buy" | "wait" | "skip" | "review"; text: string; relatedItemIds: string[] } {
  const similar = data.items.filter(
    (i) =>
      !i.isArchived &&
      i.category === wish.category &&
      (!wish.colors?.length || wish.colors.some((c) => i.colors.includes(c))),
  );
  const categoryUses = wish.category
    ? data.wears.filter((w) =>
        w.clothingItemIds.some(
          (id) => data.items.find((i) => i.id === id)?.category === wish.category,
        ),
      ).length
    : 0;
  const avgSpend =
    data.orders.length
      ? data.orders.reduce((sum, order) => sum + order.totalCost, 0) /
        data.orders.length
      : 0;
  if (similar.length >= 4)
    return {
      advice: "review",
      text: `Revisa antes: ya tienes ${similar.length} prendas parecidas.`,
      relatedItemIds: similar.slice(0, 4).map((i) => i.id),
    };
  if (
    wish.estimatedPrice &&
    ((avgSpend && wish.estimatedPrice > avgSpend) ||
      (data.settings.monthlyClothingBudget &&
        wish.estimatedPrice > data.settings.monthlyClothingBudget))
  )
    return {
      advice: "wait",
      text: "Quizá espera a rebajas: el precio es alto para tu gasto medio.",
      relatedItemIds: similar.slice(0, 3).map((i) => i.id),
    };
  if (categoryUses >= 6)
    return {
      advice: "buy",
      text: "Puede tener sentido comprarlo: usas mucho esta categoría.",
      relatedItemIds: similar.slice(0, 3).map((i) => i.id),
    };
  return {
    advice: "review",
    text: similar.length
      ? "Si entra esta prenda, podrías revisar estas otras."
      : "Revísalo con calma: puede ser una compra interesante si cubre un hueco real.",
    relatedItemIds: similar.slice(0, 3).map((i) => i.id),
  };
}
function smartItemScore(item: ClothingItem, data: Data) {
  const totalUses = usesForItem(item.id, data.wears);
  const uses90 = recentUsesForItem(item.id, data.wears, 90);
  const uses180 = recentUsesForItem(item.id, data.wears, 180);
  const loved = item.currentLoveLevel || 0;
  const fit = item.currentFitLevel || 0;
  const style = item.currentStyleMatch || 0;
  const comfort = item.comfortLevel || 0;
  const similar = data.items.filter(
    (x) =>
      x.id !== item.id &&
      !x.isArchived &&
      x.category === item.category &&
      x.colors.some((c) => item.colors.includes(c)),
  );
  const moreUsedSimilar = similar.filter(
    (x) => usesForItem(x.id, data.wears) > totalUses,
  ).length;
  const favoriteHint =
    item.tags?.some((tag) =>
      ["favorita", "me encanta", "favorite"].includes(tag.toLowerCase()),
    ) || false;
  let keep = 0,
    sell = 0,
    donate = 0,
    repair = 0,
    renewal = 0,
    evidence = 0;
  if (loved) {
    keep += loved * 7;
    sell += loved <= 2 ? 16 : 0;
    donate += loved <= 2 ? 12 : 0;
    evidence += 1;
  }
  if (fit) {
    keep += fit * 6;
    sell += fit <= 2 ? 18 : 0;
    donate += fit <= 2 ? 10 : 0;
    evidence += 1;
  }
  if (style) {
    keep += style * 6;
    sell += style <= 2 ? 14 : 0;
    donate += style <= 2 ? 12 : 0;
    evidence += 1;
  }
  if (comfort) {
    keep += comfort * 5;
    sell += comfort <= 2 ? 10 : 0;
    evidence += 1;
  }
  if (item.estimatedPastUse) {
    keep +=
      item.estimatedPastUse === "very_often"
        ? 18
        : item.estimatedPastUse === "often"
          ? 12
          : item.estimatedPastUse === "sometimes"
            ? 6
            : 0;
    sell += ["never", "rarely"].includes(item.estimatedPastUse) ? 14 : 0;
    donate += ["never", "rarely"].includes(item.estimatedPastUse) ? 12 : 0;
    evidence += item.estimatedPastUse !== "unknown" ? 1 : 0;
  }
  keep += Math.min(totalUses, 12) * 2;
  keep += uses90 ? 16 : 0;
  sell += !uses90 ? 16 : 0;
  sell += !uses180 ? 10 : 0;
  donate += !uses180 ? 12 : 0;
  if (item.decisionStatus === "sell") sell += 18;
  if (item.decisionStatus === "donate") donate += 18;
  if (item.decisionStatus === "repair") repair += 20;
  if (item.physicalStatus === "worn") {
    repair += 20;
    renewal += 16;
  }
  if (item.physicalStatus === "used") repair += 10;
  if ((item.estimatedValue || 0) >= 20 && item.physicalStatus === "good")
    sell += 12;
  if ((item.estimatedValue || 0) < 15 && !uses180) donate += 10;
  if (favoriteHint) keep += 18;
  if (moreUsedSimilar >= 2) sell += 12;
  const categoryActive = data.items.filter(
    (x) => !x.isArchived && x.category === item.category,
  ).length;
  const categoryUses90 = data.wears.filter((w) =>
    new Date(w.date).getTime() >= Date.now() - 90 * 86400000 &&
    w.clothingItemIds.some(
      (id) => data.items.find((i) => i.id === id)?.category === item.category,
    ),
  ).length;
  if (categoryUses90 >= 6 && ["used", "worn"].includes(item.physicalStatus))
    renewal += 14;
  if (categoryActive <= 2 && categoryUses90 >= 4) renewal += 12;
  const confidence = Math.min(95, 20 + evidence * 15 + (totalUses ? 10 : 0));
  return {
    keepScore: Math.round(keep),
    sellScore: Math.round(sell),
    donateScore: Math.round(donate),
    repairScore: Math.round(repair),
    renewalScore: Math.round(renewal),
    confidenceScore: confidence,
    recentUses90: uses90,
    totalUses,
    duplicateCount: moreUsedSimilar,
  };
}
function buildSmartInsights(data: Data) {
  const active = data.items.filter((item) => !item.isArchived);
  const scored = active.map((item) => ({ item, score: smartItemScore(item, data) }));
  const sellCandidates = scored
    .filter((entry) => entry.score.sellScore >= 40)
    .sort((a, b) => b.score.sellScore - a.score.sellScore)
    .slice(0, 6);
  const donateCandidates = scored
    .filter((entry) => entry.score.donateScore >= 38)
    .sort((a, b) => b.score.donateScore - a.score.donateScore)
    .slice(0, 6);
  const keepWorthy = scored
    .filter((entry) => entry.score.keepScore >= 50)
    .sort((a, b) => b.score.keepScore - a.score.keepScore)
    .slice(0, 6);
  const forgotten = scored
    .filter((entry) => !entry.score.recentUses90)
    .slice(0, 6);
  const categoryStats = Object.entries(
    active.reduce((acc, item) => {
      const current = acc[item.category] || {
        count: 0,
        lowRated: 0,
        recentUses: 0,
        sellish: 0,
        prices: [] as number[],
      };
      const score = smartItemScore(item, data);
      current.count += 1;
      current.lowRated += average([
        item.currentLoveLevel || 0,
        item.currentFitLevel || 0,
        item.currentStyleMatch || 0,
      ]) <= 2 && item.currentLoveLevel ? 1 : 0;
      current.recentUses += score.recentUses90;
      current.sellish += score.sellScore >= 40 || score.donateScore >= 38 ? 1 : 0;
      if (item.originalPrice && score.totalUses)
        current.prices.push(item.originalPrice / score.totalUses);
      acc[item.category] = current;
      return acc;
    }, {} as Record<string, { count: number; lowRated: number; recentUses: number; sellish: number; prices: number[] }>),
  ).map(([category, value]) => ({
    category,
    ...value,
    avgCpu: average(value.prices),
  }));
  const saturated = categoryStats
    .filter((c) => c.count >= 5 && c.sellish >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const keyCategories = categoryStats
    .filter((c) => c.recentUses >= 6)
    .sort((a, b) => b.recentUses - a.recentUses)
    .slice(0, 3);
  const renewals = categoryStats
    .filter((c) => c.recentUses >= 4 && c.count <= 2)
    .slice(0, 3);
  const duplicates = scored
    .filter((entry) => entry.score.duplicateCount >= 2)
    .slice(0, 4);
  const wishlistWarnings = data.wishlist
    .filter((w) => w.status === "pending")
    .map((wish) => ({ wish, advice: wishlistAdviceText(wish, data) }))
    .filter((entry) => entry.advice.advice !== "buy")
    .slice(0, 3);
  const insights: SmartInsight[] = [];
  if (sellCandidates.length)
    insights.push({
      id: "sell-candidates",
      kind: "sell",
      title: "Hay prendas que podrían venderse bien",
      explanation: `Estas prendas combinan poca conexión actual con buen estado o valor recuperable.`,
      confidence: confidenceLevel(
        average(sellCandidates.map((entry) => entry.score.confidenceScore)),
      ),
      itemIds: sellCandidates.map((entry) => entry.item.id),
      action: "sell",
    });
  if (donateCandidates.length)
    insights.push({
      id: "donate-candidates",
      kind: "donate",
      title: "Algunas prendas quizá compensan más donarlas",
      explanation: "Tienen poco uso o poco encaje actual y no parece que la venta vaya a aportar demasiado.",
      confidence: confidenceLevel(
        average(donateCandidates.map((entry) => entry.score.confidenceScore)),
      ),
      itemIds: donateCandidates.map((entry) => entry.item.id),
      action: "donate",
    });
  if (keepWorthy.length)
    insights.push({
      id: "keep-worth",
      kind: "keep",
      title: "Estas prendas sí merecen quedarse",
      explanation: "Tienen señales claras de uso, gusto actual o buen aprovechamiento.",
      confidence: confidenceLevel(
        average(keepWorthy.map((entry) => entry.score.confidenceScore)),
      ),
      itemIds: keepWorthy.map((entry) => entry.item.id),
      action: "keep",
    });
  if (forgotten.length)
    insights.push({
      id: "forgotten",
      kind: "forgotten",
      title: "Hay prendas olvidadas que conviene revisar",
      explanation: "No tienen usos recientes y pueden estar ocupando espacio mental y físico.",
      confidence: "medio",
      itemIds: forgotten.map((entry) => entry.item.id),
      action: "review_later",
    });
  saturated.forEach((category) =>
    insights.push({
      id: `sat-${category.category}`,
      kind: "category",
      title: `${category.category}: quizá está algo saturada`,
      explanation: `Tienes ${category.count} prendas y varias ya apuntan a salir. Puede ser buena categoría para revisar con calma.`,
      confidence: "medio",
      category: category.category,
      itemIds: active
        .filter((item) => item.category === category.category)
        .slice(0, 5)
        .map((item) => item.id),
    }),
  );
  keyCategories.forEach((category) =>
    insights.push({
      id: `key-${category.category}`,
      kind: "category",
      title: `${category.category}: es una categoría clave para ti`,
      explanation: `La estás usando mucho últimamente. Merece la pena cuidar qué se queda y qué se renueva aquí.`,
      confidence: "alto",
      category: category.category,
      itemIds: active
        .filter((item) => item.category === category.category)
        .slice(0, 5)
        .map((item) => item.id),
    }),
  );
  renewals.forEach((category) =>
    insights.push({
      id: `ren-${category.category}`,
      kind: "renewal",
      title: `${category.category}: puede pedir renovación`,
      explanation: `La usas bastante y tienes pocas prendas activas. Puede tener sentido reforzar esta categoría.`,
      confidence: "medio",
      category: category.category,
      itemIds: data.wishlist
        .filter((wish) => wish.category === category.category)
        .slice(0, 3)
        .map((wish) => wish.similarItemIds?.[0] || "")
        .filter(Boolean),
    }),
  );
  if (duplicates.length)
    insights.push({
      id: "duplicates",
      kind: "duplicate",
      title: "Hay posibles duplicados o prendas muy parecidas",
      explanation: "Puede que algunas estén compitiendo entre sí mientras otras son claramente las que sí eliges.",
      confidence: "medio",
      itemIds: duplicates.map((entry) => entry.item.id),
      action: "sell",
    });
  wishlistWarnings.forEach((entry) =>
    insights.push({
      id: `wish-${entry.wish.id}`,
      kind: "wishlist",
      title: `Wishlist: ${entry.wish.name}`,
      explanation: entry.advice.text,
      confidence: "medio",
      itemIds: entry.advice.relatedItemIds,
    }),
  );
  return { insights, scored };
}

async function compressImage(file?: File) {
  if (!file) return;
  const img = new Image(),
    url = URL.createObjectURL(file);
  await new Promise((r) => {
    img.onload = r;
    img.src = url;
  });
  const max = 1200,
    scale = Math.min(1, max / Math.max(img.width, img.height)),
    canvas = document.createElement("canvas");
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return canvas.toDataURL("image/jpeg", 0.78);
}

async function compressImages(files?: FileList | File[]) {
  const list = Array.from(files || []);
  const images = await Promise.all(list.map((file) => compressImage(file)));
  return images.filter(Boolean) as string[];
}

function spaceMap(spaces: Space[]) {
  return new Map(spaces.map((space) => [space.id, space]));
}

function spacePath(spaceId: string | undefined, spaces: Space[]) {
  if (!spaceId) return [];
  const map = spaceMap(spaces),
    path: Space[] = [],
    seen = new Set<string>();
  let current = map.get(spaceId);
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return path;
}

function spacePathText(spaceId: string | undefined, spaces: Space[]) {
  const path = spacePath(spaceId, spaces);
  return path.length ? path.map((space) => space.name).join(" > ") : "";
}

function childSpaces(parentId: string | undefined, spaces: Space[]) {
  return spaces
    .filter((space) => (parentId ? space.parentId === parentId : !space.parentId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function sortedSpaces(spaces: Space[]) {
  return spaces
    .slice()
    .sort((a, b) => spacePathText(a.id, spaces).localeCompare(spacePathText(b.id, spaces)));
}

function descendantSpaceIds(spaceId: string, spaces: Space[]) {
  const ids = new Set<string>(),
    queue = [spaceId];
  while (queue.length) {
    const current = queue.shift()!;
    if (ids.has(current)) continue;
    ids.add(current);
    childSpaces(current, spaces).forEach((space) => queue.push(space.id));
  }
  return ids;
}

function itemsInSpaceBranch(spaceId: string, items: ClothingItem[], spaces: Space[]) {
  const ids = descendantSpaceIds(spaceId, spaces);
  return items.filter((item) => item.spaceId && ids.has(item.spaceId));
}

function occupancyLabel(count: number, capacity?: number) {
  if (!capacity) return;
  const ratio = count / capacity;
  if (ratio < 0.6) return "Espacio cómodo";
  if (ratio < 0.9) return "Casi lleno";
  return "Muy lleno";
}

async function softDeleteRecords(
  collection:
    | "clothingItems"
    | "wearLogs"
    | "outfits"
    | "purchaseOrders"
    | "closetExits"
    | "wishlistItems"
    | "spaces"
    | "resaleListings"
    | "weatherLocations"
    | "userRoutines"
    | "wardrobeEvents"
    | "trips"
    | "tripPackingItems"
    | "tripPlannedOutfits",
  ids: string[],
) {
  await withoutSyncTracking(async () => {
    for (const id of ids) {
      await queueSoftDelete(collection, id);
      switch (collection) {
        case "clothingItems":
          await db.clothingItems.delete(id);
          break;
        case "wearLogs":
          await db.wearLogs.delete(id);
          break;
        case "outfits":
          await db.outfits.delete(id);
          break;
        case "purchaseOrders":
          await db.purchaseOrders.delete(id);
          break;
        case "closetExits":
          await db.closetExits.delete(id);
          break;
        case "wishlistItems":
          await db.wishlistItems.delete(id);
          break;
        case "spaces":
          await db.spaces.delete(id);
          break;
        case "resaleListings":
          await db.resaleListings.delete(id);
          break;
        case "weatherLocations":
          await db.weatherLocations.delete(id);
          break;
        case "userRoutines":
          await db.userRoutines.delete(id);
          break;
        case "wardrobeEvents":
          await db.wardrobeEvents.delete(id);
          break;
        case "trips":
          await db.trips.delete(id);
          break;
        case "tripPackingItems":
          await db.tripPackingItems.delete(id);
          break;
        case "tripPlannedOutfits":
          await db.tripPlannedOutfits.delete(id);
          break;
      }
    }
  });
}

async function deleteSpaceBranch(space: Space, data: Data) {
  const branchIds = [...descendantSpaceIds(space.id, data.spaces)],
    affectedItems = data.items.filter(
      (item) => item.spaceId && branchIds.includes(item.spaceId),
    );
  const confirmText = `¿Eliminar “${space.name}”${branchIds.length > 1 ? ` y ${branchIds.length - 1} subespacios` : ""}? ${affectedItems.length ? `Las ${affectedItems.length} prendas afectadas se quedarán sin ubicación.` : "No se borrará ninguna prenda."}`;
  if (!confirm(confirmText)) return;
  await db.transaction("rw", [db.spaces, db.clothingItems, db.syncDeletes], async () => {
    if (affectedItems.length) {
      await db.clothingItems.bulkUpdate(
        affectedItems.map((item) => ({
          key: item.id,
          changes: { spaceId: undefined, updatedAt: now() },
        })),
      );
    }
    await softDeleteRecords("spaces", branchIds);
  });
}

const routineTypes: Record<UserRoutine["type"], string> = {
  work: "Trabajo",
  free: "Libre",
  study: "Estudio",
  other: "Otro",
};
const eventTypes: Record<WardrobeEvent["type"], string> = {
  work: "Trabajo",
  dinner: "Cena",
  party: "Fiesta",
  travel: "Viaje",
  beach: "Playa",
  event: "Evento",
  casual: "Plan casual",
  formal: "Plan formal",
  other: "Otro",
};
const dressCodeLabels: Record<NonNullable<WardrobeEvent["dressCode"]>, string> = {
  casual: "Casual",
  smart_casual: "Smart casual",
  formal: "Formal",
  party: "Fiesta",
  comfortable: "Cómodo",
  beach: "Playa",
};
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
const weekdayNames = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

function normalizeText(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function dateDayOfWeek(date: string) {
  return new Date(`${date}T12:00:00`).getDay();
}

function isWeekend(date: string) {
  const day = dateDayOfWeek(date);
  return day === 0 || day === 6;
}

function dayLabel(date: string) {
  return weekdayNames[dateDayOfWeek(date)];
}

function nextDates(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const value = new Date();
    value.setDate(value.getDate() + index);
    return value.toISOString().slice(0, 10);
  });
}

function timeRangeLabel(start?: string, end?: string) {
  if (start && end) return `${start}–${end}`;
  return start || end || "Sin hora";
}

function eventMoment(startTime?: string) {
  const hour = Number(startTime?.slice(0, 2) || 12);
  if (hour < 14) return "Mañana";
  if (hour < 20) return "Tarde";
  return "Noche";
}

function routineSummary(routine?: UserRoutine) {
  if (!routine) return "Sin rutina guardada";
  return `${routineTypes[routine.type]}${routine.startTime || routine.endTime ? ` · ${timeRangeLabel(routine.startTime, routine.endTime)}` : ""}`;
}

function eventSummary(event: WardrobeEvent) {
  return `${eventTypes[event.type]}${event.startTime || event.endTime ? ` · ${timeRangeLabel(event.startTime, event.endTime)}` : ""}`;
}

function getDefaultWeatherLocation(locations: WeatherLocation[]) {
  return locations.find((location) => location.isDefault) || locations[0] || defaultWeatherLocation;
}

function weatherCacheEntry(
  cache: WeatherCache[],
  locationId: string,
  date: string,
) {
  return cache
    .filter((entry) => entry.locationId === locationId && entry.date === date)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0];
}

function cachedForecast(
  cache: WeatherCache[],
  locationId: string,
  days = 4,
) {
  return cache
    .filter((entry) => entry.locationId === locationId && entry.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, days)
    .map((entry) => entry.data as DailyWeatherSummary);
}

function weatherNeedsRefresh(
  cache: WeatherCache[],
  locationId: string,
  days = 4,
) {
  const entries = cache
    .filter((entry) => entry.locationId === locationId && entry.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, days);
  if (entries.length < Math.min(days, 3)) return true;
  return entries.some(
    (entry) => Date.now() - new Date(entry.fetchedAt).getTime() > 4 * 3600000,
  );
}

async function ensureDefaultWeatherLocation() {
  const locations = await db.weatherLocations.toArray();
  if (!locations.length) {
    await db.weatherLocations.put(defaultWeatherLocation);
    return defaultWeatherLocation;
  }
  if (!locations.some((location) => location.isDefault)) {
    const first = locations[0];
    await db.weatherLocations.update(first.id, {
      isDefault: true,
      updatedAt: now(),
    });
    return { ...first, isDefault: true };
  }
  return getDefaultWeatherLocation(locations);
}

async function setDefaultWeatherLocation(locationId: string) {
  const stamp = now();
  const locations = await db.weatherLocations.toArray();
  await db.weatherLocations.bulkPut(
    locations.map((location) => ({
      ...location,
      isDefault: location.id === locationId,
      updatedAt: stamp,
    })),
  );
}

async function refreshWeather(location: WeatherLocation, days = 5) {
  const forecast = await fetchWeatherForecast(location, days);
  const fetchedAt = now();
  await db.weatherCache.bulkPut(
    forecast.map((entry) => ({
      id: `${location.id}:${entry.date}`,
      locationId: location.id,
      date: entry.date,
      data: entry,
      fetchedAt,
    })),
  );
  return forecast;
}

function useData() {
  return (
    useLiveQuery(
      async () => ({
        items: await db.clothingItems.toArray(),
        wears: await db.wearLogs.toArray(),
        outfits: await db.outfits.toArray(),
        orders: await db.purchaseOrders.toArray(),
        sales: await db.saleRecords.toArray(),
        exits: await db.closetExits.toArray(),
        wishlist: await db.wishlistItems.toArray(),
        spaces: await db.spaces.toArray(),
        resaleListings: await db.resaleListings.toArray(),
        weatherLocations: await db.weatherLocations.toArray(),
        weatherCache: await db.weatherCache.toArray(),
        userRoutines: await db.userRoutines.toArray(),
        wardrobeEvents: await db.wardrobeEvents.toArray(),
        trips: await db.trips.toArray(),
        tripPackingItems: await db.tripPackingItems.toArray(),
        tripPlannedOutfits: await db.tripPlannedOutfits.toArray(),
        syncState: (await db.syncState.get("main")) || syncDefaults,
        settings: (await db.settings.get("main")) || defaults,
      }),
      [],
    ) || {
      items: [],
      wears: [],
      outfits: [],
      orders: [],
      sales: [],
      exits: [],
      wishlist: [],
      spaces: [],
      resaleListings: [],
      weatherLocations: [],
      weatherCache: [],
      userRoutines: [],
      wardrobeEvents: [],
      trips: [],
      tripPackingItems: [],
      tripPlannedOutfits: [],
      syncState: syncDefaults,
      settings: defaults,
    }
  );
}
type Data = ReturnType<typeof useData>;
type RecommendationContext = {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  moment: "Mañana" | "Tarde" | "Noche" | "Todo el día";
  kind: "routine" | "event" | "day";
  type:
    | "work"
    | "free"
    | "study"
    | "dinner"
    | "party"
    | "travel"
    | "beach"
    | "event"
    | "casual"
    | "formal"
    | "other";
  dressCode?: WardrobeEvent["dressCode"];
};
type RecommendedLook = {
  id: string;
  context: RecommendationContext;
  source: "outfit" | "composed";
  outfitId?: string;
  items: ClothingItem[];
  weather?: DailyWeatherSummary;
  reasons: string[];
  weatherLine: string;
};

function itemDescriptor(item: ClothingItem) {
  return normalizeText(
    [
      item.name,
      item.category,
      item.subcategory,
      item.brand,
      item.notes,
      ...(item.tags || []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function itemMatchesTerms(item: ClothingItem, terms: string[]) {
  const text = itemDescriptor(item);
  return terms.filter((term) => text.includes(normalizeText(term))).length;
}

function itemIsDelicate(item: ClothingItem) {
  return /delicad|seda|ante|sat(e|é)n/.test(itemDescriptor(item));
}

function itemIsClosedShoe(item: ClothingItem) {
  return /bota|zapato|zapatilla|mocasin|loafer|botin|sneaker/.test(
    itemDescriptor(item),
  );
}

function itemIsOpenShoe(item: ClothingItem) {
  return /sandalia|pala|destalonad|chancla|alpargata/.test(itemDescriptor(item));
}

function preferredContextTerms(
  context: RecommendationContext,
  settings: Settings,
) {
  const work = [...(settings.preferredWorkTags || [])];
  const weekend = [...(settings.preferredWeekendTags || [])];
  const night = [...(settings.preferredNightTags || [])];
  const events = [...(settings.preferredEventTags || [])];
  switch (context.type) {
    case "work":
      return [...work, "trabajo", "oficina", "cómodo", "arreglado", "básico"];
    case "dinner":
      return [...night, ...events, "arreglado", "favorito", "cómodo", "noche"];
    case "party":
      return [...night, ...events, "fiesta", "noche", "especial"];
    case "travel":
      return ["cómodo", "viaje", "fácil", ...weekend];
    case "beach":
      return ["playa", "verano", "ligero", "cómodo"];
    case "formal":
      return [...events, "formal", "arreglado", "especial"];
    case "event":
      return [...events, "evento", "arreglado", "especial"];
    case "study":
      return ["cómodo", "básico", "estudio"];
    case "free":
    case "casual":
      return [...weekend, "cómodo", "casual", "básico"];
    default:
      return ["cómodo", "básico"];
  }
}

function seasonMatchesWeather(item: ClothingItem, weather?: DailyWeatherSummary) {
  if (!weather) return true;
  const seasons = item.season || [];
  if (seasons.includes("Todo el año")) return true;
  if (weather.temperatureMax > 23) return seasons.includes("Verano");
  if (weather.temperatureMax >= 17) {
    return (
      seasons.includes("Primavera") ||
      seasons.includes("Entretiempo") ||
      seasons.includes("Otoño")
    );
  }
  if (weather.temperatureMax >= 10) {
    return seasons.includes("Otoño") || seasons.includes("Entretiempo");
  }
  return seasons.includes("Invierno") || seasons.includes("Otoño");
}

function scoreItemForContext(
  item: ClothingItem,
  zone: OutfitZone,
  context: RecommendationContext,
  weather: ReturnType<typeof buildWeatherContext>,
  data: Data,
  weatherDay?: DailyWeatherSummary,
) {
  if (item.isArchived) return -999;
  if (outfitZone(item) !== zone) return -999;
  let score = 20;
  score += itemMatchesTerms(item, preferredContextTerms(context, data.settings)) * 3;
  score += seasonMatchesWeather(item, weatherDay) ? 3 : -1;
  if (item.currentLoveLevel) score += item.currentLoveLevel;
  if (item.currentFitLevel) score += item.currentFitLevel;
  if (item.currentStyleMatch) score += item.currentStyleMatch;
  if (item.comfortLevel) score += item.comfortLevel;
  if (item.decisionStatus === "keep") score += 3;
  if (item.decisionStatus === "maybe") score -= 2;
  if (item.decisionStatus === "sell" || item.decisionStatus === "donate") score -= 4;
  if (recentUsesForItem(item.id, data.wears, 30)) score += 1;
  if (item.tags?.some((tag) => normalizeText(tag).includes("encanta"))) score += 2;
  if (zone === "shoes") {
    if (weather.needsClosedShoes && itemIsClosedShoe(item)) score += 6;
    if (weather.needsClosedShoes && itemIsOpenShoe(item)) score -= 6;
    if (!weather.needsClosedShoes && itemIsOpenShoe(item)) score += 2;
  }
  if (zone === "top") {
    if (weather.needsJacket && /chaqueta|abrigo|jersey|sudadera/.test(itemDescriptor(item)))
      score += 4;
    if (weather.isHot && /abrigo|jersey grueso/.test(itemDescriptor(item))) score -= 5;
  }
  if (weather.isRainy && itemIsDelicate(item)) score -= 4;
  return score;
}

function contextsForDate(date: string, data: Data) {
  const sameDayEvents = data.wardrobeEvents
    .filter((event) => event.date === date)
    .sort(
      (a, b) =>
        (a.startTime || "12:00").localeCompare(b.startTime || "12:00") ||
        a.title.localeCompare(b.title),
    );
  const routine = data.userRoutines.find(
    (entry) => entry.dayOfWeek === dateDayOfWeek(date),
  );
  const contexts: RecommendationContext[] = [];
  const hasWorkEvent = sameDayEvents.some((event) => event.type === "work");
  if (routine && !(routine.type === "work" && hasWorkEvent)) {
    contexts.push({
      id: `${date}:routine:${routine.id}`,
      date,
      title: routineTypes[routine.type],
      subtitle: routineSummary(routine),
      moment:
        routine.startTime && Number(routine.startTime.slice(0, 2)) >= 17
          ? "Tarde"
          : "Mañana",
      kind: "routine",
      type:
        routine.type === "free"
          ? isWeekend(date)
            ? "free"
            : "casual"
          : routine.type,
    });
  }
  sameDayEvents.forEach((event) =>
    contexts.push({
      id: `${date}:event:${event.id}`,
      date,
      title: event.title,
      subtitle: eventSummary(event),
      moment: eventMoment(event.startTime),
      kind: "event",
      type: event.type,
      dressCode: event.dressCode,
    }),
  );
  if (!contexts.length) {
    contexts.push({
      id: `${date}:day`,
      date,
      title: isWeekend(date) ? "Día libre" : "Día de diario",
      subtitle: isWeekend(date) ? "Sin evento guardado" : "Rutina suave sin evento",
      moment: "Todo el día",
      kind: "day",
      type: isWeekend(date) ? "free" : "casual",
    });
  }
  return contexts.slice(0, 3);
}

function buildRecommendation(
  data: Data,
  context: RecommendationContext,
  weather?: DailyWeatherSummary,
  variant = 0,
) {
  const weatherContext = buildWeatherContext(weather, {
    night: context.moment === "Noche",
  });
  const activeItems = data.items.filter((item) => !item.isArchived);
  const zoneOrder: OutfitZone[] = ["top", "middle", "shoes"];
  const items = zoneOrder
    .map((zone, index) => {
      const ranked = activeItems
        .filter((item) => outfitZone(item) === zone)
        .sort(
          (a, b) =>
            scoreItemForContext(b, zone, context, weatherContext, data, weather) -
            scoreItemForContext(a, zone, context, weatherContext, data, weather),
        );
      if (!ranked.length) return undefined;
      return ranked[(variant + index) % ranked.length];
    })
    .filter(Boolean) as ClothingItem[];
  const outfitCandidates = data.outfits
    .map((outfit) => {
      const outfitItems = outfit.clothingItemIds
        .map((id) => activeItems.find((item) => item.id === id))
        .filter(Boolean) as ClothingItem[];
      const score =
        outfitItems.reduce((sum, item) => {
          const zone = outfitZone(item);
          return sum + (zone ? scoreItemForContext(item, zone, context, weatherContext, data, weather) : 0);
        }, 0) +
        (outfit.favorite ? 8 : 0) +
        (outfit.occasion &&
        normalizeText(outfit.occasion).includes(normalizeText(context.title))
          ? 4
          : 0);
      return { outfit, items: outfitItems, score };
    })
    .filter((entry) => entry.items.length >= 2)
    .sort((a, b) => b.score - a.score);
  const chosenOutfit =
    outfitCandidates.length && outfitCandidates[0].score >= items.length * 20
      ? outfitCandidates[variant % outfitCandidates.length]
      : undefined;
  const chosenItems = chosenOutfit?.items.length ? chosenOutfit.items : items;
  if (!chosenItems.length) return;
  const reasons = [
    `${context.title}: priorizo ${preferredContextTerms(context, data.settings)
      .slice(0, 3)
      .join(", ")}.`,
    weatherContext.notes.length
      ? weatherContext.notes.slice(0, 2).join(". ") + "."
      : "Sin clima suficiente, me apoyo más en tu armario y el contexto.",
    chosenOutfit?.outfit.favorite
      ? "Además encaja un outfit favorito que ya te funciona."
      : "Compongo el look con prendas disponibles y fáciles de combinar.",
  ];
  return {
    id: context.id,
    context,
    source: chosenOutfit ? "outfit" : "composed",
    outfitId: chosenOutfit?.outfit.id,
    items: chosenItems,
    reasons,
    weather,
    weatherLine: weather
      ? `${weather.description} · ${Math.round(weather.temperatureMin)}–${Math.round(weather.temperatureMax)}°C · lluvia ${Math.round(weather.precipitationProbabilityMax)}%`
      : "Sin clima descargado todavía",
  } as RecommendedLook;
}

function recommendationOverview(data: Data) {
  const location = getDefaultWeatherLocation(data.weatherLocations);
  const forecast = cachedForecast(data.weatherCache, location.id, 1)[0];
  const context = contextsForDate(today(), data)[0];
  return {
    location,
    forecast,
    recommendation: context ? buildRecommendation(data, context, forecast) : undefined,
    upcomingEvents: data.wardrobeEvents
      .filter((event) => event.date >= today())
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.startTime || "12:00").localeCompare(b.startTime || "12:00"),
      )
      .slice(0, 3),
  };
}

const tripTypes: Record<Trip["type"], string> = {
  vacation: "Vacaciones",
  work: "Trabajo",
  festival: "Festival",
  wedding: "Boda",
  beach: "Playa",
  city: "Ciudad",
  other: "Otro",
};

const packingTemplates = [
  "cargador",
  "neceser",
  "documentación",
  "pijama",
  "ropa interior",
  "maquillaje",
  "medicación",
  "gafas",
  "bañador",
] as const;

function tripWeatherKey(tripId: string) {
  return `trip:${tripId}`;
}

function tripDates(trip: Pick<Trip, "startDate" | "endDate">) {
  const start = new Date(`${trip.startDate}T12:00:00`);
  const end = new Date(`${trip.endDate}T12:00:00`);
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function tripLength(trip: Pick<Trip, "startDate" | "endDate">) {
  return tripDates(trip).length;
}

function tripForecast(cache: WeatherCache[], tripId: string) {
  return cache
    .filter((entry) => entry.locationId === tripWeatherKey(tripId))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => entry.data as DailyWeatherSummary);
}

async function refreshTripWeather(trip: Trip, days = 7) {
  if (trip.latitude == null || trip.longitude == null) return [];
  const forecast = await fetchWeatherForecast(
    { latitude: trip.latitude, longitude: trip.longitude },
    Math.min(days, 16),
  );
  const fetchedAt = now();
  await db.weatherCache.bulkPut(
    forecast.map((entry) => ({
      id: `${tripWeatherKey(trip.id)}:${entry.date}`,
      locationId: tripWeatherKey(trip.id),
      date: entry.date,
      data: entry,
      fetchedAt,
    })),
  );
  return forecast;
}

function tripStats(data: Data, trip: Trip) {
  const packing = data.tripPackingItems.filter((item) => item.tripId === trip.id);
  const planned = data.tripPlannedOutfits.filter((item) => item.tripId === trip.id);
  const dates = tripDates(trip);
  const totalItems = packing.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const completed = packing.filter((item) => item.checked).reduce((sum, item) => sum + (item.quantity || 1), 0);
  const pending = totalItems - completed;
  const coveredDates = new Set(planned.map((item) => item.date).filter(Boolean));
  const daysWithoutOutfit = dates.filter((date) => !coveredDates.has(date)).length;
  return {
    totalItems,
    completed,
    pending,
    outfitsPlanned: planned.length,
    daysWithoutOutfit,
    dates,
    packing,
    planned,
  };
}

function tripPackingLabel(item: TripPackingItem, items: ClothingItem[]) {
  const clothing = item.clothingItemId
    ? items.find((entry) => entry.id === item.clothingItemId)
    : undefined;
  return clothing?.name || item.customName || "Elemento";
}

function tripPackingMeta(item: TripPackingItem, items: ClothingItem[]) {
  const clothing = item.clothingItemId
    ? items.find((entry) => entry.id === item.clothingItemId)
    : undefined;
  return clothing?.category || item.category || "Checklist";
}

function tripRecommendationText(
  trip: Trip,
  forecast: DailyWeatherSummary[],
  planned: TripPlannedOutfit[],
) {
  const days = tripLength(trip);
  const avgMax = forecast.length
    ? Math.round(
        forecast.reduce((sum, day) => sum + day.temperatureMax, 0) / forecast.length,
      )
    : undefined;
  const rainy = forecast.some((day) => day.precipitationProbabilityMax >= 40);
  const windy = forecast.some((day) => day.windSpeedMax >= 26);
  const lines = [
    `Vas ${days} ${days === 1 ? "día" : "días"} a ${trip.destinationName}.`,
  ];
  if (avgMax != null) {
    lines.push(
      avgMax > 23
        ? "Parece un destino cálido: prioriza ropa ligera, calzado cómodo y una capa fina para la noche."
        : avgMax >= 17
          ? "Suena a entretiempo amable: mezcla looks ligeros con una capa versátil."
          : "Parece fresco: mejor chaqueta, zapato cerrado y prendas fáciles de repetir.",
    );
  }
  if (rainy) lines.push("Hay riesgo de lluvia: mete paraguas o capa ligera y evita depender solo de calzado abierto.");
  if (windy) lines.push("Puede hacer viento: una capa exterior compacta te dará margen.");
  if (trip.type === "beach") lines.push("Añade bañador, gafas de sol y ropa fresca de recambio.");
  if (trip.type === "work") lines.push("Reserva looks de trabajo cómodos y algo más arreglado para reuniones o cenas.");
  if (trip.type === "festival") lines.push("Piensa en calzado resistente, capas ligeras y una prenda fácil de repetir.");
  if (trip.type === "wedding") lines.push("No olvides el look principal y una opción de apoyo por si cambia el clima.");
  if (trip.type === "city") lines.push("Te irá bien calzado cómodo, bolso práctico y capas que combinen entre sí.");
  if (!planned.length) lines.push("Empieza planificando al menos los días más importantes para evitar olvidos de última hora.");
  return lines.slice(0, 4);
}

function tripUsageInsights(data: Data, trip: Trip) {
  const planned = data.tripPlannedOutfits.filter((entry) => entry.tripId === trip.id);
  const packedClothing = data.tripPackingItems
    .filter((entry) => entry.tripId === trip.id && entry.clothingItemId)
    .map((entry) => entry.clothingItemId as string);
  const counts = new Map<string, number>();
  planned.forEach((outfit) =>
    outfit.clothingItemIds.forEach((id) =>
      counts.set(id, (counts.get(id) || 0) + 1),
    ),
  );
  const repeated = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({
      item: data.items.find((entry) => entry.id === id),
      count,
    }))
    .filter((entry) => entry.item);
  const unusedPacked = packedClothing
    .filter((id) => !counts.has(id))
    .map((id) => data.items.find((entry) => entry.id === id))
    .filter(Boolean) as ClothingItem[];
  return {
    repeated,
    unusedPacked,
  };
}

function nearestTrip(trips: Trip[]) {
  return trips
    .filter((trip) => trip.endDate >= today())
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
}

function Button({
  children,
  variant = "primary",
  className = "",
  ...p
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`btn ${variant} ${className}`} {...p}>
      {children}
    </button>
  );
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`modal ${wide ? "wide" : ""}`}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Sparkles />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function PageHead({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string | number;
  note?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-icon">{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
function App() {
  useSyncController();
  useEffect(() => {
    ensureDefaultWeatherLocation().catch(() => undefined);
  }, []);
  return (
    <div className="shell">
      <Sidebar />
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/armario" element={<Wardrobe />} />
          <Route path="/prenda/nueva" element={<ItemForm />} />
          <Route path="/prenda/:id" element={<ItemDetail />} />
          <Route path="/prenda/:id/editar" element={<ItemForm />} />
          <Route path="/que-ponerme" element={<WhatToWearPage />} />
          <Route path="/viajes" element={<TripsPage />} />
          <Route path="/viajes/:id" element={<TripDetail />} />
          <Route path="/outfits" element={<Outfits />} />
          <Route path="/outfits/crear" element={<OutfitBuilder />} />
          <Route path="/usos" element={<WearHistory />} />
          <Route path="/pedidos" element={<OrderItems />} />
          <Route path="/espacios" element={<SpacesPage />} />
          <Route path="/espacios/:id" element={<SpaceDetail />} />
          <Route path="/plan-venta" element={<ResalePlan />} />
          <Route path="/revision" element={<SmartReviewPage />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/salidas" element={<ExitManager />} />
          <Route path="/decisiones" element={<Decisions />} />
          <Route path="/balance" element={<Balance />} />
          <Route path="/estadisticas" element={<Stats />} />
          <Route path="/ajustes" element={<SettingsPage />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
const nav = [
  ["/", Home, "Inicio"],
  ["/armario", Shirt, "Armario"],
  ["/outfits", Heart, "Outfits"],
  ["/que-ponerme", Cloud, "Qué ponerme"],
  ["/espacios", MapPin, "Espacios"],
  ["/plan-venta", Store, "Plan de venta"],
  ["/balance", WalletCards, "Balance"],
  ["/viajes", Luggage, "Viajes"],
  ["/revision", Brain, "Revisión"],
  ["/estadisticas", BarChart3, "Estadísticas"],
  ["/ajustes", SettingsIcon, "Ajustes"],
  ["/usos", CalendarDays, "Usos"],
  ["/pedidos", PackagePlus, "Pedidos"],
  ["/decisiones", Archive, "Decidir"],
] as const;
const navGroups = [
  {
    title: "Uso diario",
    items: nav.filter(([to]) =>
      ["/", "/armario", "/outfits", "/que-ponerme"].includes(to),
    ),
  },
  {
    title: "Gestión",
    items: nav.filter(([to]) =>
      ["/espacios", "/plan-venta", "/balance", "/viajes"].includes(to),
    ),
  },
  {
    title: "Análisis",
    items: nav.filter(([to]) => ["/revision", "/estadisticas"].includes(to)),
  },
  {
    title: "Configuración",
    items: nav.filter(([to]) =>
      ["/ajustes", "/usos", "/pedidos", "/decisiones"].includes(to),
    ),
  },
];
function Sidebar() {
  const sync = useSyncSummary();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span>
          <Shirt />
        </span>
        <div>
          Mi Vestidor<small>Tu armario, en orden</small>
        </div>
      </div>
      <nav>
        {navGroups.map((group) => (
          <div className="nav-group" key={group.title}>
            <p>{group.title}</p>
            {group.items.map(([to, I, label]) => (
              <NavLink key={to} to={to} end={to === "/"}>
                <I />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <p className="local-note">
        {sync.syncEnabled && sync.user
          ? sync.online
            ? "Sincronización opcional activa."
            : "Modo offline. Sincronizará al volver."
          : "Todo se guarda en este dispositivo."}
      </p>
    </aside>
  );
}
function BottomNav() {
  const mobile = [nav[0], nav[1], nav[2], nav[3]];
  return (
    <nav className="bottom-nav">
      {mobile.map(([to, I, label]) => (
        <NavLink key={to} to={to} end={to === "/"}>
          <I />
          <span>{to === "/que-ponerme" ? "Hoy" : label}</span>
        </NavLink>
      ))}
      <NavLink to="/ajustes">
        <Menu />
        <span>Más</span>
      </NavLink>
    </nav>
  );
}

function Dashboard() {
  const d = useData(),
    n = useNavigate();
  const contextOverview = recommendationOverview(d);
  const upcomingTrip = nearestTrip(d.trips);
  useEffect(() => {
    if (
      contextOverview.location?.id &&
      weatherNeedsRefresh(d.weatherCache, contextOverview.location.id, 4)
    ) {
      refreshWeather(contextOverview.location, 5).catch(() => undefined);
    }
  }, [d.weatherCache, contextOverview.location]);
  const m = currentMonth();
  const spent = d.orders
      .filter((o) => month(o.date) === m)
      .reduce((s, o) => s + o.totalCost, 0),
    earned = d.sales
      .filter((s) => month(s.date) === m)
      .reduce((a, s) => a + (s.netProfit ?? s.salePrice - (s.fees || 0)), 0),
    ins = d.orders
      .filter((o) => month(o.date) === m)
      .reduce((a, o) => a + o.clothingItemIds.length, 0),
    outs = d.exits.filter((x) => month(x.date) === m).length;
  const counts = Object.fromEntries(
    Object.keys(decisions).map((k) => [
      k,
      d.items.filter((i) => i.decisionStatus === k).length,
    ]),
  );
  const wearCount = (id: string) =>
    d.wears.filter((w) => w.clothingItemIds.includes(id)).length;
  const activeItems = d.items.filter((i) => !i.isArchived);
  const smart = buildSmartInsights(d);
  const reviewCount = smart.insights
    .filter((insight) => ["sell", "donate", "forgotten", "duplicate"].includes(insight.kind))
    .reduce((sum, insight) => sum + (insight.itemIds?.length || 0), 0);
  const wishlistNotice = d.wishlist
    .filter((w) => w.status === "pending")
    .map((wish) => wishlistAdviceText(wish, d))
    .filter((entry) => entry.advice !== "buy").length;
  const resalePlan = d.resaleListings,
    pendingPhotos = resalePlan.filter((x) => x.status === "to_photo").length,
    readyDrafts = resalePlan.filter(
      (x) => x.status === "photos_done" || x.status === "draft",
    ).length,
    staleListings = resalePlan.filter(
      (x) => x.status === "listed" && resaleAge(x) >= 30,
    ),
    topResaleTip = staleListings.length
      ? "Tienes prendas subidas hace tiempo: toca revisar precio o fotos."
      : pendingPhotos
        ? "Empieza por fotografiar lo que ya decidiste vender."
        : readyDrafts
          ? "Tienes borradores casi listos para subir progresivamente."
          : "Tu plan de venta está al día.";
  const locatedCount = activeItems.filter((item) => item.spaceId).length,
    unlocatedCount = activeItems.length - locatedCount,
    locationRate = activeItems.length
      ? Math.round((locatedCount / activeItems.length) * 100)
      : 0;
  const mainSpaces = childSpaces(undefined, d.spaces).slice(0, 3);
  const forgotten = activeItems.filter((i) => {
    const last = d.wears
      .filter((w) => w.clothingItemIds.includes(i.id))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return !last || Date.now() - new Date(last.date).getTime() > 90 * 86400000;
  }).length;
  const top = [...activeItems]
    .sort((a, b) => wearCount(b.id) - wearCount(a.id))
    .slice(0, 3);
  const latest = [...activeItems]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);
  const upcomingTripStats = upcomingTrip ? tripStats(d, upcomingTrip) : undefined;
  const upcomingTripForecast = upcomingTrip
    ? tripForecast(d.weatherCache, upcomingTrip.id)[0]
    : undefined;
  const dailyNotice = unlocatedCount
    ? {
        title: `${unlocatedCount} prendas sin ubicación`,
        text: "Puedes asignarlas cuando tengas un minuto.",
        to: "/espacios",
        action: "Ver prendas sin ubicar",
      }
    : readyDrafts
      ? {
          title: `${readyDrafts} borradores de venta listos`,
          text: "Buen momento para preparar una subida tranquila.",
          to: "/plan-venta",
          action: "Preparar venta",
        }
      : upcomingTrip && upcomingTripStats
        ? {
            title: `Viaje próximo: ${upcomingTrip.name}`,
            text: `${upcomingTripStats.pending} cosas pendientes en la maleta.`,
            to: `/viajes/${upcomingTrip.id}`,
            action: "Abrir viaje",
          }
        : reviewCount
          ? {
              title: `${reviewCount} prendas para revisar`,
              text: "La revisión inteligente tiene sugerencias suaves.",
              to: "/revision",
              action: "Revisar más tarde",
            }
          : {
              title: "Todo bastante en orden",
              text: "Añade una prenda, registra un uso o crea un outfit.",
              to: "/armario",
              action: "Abrir armario",
            };
  if (!d.items.length && !d.orders.length && !d.sales.length && !d.wishlist.length)
    return <Welcome onAdd={() => n("/prenda/nueva")} />;
  const TodayWeatherIcon = weatherVisual(contextOverview.forecast).Icon;
  return (
    <>
      <PageHead eyebrow="HOY" title="Tu armario, hoy">
        <Button onClick={() => n("/prenda/nueva")}>
          <Plus /> Añadir prenda
        </Button>
      </PageHead>
      <section className="hero">
        <div>
          <p className="eyebrow">RECOMENDACIÓN DE HOY</p>
          <h2>
            {contextOverview.recommendation?.context.title ||
              "Elige algo cómodo y fácil de repetir"}
          </h2>
          <p>
            {contextOverview.forecast
              ? `${contextOverview.location.name} · ${Math.round(contextOverview.forecast.temperatureMin)}–${Math.round(contextOverview.forecast.temperatureMax)}°C · ${contextOverview.forecast.description}`
              : contextOverview.recommendation?.reasons[0] ||
                "Añade rutinas o eventos para afinar la recomendación."}
          </p>
        </div>
        <div className="balance-number weather-badge">
          <TodayWeatherIcon />
          <span>Balance del mes</span>
          <b>{ins} entradas · {outs} salidas</b>
        </div>
      </section>
      <div className="quick-links">
        <NavLink to="/prenda/nueva">
          <Plus />
          <span>
            <b>Añadir prenda</b>
            <small>Foto y datos básicos</small>
          </span>
        </NavLink>
        <NavLink to="/usos">
          <CalendarDays />
          <span>
            <b>Registrar uso</b>
            <small>Lo que llevas hoy</small>
          </span>
        </NavLink>
        <NavLink to="/outfits/crear">
          <Heart />
          <span>
            <b>Crear outfit</b>
            <small>Componer un look</small>
          </span>
        </NavLink>
        <NavLink to="/armario">
          <Search />
          <span>
            <b>Buscar prenda</b>
            <small>Ir al armario</small>
          </span>
        </NavLink>
      </div>
      <section className="panel daily-notice">
        <div>
          <p className="eyebrow">AVISO ÚTIL</p>
          <h2>{dailyNotice.title}</h2>
          <p>{dailyNotice.text}</p>
        </div>
        <NavLink to={dailyNotice.to}>{dailyNotice.action}</NavLink>
      </section>
      <details className="daily-more">
        <summary>Más módulos y resumen avanzado</summary>
        <div className="daily-more-content">
      <section className="panel location-summary">
        <div className="section-title">
          <div>
            <p className="eyebrow">QUÉ PONERME</p>
            <h2>Clima, agenda y outfits listos para hoy</h2>
          </div>
          <NavLink to="/que-ponerme">Abrir módulo</NavLink>
        </div>
        <div className="location-summary-grid">
          <div>
            {contextOverview.forecast && (() => {
              const visual = weatherVisual(contextOverview.forecast);
              const Icon = visual.Icon;
              return <Icon className="weather-inline-icon" />;
            })()}
            <b>
              {contextOverview.forecast
                ? `${Math.round(contextOverview.forecast.temperatureMin)}–${Math.round(contextOverview.forecast.temperatureMax)}°C`
                : "Clima pendiente"}
            </b>
            <small>
              {contextOverview.forecast
                ? `${contextOverview.location.name} · ${contextOverview.forecast.description}`
                : `Descarga el clima de ${contextOverview.location.name} para afinar recomendaciones`}
            </small>
          </div>
          <div>
            <b>{contextOverview.recommendation?.context.title || "Sin recomendación aún"}</b>
            <small>
              {contextOverview.upcomingEvents.length
                ? `${contextOverview.upcomingEvents.length} eventos próximos · ${contextOverview.upcomingEvents[0].title}`
                : contextOverview.recommendation?.reasons[0] || "Añade rutinas o eventos para contextualizar mejor"}
            </small>
          </div>
        </div>
      </section>
      {upcomingTrip && upcomingTripStats && (
        <section className="panel location-summary">
          <div className="section-title">
            <div>
              <p className="eyebrow">VIAJE PRÓXIMO</p>
              <h2>{upcomingTrip.name}</h2>
            </div>
            <NavLink to={`/viajes/${upcomingTrip.id}`}>Abrir viaje</NavLink>
          </div>
          <div className="location-summary-grid">
            <div>
              <b>{upcomingTrip.destinationName}</b>
              <small>
                {dateFmt(upcomingTrip.startDate)} → {dateFmt(upcomingTrip.endDate)}
                {upcomingTripForecast
                  ? ` · ${upcomingTripForecast.description} ${Math.round(upcomingTripForecast.temperatureMin)}–${Math.round(upcomingTripForecast.temperatureMax)}°C`
                  : ""}
              </small>
            </div>
            <div>
              <b>{upcomingTripStats.pending} pendientes</b>
              <small>
                {upcomingTripStats.completed} listos · {upcomingTripStats.daysWithoutOutfit} días sin outfit
              </small>
            </div>
          </div>
        </section>
      )}
      <section className="panel location-summary">
        <div className="section-title">
          <div>
            <p className="eyebrow">REVISIÓN INTELIGENTE</p>
            <h2>Ayuda local para decidir qué se queda y qué sale</h2>
          </div>
          <NavLink to="/revision">Abrir revisión</NavLink>
        </div>
        <div className="location-summary-grid">
          <div>
            <b>{smart.insights[0]?.title || "Sin alertas fuertes"}</b>
            <small>{smart.insights[0]?.explanation || "Cuando haya más señales útiles aparecerán aquí."}</small>
          </div>
          <div>
            <b>{reviewCount} prendas para revisar</b>
            <small>
              {wishlistNotice
                ? `${wishlistNotice} avisos en wishlist para comprar con más criterio`
                : "Tu wishlist no tiene avisos importantes ahora mismo"}
            </small>
          </div>
        </div>
      </section>
      <section className="panel location-summary">
        <div className="section-title">
          <div>
            <p className="eyebrow">MIS ESPACIOS</p>
            <h2>Mapa bonito y útil de tu armario</h2>
          </div>
          <NavLink to="/espacios">Abrir Mis espacios</NavLink>
        </div>
        <div className="location-summary-grid">
          <div>
            <b>{locationRate}% ubicadas</b>
            <small>
              {locatedCount} prendas con ubicación · {unlocatedCount} sin asignar
            </small>
          </div>
          <div>
            <b>{d.spaces.length} espacios</b>
            <small>
              {mainSpaces.length
                ? mainSpaces.map((space) => space.name).join(" · ")
                : "Empieza creando tu primera casa o armario"}
            </small>
          </div>
        </div>
      </section>
      <section className="panel location-summary">
        <div className="section-title">
          <div>
            <p className="eyebrow">PLAN DE VENTA</p>
            <h2>Vinted inteligente, sin salir de tu armario</h2>
          </div>
          <NavLink to="/plan-venta">Abrir plan</NavLink>
        </div>
        <div className="location-summary-grid">
          <div>
            <b>{pendingPhotos} pendientes de foto</b>
            <small>{readyDrafts} borradores listos o casi listos</small>
          </div>
          <div>
            <b>{staleListings.length} subidas hace mucho</b>
            <small>{topResaleTip}</small>
          </div>
        </div>
      </section>
      <div className="two-col">
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">RECIÉN LLEGADAS</p>
              <h2>Últimas añadidas</h2>
            </div>
            <NavLink to="/armario">Ver armario</NavLink>
          </div>
          <div className="latest-strip">
            {latest.map((i) => (
              <NavLink to={`/prenda/${i.id}`} key={i.id}>
                <ItemThumb item={i} />
                <span>{i.name}</span>
              </NavLink>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">EN ROTACIÓN</p>
              <h2>Más usadas</h2>
            </div>
          </div>
          {top.some((i) => wearCount(i.id) > 0) ? (
            <div className="mini-items">
              {top
                .filter((i) => wearCount(i.id) > 0)
                .map((i) => (
                  <NavLink to={`/prenda/${i.id}`} key={i.id}>
                    <ItemThumb item={i} />
                    <span>
                      {i.name}
                      <small>{wearCount(i.id)} usos</small>
                    </span>
                  </NavLink>
                ))}
            </div>
          ) : (
            <div className="inline-empty">
              <Sparkles />
              <span>
                <b>Aún sin favoritas</b>
                <small>Registra usos y aparecerán aquí.</small>
              </span>
            </div>
          )}
        </section>
      </div>
        </div>
      </details>
    </>
  );
}
function Welcome({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="welcome">
      <div className="welcome-copy">
        <p className="eyebrow">MI VESTIDOR</p>
        <h1>Tu armario empieza aquí.</h1>
        <p>
          Reúne lo que tienes, descubre nuevas combinaciones y compra con un
          poco más de perspectiva.
        </p>
        <Button onClick={onAdd}>
          <Plus /> Añadir primera prenda
        </Button>
      </div>
      <div className="welcome-steps">
        <div>
          <span>01</span>
          <Shirt />
          <b>Registra tus prendas</b>
          <p>Todo tu armario, visual y ordenado.</p>
        </div>
        <div>
          <span>02</span>
          <Heart />
          <b>Crea outfits</b>
          <p>Combina mejor lo que ya tienes.</p>
        </div>
        <div>
          <span>03</span>
          <WalletCards />
          <b>Mide entradas y salidas</b>
          <p>Una mirada amable a tu consumo.</p>
        </div>
      </div>
    </div>
  );
}

function ItemThumb({ item }: { item: ClothingItem }) {
  return item.image ? (
    <img src={item.image} alt="" />
  ) : (
    <div className="placeholder">
      <Shirt />
    </div>
  );
}
function Wardrobe() {
  const d = useData(),
    n = useNavigate();
  const [q, setQ] = useState(""),
    [cat, setCat] = useState(""),
    [dec, setDec] = useState(""),
    [spaceFilter, setSpaceFilter] = useState(""),
    [tag, setTag] = useState(""),
    [sort, setSort] = useState("new"),
    [archived, setArchived] = useState(false);
  const uses = (id: string) =>
    d.wears.filter((w) => w.clothingItemIds.includes(id)).length;
  const tags = [...new Set(d.items.flatMap((i) => i.tags || []))];
  const list = useMemo(
    () =>
      d.items
        .filter(
          (i) =>
            !!i.isArchived === archived &&
            (!q ||
              [i.name, i.brand, i.store, i.notes, ...(i.tags || [])]
                .join(" ")
                .toLowerCase()
                .includes(q.toLowerCase())) &&
            (!cat || i.category === cat) &&
            (!dec || i.decisionStatus === dec) &&
            (!spaceFilter
              ? true
              : spaceFilter === "__none"
                ? !i.spaceId
                : !!i.spaceId &&
                  descendantSpaceIds(spaceFilter, d.spaces).has(i.spaceId)) &&
            (!tag || i.tags?.includes(tag)),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : sort === "most"
              ? uses(b.id) - uses(a.id)
              : sort === "least"
                ? uses(a.id) - uses(b.id)
                : b.createdAt.localeCompare(a.createdAt),
        ),
    [d.items, d.wears, d.spaces, q, cat, dec, spaceFilter, tag, sort, archived],
  );
  return (
    <>
      <PageHead
        eyebrow={`${d.items.filter((i) => !i.isArchived).length} ACTIVAS · ${d.items.filter((i) => i.isArchived).length} ARCHIVADAS`}
        title={archived ? "Archivo" : "Tu armario"}
      >
        <Button onClick={() => n("/prenda/nueva")}>
          <Plus /> Añadir prenda
        </Button>
      </PageHead>
      <div className="archive-toggle">
        <button
          className={!archived ? "active" : ""}
          onClick={() => setArchived(false)}
        >
          En mi armario
        </button>
        <button
          className={archived ? "active" : ""}
          onClick={() => setArchived(true)}
        >
          Archivadas
        </button>
      </div>
      <div className="filters">
        <label className="search">
          <Search />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar prendas o etiquetas..."
          />
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Categoría</option>
          {d.settings.categories.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select value={dec} onChange={(e) => setDec(e.target.value)}>
          <option value="">Decisión</option>
          {Object.entries(decisions).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={spaceFilter}
          onChange={(e) => setSpaceFilter(e.target.value)}
        >
          <option value="">Ubicación</option>
          <option value="__none">Sin ubicación</option>
          {sortedSpaces(d.spaces).map((space) => (
              <option key={space.id} value={space.id}>
                {spacePathText(space.id, d.spaces)}
              </option>
            ))}
        </select>
        {tags.length && (
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Etiqueta</option>
            {tags.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="new">Últimas añadidas</option>
          <option value="most">Más usadas</option>
          <option value="least">Menos usadas</option>
          <option value="name">Nombre</option>
        </select>
      </div>
      {list.length ? (
        <div className="item-grid">
          {list.map((i) => (
            <NavLink
              className={`item-card ${i.isArchived ? "archived" : ""}`}
              to={`/prenda/${i.id}`}
              key={i.id}
            >
              <div className="item-photo">
                <ItemThumb item={i} />
                <span
                  className={`badge ${i.isArchived ? "archived-badge" : statusClass[i.decisionStatus]}`}
                >
                  {!i.isArchived &&
                    (() => {
                      const Icon = decisionIcons[i.decisionStatus];
                      return <Icon />;
                    })()}
                  {i.isArchived
                    ? "Fuera del armario"
                    : decisions[i.decisionStatus]}
                </span>
              </div>
              <div>
                <h3>{i.name}</h3>
                <p>
                  {i.category} · {uses(i.id)} usos
                </p>
                <div className="card-indicators">
                  <span>
                    <MapPin /> {i.spaceId ? "Ubicada" : "Sin ubicación"}
                  </span>
                  {i.decisionStatus === "sell" && (
                    <span>
                      <Tag /> Venta
                    </span>
                  )}
                </div>
                <small className="item-location">
                  {i.spaceId
                    ? spacePathText(i.spaceId, d.spaces)
                    : "Sin ubicación asignada"}
                </small>
                {i.tags?.length ? (
                  <div className="card-tags">
                    {i.tags.slice(0, 2).map((x) => (
                      <span key={x}>{x}</span>
                    ))}
                  </div>
                ) : (
                  <div className="color-dots">
                    {i.colors.slice(0, 4).map((c) => (
                      <i
                        key={c}
                        title={c}
                        style={{ background: colorValue(c, d.settings) }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </NavLink>
          ))}
        </div>
      ) : (
        <Empty
          title={
            archived ? "No hay prendas archivadas" : "Tu armario empieza aquí"
          }
          text={
            archived
              ? "Las prendas que salgan del armario conservarán aquí su historia."
              : "Añade una prenda para empezar tu colección."
          }
          action={
            !archived && (
              <Button onClick={() => n("/prenda/nueva")}>Añadir prenda</Button>
            )
          }
        />
      )}
    </>
  );
}
function ItemForm() {
  const { id } = useParams(),
    d = useData(),
    n = useNavigate(),
    existing = d.items.find((i) => i.id === id);
  const blankItem: Partial<ClothingItem> = {
    name: "",
    category: "",
    colors: [],
    season: [],
    physicalStatus: "good",
    decisionStatus: "keep",
  };
  const [form, setForm] = useState<Partial<ClothingItem>>(
      existing || blankItem,
    ),
    [error, setError] = useState(""),
    [nameWasManuallyEdited, setNameWasManuallyEdited] = useState(!!existing?.name),
    [lastAutoName, setLastAutoName] = useState(""),
    [tagDraft, setTagDraft] = useState("");
  useEffect(() => {
    if (existing) {
      setForm({
        ...existing,
        colors: existing.colors || [],
        season: existing.season || [],
        tags: existing.tags || [],
        physicalStatus: existing.physicalStatus || "good",
        decisionStatus: existing.decisionStatus || "keep",
      });
      setNameWasManuallyEdited(!!existing.name);
      setLastAutoName("");
    } else if (!id) {
      setForm(blankItem);
      setNameWasManuallyEdited(false);
      setLastAutoName("");
    }
  }, [id, existing?.id]);
  useEffect(() => {
    const suggested = suggestedItemName(form);
    if (
      !id &&
      !nameWasManuallyEdited &&
      suggested &&
      (!form.name || form.name === lastAutoName)
    ) {
      setForm((current) => ({ ...current, name: suggested }));
      setLastAutoName(suggested);
    }
  }, [form.category, form.subcategory, form.colors, form.brand, form.store, id, nameWasManuallyEdited, form.name, lastAutoName]);
  if (id && !existing) return <p>Cargando…</p>;
  const set = (k: keyof ClothingItem, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "colors" | "season", v: string) =>
    set(
      k,
      (form[k] || []).includes(v)
        ? (form[k] || []).filter((x) => x !== v)
        : [...(form[k] || []), v],
    );
  const savedTags = [
    ...(d.settings.tags || []),
    ...(d.settings.frequentTags || []),
    ...d.items.flatMap((item) => item.tags || []),
  ].filter(Boolean);
  const uniqueTags = addManyUnique([], savedTags);
  const colorOptions = wardrobeColors(d.settings);
  function applySuggestedName() {
    const suggested = suggestedItemName(form);
    if (suggested) {
      set("name", suggested);
      setLastAutoName(suggested);
      setNameWasManuallyEdited(false);
    }
  }
  function addTag(value = tagDraft) {
    const next = addUnique(form.tags || [], value);
    set("tags", next);
    setTagDraft("");
  }
  async function persistReusableOptions(item: ClothingItem) {
    const nextSettings: Settings = {
      ...d.settings,
      subcategories: addUnique(d.settings.subcategories || [], item.subcategory),
      stores: addUnique(d.settings.stores || [], item.store),
      brands: addUnique(d.settings.brands || [], item.brand),
      tags: addManyUnique(d.settings.tags || d.settings.frequentTags || [], item.tags || []),
      frequentTags: addManyUnique(d.settings.frequentTags || [], item.tags || []),
      colors: addManyUnique(d.settings.colors || [], item.colors || []),
      seasons: addManyUnique(d.settings.seasons || [], item.season || []),
      updatedAt: now(),
    };
    await db.settings.put(nextSettings);
  }
  async function image(file?: File) {
    const compressed = await compressImage(file);
    if (compressed) {
      set("image", compressed);
      set("imageUpdatedAt", now());
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const finalName = form.name?.trim() || suggestedItemName(form);
    if (!finalName || !form.category)
      return setError("Indica un nombre y una categoría, o rellena categoría/color para generarlo.");
    if ((form.originalPrice || 0) < 0 || (form.estimatedValue || 0) < 0)
      return setError("Los precios no pueden ser negativos.");
    const stamp = now();
    const item = {
      ...existing,
      ...form,
      id: existing?.id || uid(),
      name: finalName,
      category: form.category,
      colors: form.colors || [],
      season: form.season || [],
      physicalStatus: form.physicalStatus || "good",
      decisionStatus: form.decisionStatus || "keep",
      createdAt: existing?.createdAt || stamp,
      updatedAt: stamp,
    } as ClothingItem;
    await db.clothingItems.put(item);
    await persistReusableOptions(item);
    n(`/prenda/${item.id}`);
  }
  return (
    <>
      <PageHead
        eyebrow={existing ? "EDITAR PRENDA" : "NUEVA PRENDA"}
        title={existing ? existing.name : "Añade algo a tu armario"}
      >
        <Button variant="ghost" onClick={() => n(-1)}>
          <X /> Cerrar
        </Button>
      </PageHead>
      <form className="form-page" onSubmit={submit}>
        {error && <p className="form-error">{error}</p>}
        <FormSection
          title="Foto"
          intro="La imagen hace que encontrarla sea mucho más fácil."
        >
          <label className="image-upload full">
            {form.image ? (
              <img src={form.image} />
            ) : (
              <>
                <Upload />
                <span>Seleccionar una foto</span>
              </>
            )}
            <input
              hidden
              type="file"
              accept="image/*"
              onChange={(e) => image(e.target.files?.[0])}
            />
          </label>
        </FormSection>
        <FormSection
          title="Lo esencial"
          intro="Solo lo necesario para usarla en el día a día."
        >
          <label>
            Nombre *
            <input
              value={form.name || ""}
              onChange={(e) => {
                setNameWasManuallyEdited(true);
                set("name", e.target.value);
              }}
              placeholder="Ej. Camisa de lino"
            />
            <button className="mini-action" type="button" onClick={applySuggestedName}>
              <Sparkles /> Generar nombre
            </button>
          </label>
          <label>
            Categoría *
            <select
              value={form.category || ""}
              onChange={(e) => set("category", e.target.value)}
            >
              <option value="">Selecciona una</option>
              {d.settings.categories.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <div className="full">
            <span className="field-label">Colores</span>
            <div className="chips color-picker">
              {colorOptions.map((color) => (
                <button
                  type="button"
                  className={(form.colors || []).includes(color.name) ? "selected" : ""}
                  onClick={() => toggle("colors", color.name)}
                  key={color.id}
                >
                  <i
                    className={normalizeKey(color.name) === "multicolor" ? "multi" : ""}
                    style={{ background: color.hex }}
                  />
                  {color.name}
                </button>
              ))}
            </div>
          </div>
          <div className="full">
            <span className="field-label">Temporadas</span>
            <div className="chips">
              {d.settings.seasons.map((x) => (
                <button
                  type="button"
                  className={(form.season || []).includes(x) ? "selected" : ""}
                  onClick={() => toggle("season", x)}
                  key={x}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>
          <label>
            ¿Qué quieres hacer?
            <select
              value={form.decisionStatus}
              onChange={(e) => set("decisionStatus", e.target.value)}
            >
              {Object.entries(decisions).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ubicación
            <select
              value={form.spaceId || ""}
              onChange={(e) =>
                set("spaceId", e.target.value || undefined)
              }
            >
              <option value="">Sin ubicación asignada</option>
              {sortedSpaces(d.spaces).map((space) => (
                  <option key={space.id} value={space.id}>
                    {spacePathText(space.id, d.spaces)}
                  </option>
                ))}
            </select>
          </label>
        </FormSection>
        <FormSection title="Detalles opcionales" collapsible>
          <label>
            Subcategoría
            <input
              list="saved-subcategories"
              value={form.subcategory || ""}
              onChange={(e) => set("subcategory", e.target.value)}
              placeholder="Opcional"
            />
            <datalist id="saved-subcategories">
              {(d.settings.subcategories || []).map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </label>
          <label>
            Talla
            <input
              value={form.size || ""}
              onChange={(e) => set("size", e.target.value)}
            />
          </label>
          <label className="full">
            Etiquetas
            <div className="chips tag-picker">
              {uniqueTags.slice(0, 18).map((tag) => (
                <button
                  type="button"
                  className={(form.tags || []).some((entry) => normalizeKey(entry) === normalizeKey(tag)) ? "selected" : ""}
                  onClick={() =>
                    set(
                      "tags",
                      (form.tags || []).some((entry) => normalizeKey(entry) === normalizeKey(tag))
                        ? (form.tags || []).filter((entry) => normalizeKey(entry) !== normalizeKey(tag))
                        : addUnique(form.tags || [], tag),
                    )
                  }
                  key={tag}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="inline-input compact">
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Añadir etiqueta nueva"
              />
              <Button type="button" variant="secondary" onClick={() => addTag()}>
                Añadir
              </Button>
            </div>
          </label>
          <label>
            Marca
            <input
              list="saved-brands"
              value={form.brand || ""}
              onChange={(e) => set("brand", e.target.value)}
            />
            <datalist id="saved-brands">
              {(d.settings.brands || []).map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </label>
          <label>
            Tienda
            <input
              list="saved-stores"
              value={form.store || ""}
              onChange={(e) => set("store", e.target.value)}
            />
            <datalist id="saved-stores">
              {(d.settings.stores || []).map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </label>
          <label>
            Precio original (€)
            <input
              type="number"
              min="0"
              step=".01"
              value={form.originalPrice ?? ""}
              onChange={(e) =>
                set(
                  "originalPrice",
                  e.target.value ? +e.target.value : undefined,
                )
              }
            />
          </label>
          <label>
            Valor estimado (€)
            <input
              type="number"
              min="0"
              step=".01"
              value={form.estimatedValue ?? ""}
              onChange={(e) =>
                set(
                  "estimatedValue",
                  e.target.value ? +e.target.value : undefined,
                )
              }
            />
          </label>
          <label>
            Fecha de compra
            <input
              type="date"
              value={form.purchaseDate || ""}
              onChange={(e) => set("purchaseDate", e.target.value)}
            />
          </label>
          <label>
            Estado físico
            <select
              value={form.physicalStatus}
              onChange={(e) => set("physicalStatus", e.target.value)}
            >
              {Object.entries(physical).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            Algo que quieras recordar
            <textarea
              value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Cómo combinarla, arreglos pendientes..."
            />
          </label>
        </FormSection>
        <FormSection title="Datos avanzados" intro="Para revisión inteligente, venta y decisiones futuras." collapsible>
          {form.decisionStatus === "sell" && (
            <label>
              Estado en Vinted
              <select
                value={form.vintedStatus || "not_listed"}
                onChange={(e) => set("vintedStatus", e.target.value)}
              >
                <option value="not_listed">No subida</option>
                <option value="listed">Subida</option>
                <option value="sold">Vendida</option>
              </select>
            </label>
          )}
          <label>
            Año aproximado de compra
            <input
              type="number"
              min="1990"
              max={new Date().getFullYear()}
              value={form.approximatePurchaseYear ?? ""}
              onChange={(e) =>
                set(
                  "approximatePurchaseYear",
                  e.target.value ? +e.target.value : undefined,
                )
              }
            />
          </label>
          <label>
            Antigüedad aproximada
            <select
              value={form.approximateAgeRange || "unknown"}
              onChange={(e) =>
                set("approximateAgeRange", e.target.value as ApproximateAgeRange)
              }
            >
              {Object.entries(ageRanges).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            ¿La usabas antes?
            <select
              value={form.estimatedPastUse || "unknown"}
              onChange={(e) =>
                set("estimatedPastUse", e.target.value as EstimatedPastUse)
              }
            >
              {Object.entries(estimatedUses).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amor actual
            <select
              value={form.currentLoveLevel ?? ""}
              onChange={(e) =>
                set(
                  "currentLoveLevel",
                  e.target.value ? (+e.target.value as 1 | 2 | 3 | 4 | 5) : undefined,
                )
              }
            >
              <option value="">Sin indicar</option>
              {[1, 2, 3, 4, 5].map((x) => (
                <option key={x} value={x}>
                  {x}/5
                </option>
              ))}
            </select>
          </label>
          <label>
            Queda bien
            <select
              value={form.currentFitLevel ?? ""}
              onChange={(e) =>
                set(
                  "currentFitLevel",
                  e.target.value ? (+e.target.value as 1 | 2 | 3 | 4 | 5) : undefined,
                )
              }
            >
              <option value="">Sin indicar</option>
              {[1, 2, 3, 4, 5].map((x) => (
                <option key={x} value={x}>
                  {x}/5
                </option>
              ))}
            </select>
          </label>
          <label>
            Encaja con tu estilo
            <select
              value={form.currentStyleMatch ?? ""}
              onChange={(e) =>
                set(
                  "currentStyleMatch",
                  e.target.value ? (+e.target.value as 1 | 2 | 3 | 4 | 5) : undefined,
                )
              }
            >
              <option value="">Sin indicar</option>
              {[1, 2, 3, 4, 5].map((x) => (
                <option key={x} value={x}>
                  {x}/5
                </option>
              ))}
            </select>
          </label>
          <label>
            Comodidad
            <select
              value={form.comfortLevel ?? ""}
              onChange={(e) =>
                set(
                  "comfortLevel",
                  e.target.value ? (+e.target.value as 1 | 2 | 3 | 4 | 5) : undefined,
                )
              }
            >
              <option value="">Sin indicar</option>
              {[1, 2, 3, 4, 5].map((x) => (
                <option key={x} value={x}>
                  {x}/5
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            Motivo de duda
            <textarea
              value={form.doubtReason || ""}
              onChange={(e) => set("doubtReason", e.target.value)}
              placeholder="Ej. ya no me representa, me aprieta, no sé combinarla..."
            />
          </label>
        </FormSection>
        <div className="form-actions">
          <Button variant="secondary" type="button" onClick={() => n(-1)}>
            Cancelar
          </Button>
          <Button type="submit">Guardar prenda</Button>
        </div>
      </form>
    </>
  );
}
function FormSection({
  title,
  intro,
  children,
  collapsible,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
  collapsible?: boolean;
}) {
  const content = (
    <>
      <header>
        <h2>{title}</h2>
        {intro && <p>{intro}</p>}
      </header>
      <div className="form-grid">{children}</div>
    </>
  );
  return collapsible ? (
    <details className="form-section collapsible-section">
      <summary>
        <span>
          <h2>{title}</h2>
          {intro && <p>{intro}</p>}
        </span>
        <b>Mostrar</b>
      </summary>
      <div className="form-grid">{children}</div>
    </details>
  ) : (
    <section className="form-section">
      {content}
    </section>
  );
}

function ItemDetail() {
  const { id } = useParams(),
    d = useData(),
    n = useNavigate(),
    item = d.items.find((i) => i.id === id),
    [vintedOpen, setVintedOpen] = useState(false),
    [reviewOpen, setReviewOpen] = useState(false);
  if (!item)
    return (
      <Empty title="Prenda no encontrada" text="Puede que se haya eliminado." />
    );
  const smart = smartItemScore(item, d);
  const logs = d.wears
    .filter((w) => w.clothingItemIds.includes(item.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  async function worn() {
    await db.wearLogs.add({
      id: uid(),
      clothingItemIds: [item!.id],
      date: today(),
    });
  }
  async function remove() {
    if (confirm("¿Eliminar esta prenda y sus referencias?")) {
      await db.transaction("rw", [db.clothingItems, db.wearLogs, db.resaleListings, db.syncDeletes], async () => {
        await softDeleteRecords("clothingItems", [item!.id]);
        await softDeleteRecords(
          "wearLogs",
          logs.map((log) => log.id),
        );
        if (item?.resaleListingId)
          await softDeleteRecords("resaleListings", [item.resaleListingId]);
      });
      n("/armario");
    }
  }
  return (
    <>
      <button className="back" onClick={() => n(-1)}>
        <ChevronLeft /> Volver al armario
      </button>
      <div className="detail">
        <div className="detail-photo">
          <ItemThumb item={item} />
        </div>
        <div className="detail-copy">
          {item.isArchived && (
            <div className="archive-notice">
              <Archive />
              <span>
                <b>Esta prenda ya no está en tu armario</b>
                <small>
                  {item.archiveReason
                    ? exitLabels[item.archiveReason]
                    : "Archivada"}{" "}
                  · {dateFmt(item.archivedAt)}
                </small>
              </span>
              <button
                onClick={() =>
                  db.clothingItems.update(item.id, {
                    isArchived: false,
                    archivedAt: undefined,
                    archiveReason: undefined,
                    updatedAt: now(),
                  })
                }
              >
                Restaurar
              </button>
            </div>
          )}
          <p className="eyebrow">
            {item.category}
            {item.subcategory && ` · ${item.subcategory}`}
          </p>
          <h1>{item.name}</h1>
          <div className="detail-badges">
            <span className={`badge ${item.decisionStatus}`}>
              {(() => {
                const Icon = decisionIcons[item.decisionStatus];
                return <Icon />;
              })()}
              {decisions[item.decisionStatus]}
            </span>
            <span>
              {(() => {
                const Icon = physicalIcons[item.physicalStatus];
                return <Icon />;
              })()}
              {physical[item.physicalStatus]}
            </span>
            {item.soldAt && <span>Vendida el {dateFmt(item.soldAt)}</span>}
          </div>
          <div className="detail-actions">
            <Button onClick={worn}>
              <Plus /> Usada hoy
            </Button>
            <Button
              variant="secondary"
              onClick={() => n(`/prenda/${id}/editar`)}
            >
              <Pencil /> Editar
            </Button>
            <details className="action-menu">
              <summary>Más</summary>
              <div>
                <button onClick={() => setReviewOpen(true)}>
                  <Brain /> Revisar prenda
                </button>
                {item.decisionStatus === "sell" && !item.isArchived && (
                  <button onClick={() => setVintedOpen(true)}>
                    <Clipboard /> Anuncio Vinted
                  </button>
                )}
                <button
                  onClick={() =>
                    db.clothingItems.update(item.id, {
                      decisionStatus: "sell",
                      updatedAt: now(),
                    })
                  }
                >
                  <Store /> Marcar para vender
                </button>
                <button
                  onClick={() =>
                    db.clothingItems.update(item.id, {
                      decisionStatus: "donate",
                      updatedAt: now(),
                    })
                  }
                >
                  <Archive /> Marcar para donar
                </button>
                <button
                  onClick={() =>
                    db.clothingItems.update(item.id, {
                      isArchived: true,
                      archivedAt: today(),
                      archiveReason: "discarded",
                      updatedAt: now(),
                    })
                  }
                >
                  <Archive /> Archivar
                </button>
                <button className="danger" onClick={remove}>
                  <Trash2 /> Eliminar
                </button>
              </div>
            </details>
          </div>
          <div className="use-stats">
            <Stat label="Veces usada" value={logs.length} />
            <Stat
              label="Último uso"
              value={logs[0] ? dateFmt(logs[0].date) : "Sin usos"}
            />
            <Stat
              label="Coste por uso"
              value={
                item.originalPrice
                  ? logs.length
                    ? money(item.originalPrice / logs.length)
                    : "Sin usos"
                  : "Sin precio"
              }
            />
            <Stat label="Confianza revisión" value={`${smart.confidenceScore}%`} />
          </div>
          <div className="detail-location">
            <small>Ubicación</small>
            {item.spaceId ? (
              <NavLink to={`/espacios/${item.spaceId}`}>
                <MapPin /> {spacePathText(item.spaceId, d.spaces)}
              </NavLink>
            ) : (
              <p>Sin ubicación asignada</p>
            )}
          </div>
          <section className="facts">
            <Fact l="Colores" v={item.colors.join(", ")} />
            <Fact l="Temporada" v={item.season.join(", ")} />
            <Fact l="Etiquetas" v={item.tags?.join(", ")} />
            <Fact l="Talla" v={item.size} />
            <Fact l="Marca" v={item.brand} />
            <Fact l="Tienda" v={item.store} />
            <Fact
              l="Valoración actual"
              v={
                [
                  item.currentLoveLevel && `amor ${item.currentLoveLevel}/5`,
                  item.currentFitLevel && `fit ${item.currentFitLevel}/5`,
                  item.currentStyleMatch && `estilo ${item.currentStyleMatch}/5`,
                  item.comfortLevel && `comodidad ${item.comfortLevel}/5`,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            />
            <Fact l="Uso pasado estimado" v={item.estimatedPastUse ? estimatedUses[item.estimatedPastUse] : undefined} />
            <Fact l="Antigüedad aproximada" v={item.approximateAgeRange ? ageRanges[item.approximateAgeRange] : undefined} />
            <Fact l="Fecha de compra" v={dateFmt(item.purchaseDate)} />
            <Fact
              l="Precio original"
              v={
                item.originalPrice != null
                  ? money(item.originalPrice)
                  : undefined
              }
            />
            <Fact
              l="Valor estimado"
              v={
                item.estimatedValue != null
                  ? money(item.estimatedValue)
                  : undefined
              }
            />
            {item.notes && <Fact l="Notas" v={item.notes} />}
            {item.doubtReason && <Fact l="Motivo de duda" v={item.doubtReason} />}
          </section>
          <details className="quick-decision">
            <summary>Decisión rápida</summary>
            <div>
              {(Object.keys(decisions) as DecisionStatus[]).map((k) => (
                <button
                  className={item.decisionStatus === k ? "active" : ""}
                  key={k}
                  onClick={() =>
                    db.clothingItems.update(item.id, {
                      decisionStatus: k,
                      updatedAt: now(),
                    })
                  }
                >
                  {decisions[k]}
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>
      {vintedOpen && (
        <VintedModal item={item} close={() => setVintedOpen(false)} />
      )}
      {reviewOpen && (
        <ReviewItemModal
          item={item}
          close={() => setReviewOpen(false)}
        />
      )}
    </>
  );
}
function Fact({ l, v }: { l: string; v?: string }) {
  return v ? (
    <div>
      <small>{l}</small>
      <p>{v}</p>
    </div>
  ) : null;
}

function ReviewItemModal({
  item,
  close,
}: {
  item: ClothingItem;
  close: () => void;
}) {
  const [form, setForm] = useState({
    currentLoveLevel: item.currentLoveLevel?.toString() || "",
    currentFitLevel: item.currentFitLevel?.toString() || "",
    currentStyleMatch: item.currentStyleMatch?.toString() || "",
    comfortLevel: item.comfortLevel?.toString() || "",
    estimatedPastUse: item.estimatedPastUse || ("unknown" as EstimatedPastUse),
    decisionStatus: item.decisionStatus,
    doubtReason: item.doubtReason || "",
  });
  async function save(e: FormEvent) {
    e.preventDefault();
    await db.clothingItems.update(item.id, {
      currentLoveLevel: form.currentLoveLevel
        ? (+form.currentLoveLevel as 1 | 2 | 3 | 4 | 5)
        : undefined,
      currentFitLevel: form.currentFitLevel
        ? (+form.currentFitLevel as 1 | 2 | 3 | 4 | 5)
        : undefined,
      currentStyleMatch: form.currentStyleMatch
        ? (+form.currentStyleMatch as 1 | 2 | 3 | 4 | 5)
        : undefined,
      comfortLevel: form.comfortLevel
        ? (+form.comfortLevel as 1 | 2 | 3 | 4 | 5)
        : undefined,
      estimatedPastUse: form.estimatedPastUse,
      decisionStatus: form.decisionStatus as DecisionStatus,
      doubtReason: form.doubtReason || undefined,
      updatedAt: now(),
    });
    close();
  }
  return (
    <Modal title="Revisar prenda" onClose={close} wide>
      <form className="modal-form" onSubmit={save}>
        <label>
          ¿Te gusta actualmente?
          <select
            value={form.currentLoveLevel}
            onChange={(e) => setForm({ ...form, currentLoveLevel: e.target.value })}
          >
            <option value="">Sin indicar</option>
            {[1, 2, 3, 4, 5].map((x) => (
              <option key={x} value={x}>
                {x}/5
              </option>
            ))}
          </select>
        </label>
        <label>
          ¿Te queda bien?
          <select
            value={form.currentFitLevel}
            onChange={(e) => setForm({ ...form, currentFitLevel: e.target.value })}
          >
            <option value="">Sin indicar</option>
            {[1, 2, 3, 4, 5].map((x) => (
              <option key={x} value={x}>
                {x}/5
              </option>
            ))}
          </select>
        </label>
        <label>
          ¿Va con tu estilo actual?
          <select
            value={form.currentStyleMatch}
            onChange={(e) => setForm({ ...form, currentStyleMatch: e.target.value })}
          >
            <option value="">Sin indicar</option>
            {[1, 2, 3, 4, 5].map((x) => (
              <option key={x} value={x}>
                {x}/5
              </option>
            ))}
          </select>
        </label>
        <label>
          ¿Es cómoda?
          <select
            value={form.comfortLevel}
            onChange={(e) => setForm({ ...form, comfortLevel: e.target.value })}
          >
            <option value="">Sin indicar</option>
            {[1, 2, 3, 4, 5].map((x) => (
              <option key={x} value={x}>
                {x}/5
              </option>
            ))}
          </select>
        </label>
        <label>
          ¿La usas?
          <select
            value={form.estimatedPastUse}
            onChange={(e) =>
              setForm({ ...form, estimatedPastUse: e.target.value as EstimatedPastUse })
            }
          >
            {Object.entries(estimatedUses).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          ¿La conservarías hoy?
          <select
            value={form.decisionStatus}
            onChange={(e) =>
              setForm({ ...form, decisionStatus: e.target.value as DecisionStatus })
            }
          >
            {Object.entries(decisions).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          Motivo de duda
          <textarea
            value={form.doubtReason}
            onChange={(e) => setForm({ ...form, doubtReason: e.target.value })}
            placeholder="Lo que te hace dudar ahora mismo."
          />
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button>Guardar revisión</Button>
        </div>
      </form>
    </Modal>
  );
}

function SpaceThumb({ space }: { space: Space }) {
  return space.photo ? (
    <img src={space.photo} alt="" />
  ) : (
    <div className="placeholder">
      <MapPin />
    </div>
  );
}

function SpaceCard({
  space,
  spaces,
  items,
  onEdit,
  onDelete,
}: {
  space: Space;
  spaces: Space[];
  items: ClothingItem[];
  onEdit: (space: Space) => void;
  onDelete: (space: Space) => void;
}) {
  const count = itemsInSpaceBranch(space.id, items, spaces).length,
    children = childSpaces(space.id, spaces).length,
    route = spacePathText(space.parentId, spaces),
    comfort = occupancyLabel(count, space.capacity);
  return (
    <article className="space-card">
      <NavLink className="space-card-link" to={`/espacios/${space.id}`}>
        <div className="space-photo">
          <SpaceThumb space={space} />
        </div>
        <div className="space-card-copy">
          <p className="eyebrow">{spaceTypes[space.type]}</p>
          <h3>{space.name}</h3>
          <p>{route || "Espacio principal"}</p>
          <div className="space-card-meta">
            <small>{count} prendas</small>
            <small>
              {space.capacity
                ? `${count}/${space.capacity} · ${comfort}`
                : children
                  ? `${children} subespacios`
                  : "Sin capacidad definida"}
            </small>
          </div>
        </div>
      </NavLink>
      <div className="space-card-actions">
        <button className="icon-btn" onClick={() => onEdit(space)}>
          <Pencil />
        </button>
        <button className="icon-btn" onClick={() => onDelete(space)}>
          <Trash2 />
        </button>
      </div>
    </article>
  );
}

function SpacesPage() {
  const d = useData(),
    activeItems = d.items.filter((item) => !item.isArchived),
    n = useNavigate();
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Space | undefined>(),
    [parentSeed, setParentSeed] = useState<string | undefined>();
  const locatedItems = activeItems.filter((item) => item.spaceId),
    unlocatedItems = activeItems.filter((item) => !item.spaceId),
    roots = childSpaces(undefined, d.spaces),
    filled = d.spaces
      .filter((space) => space.capacity)
      .map((space) => ({
        space,
        count: itemsInSpaceBranch(space.id, activeItems, d.spaces).length,
      }))
      .sort(
        (a, b) =>
          b.count / (b.space.capacity || 1) - a.count / (a.space.capacity || 1) ||
          b.count - a.count,
      )
      .slice(0, 5),
    emptySpaces = d.spaces
      .filter((space) => !itemsInSpaceBranch(space.id, activeItems, d.spaces).length)
      .slice(0, 5);

  function openCreate(seed?: string) {
    setEditing(undefined);
    setParentSeed(seed);
    setOpen(true);
  }

  function openEdit(space: Space) {
    setEditing(space);
    setParentSeed(space.parentId);
    setOpen(true);
  }

  return (
    <>
      <PageHead
        eyebrow={`${d.spaces.length} ESPACIOS · ${locatedItems.length} PRENDAS UBICADAS`}
        title="Mis espacios"
      >
        <Button onClick={() => openCreate()}>
          <Plus /> Nuevo espacio
        </Button>
      </PageHead>
      <div className="stat-grid">
        <Stat label="Espacios" value={d.spaces.length} icon={<MapPin />} />
        <Stat label="Prendas con ubicación" value={locatedItems.length} icon={<Shirt />} />
        <Stat
          label="Sin ubicación"
          value={unlocatedItems.length}
          note={unlocatedItems.length ? "Pendientes de ordenar" : "Todo colocado"}
          icon={<ClipboardList />}
        />
        <Stat
          label="Porcentaje ubicado"
          value={activeItems.length ? `${Math.round((locatedItems.length / activeItems.length) * 100)}%` : "0%"}
          note={activeItems.length ? `${locatedItems.length}/${activeItems.length} prendas` : "Añade prendas para empezar"}
          icon={<Check />}
        />
      </div>
      {d.spaces.length ? (
        <>
          <div className="two-col">
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">ESPACIOS PRINCIPALES</p>
                  <h2>Tus bases físicas</h2>
                </div>
              </div>
              <div className="space-grid">
                {roots.map((space) => (
                  <SpaceCard
                    key={space.id}
                    space={space}
                    spaces={d.spaces}
                    items={activeItems}
                    onEdit={openEdit}
                    onDelete={(value) => deleteSpaceBranch(value, d)}
                  />
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">PENDIENTES DE UBICAR</p>
                  <h2>Prendas sin sitio asignado</h2>
                </div>
              </div>
              {unlocatedItems.length ? (
                <div className="mini-items">
                  {unlocatedItems.slice(0, 6).map((item) => (
                    <NavLink to={`/prenda/${item.id}`} key={item.id}>
                      <ItemThumb item={item} />
                      <span>
                        {item.name}
                        <small>{item.category}</small>
                      </span>
                    </NavLink>
                  ))}
                </div>
              ) : (
                <div className="inline-empty">
                  <Check />
                  <span>
                    <b>Todo tiene lugar</b>
                    <small>No hay prendas pendientes de ubicar.</small>
                  </span>
                </div>
              )}
            </section>
          </div>
          <div className="two-col">
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">MÁS LLENOS</p>
                  <h2>Dónde empieza a apretarse</h2>
                </div>
              </div>
              {filled.length ? (
                <div className="space-list">
                  {filled.map(({ space, count }) => (
                    <NavLink className="space-list-row" to={`/espacios/${space.id}`} key={space.id}>
                      <div>
                        <b>{space.name}</b>
                        <small>{spacePathText(space.id, d.spaces)}</small>
                      </div>
                      <span>
                        {count}/{space.capacity} · {occupancyLabel(count, space.capacity)}
                      </span>
                    </NavLink>
                  ))}
                </div>
              ) : (
                <div className="inline-empty">
                  <MapPin />
                  <span>
                    <b>Aún sin capacidades</b>
                    <small>Define la capacidad de un espacio para medir ocupación.</small>
                  </span>
                </div>
              )}
            </section>
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">VACÍOS</p>
                  <h2>Espacios disponibles</h2>
                </div>
              </div>
              {emptySpaces.length ? (
                <div className="space-list">
                  {emptySpaces.map((space) => (
                    <NavLink className="space-list-row" to={`/espacios/${space.id}`} key={space.id}>
                      <div>
                        <b>{space.name}</b>
                        <small>{spacePathText(space.id, d.spaces) || spaceTypes[space.type]}</small>
                      </div>
                      <span>Vacío</span>
                    </NavLink>
                  ))}
                </div>
              ) : (
                <div className="inline-empty">
                  <Sparkles />
                  <span>
                    <b>No hay huecos vacíos</b>
                    <small>Todos tus espacios tienen ya alguna prenda asociada.</small>
                  </span>
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <Empty
          title="Empieza con un espacio principal"
          text="Crea tu casa, dormitorio, armario o maleta y construye desde ahí un mapa claro de dónde vive cada prenda."
          action={<Button onClick={() => openCreate()}>Crear primer espacio</Button>}
        />
      )}
      {open && (
        <SpaceModal
          close={() => setOpen(false)}
          data={d}
          parentSeed={parentSeed}
          space={editing}
        />
      )}
    </>
  );
}

function SpaceDetail() {
  const { id } = useParams(),
    d = useData(),
    n = useNavigate(),
    space = d.spaces.find((entry) => entry.id === id),
    activeItems = d.items.filter((item) => !item.isArchived);
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Space | undefined>(),
    [parentSeed, setParentSeed] = useState<string | undefined>();
  if (!space)
    return (
      <Empty title="Espacio no encontrado" text="Puede que se haya eliminado." />
    );
  const children = childSpaces(space.id, d.spaces),
    branchItems = itemsInSpaceBranch(space.id, activeItems, d.spaces),
    fullRoute = spacePathText(space.id, d.spaces),
    comfort = occupancyLabel(branchItems.length, space.capacity);

  function openCreate(seed?: string) {
    setEditing(undefined);
    setParentSeed(seed);
    setOpen(true);
  }

  function openEdit(spaceValue: Space) {
    setEditing(spaceValue);
    setParentSeed(spaceValue.parentId);
    setOpen(true);
  }

  return (
    <>
      <button className="back" onClick={() => n(-1)}>
        <ChevronLeft /> Volver
      </button>
      <div className="space-hero">
        <div className="space-hero-photo">
          <SpaceThumb space={space} />
        </div>
        <section className="panel space-hero-copy">
          <p className="eyebrow">{spaceTypes[space.type]}</p>
          <h1>{space.name}</h1>
          <p className="space-route">{fullRoute}</p>
          <div className="detail-badges">
            <span>{branchItems.length} prendas en esta ruta</span>
            {space.capacity && (
              <span>
                {branchItems.length}/{space.capacity} · {comfort}
              </span>
            )}
            {!!children.length && <span>{children.length} subespacios</span>}
          </div>
          {space.notes && <p className="lead">{space.notes}</p>}
          <div className="detail-actions">
            <Button onClick={() => openCreate(space.id)}>
              <Plus /> Añadir subespacio
            </Button>
            <Button variant="secondary" onClick={() => openEdit(space)}>
              <Pencil /> Editar
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await deleteSpaceBranch(space, d);
                n("/espacios");
              }}
            >
              <Trash2 /> Eliminar
            </Button>
          </div>
        </section>
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">SUBESPACIOS</p>
              <h2>Lo que contiene dentro</h2>
            </div>
          </div>
          {children.length ? (
            <div className="space-grid">
              {children.map((child) => (
                <SpaceCard
                  key={child.id}
                  space={child}
                  spaces={d.spaces}
                  items={activeItems}
                  onEdit={openEdit}
                  onDelete={(value) => deleteSpaceBranch(value, d)}
                />
              ))}
            </div>
          ) : (
            <Empty
              title="Todavía no hay subespacios"
              text="Añade cajones, baldas o armarios hijos si quieres afinar más el mapa."
              action={<Button onClick={() => openCreate(space.id)}>Crear subespacio</Button>}
            />
          )}
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">CAPACIDAD</p>
              <h2>Ocupación del espacio</h2>
            </div>
          </div>
          <div className="space-capacity">
            <b>
              {space.capacity
                ? `${branchItems.length}/${space.capacity}`
                : `${branchItems.length} prendas`}
            </b>
            <small>
              {space.capacity
                ? comfort
                : "Añade una capacidad para medir si este espacio está cómodo o apretado."}
            </small>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">PRENDAS CONTENIDAS</p>
            <h2>Dónde buscar dentro de esta ruta</h2>
          </div>
        </div>
        {branchItems.length ? (
          <div className="item-grid">
            {branchItems.map((item) => (
              <NavLink className="item-card" to={`/prenda/${item.id}`} key={item.id}>
                <div className="item-photo">
                  <ItemThumb item={item} />
                  <span className={`badge ${statusClass[item.decisionStatus]}`}>
                    {decisions[item.decisionStatus]}
                  </span>
                </div>
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.category}</p>
                  <small className="item-location">
                    {spacePathText(item.spaceId, d.spaces)}
                  </small>
                </div>
              </NavLink>
            ))}
          </div>
        ) : (
          <Empty
            title="Aún no hay prendas aquí"
            text="Asigna prendas a este espacio o a cualquiera de sus subespacios para empezar a verlo lleno de vida."
          />
        )}
      </section>
      {open && (
        <SpaceModal
          close={() => setOpen(false)}
          data={d}
          parentSeed={parentSeed}
          space={editing}
        />
      )}
    </>
  );
}

function SpaceModal({
  data,
  close,
  space,
  parentSeed,
}: {
  data: Data;
  close: () => void;
  space?: Space;
  parentSeed?: string;
}) {
  const blockedIds = space ? descendantSpaceIds(space.id, data.spaces) : new Set<string>();
  const [form, setForm] = useState({
    name: space?.name || "",
    type: space?.type || ("storage" as SpaceType),
    parentId: space?.parentId || parentSeed || "",
    photo: space?.photo || "",
    imageUpdatedAt: space?.imageUpdatedAt || "",
    notes: space?.notes || "",
    capacity: space?.capacity?.toString() || "",
  });
  const parentOptions = sortedSpaces(data.spaces).filter(
    (candidate) =>
      candidate.id !== space?.id &&
      !blockedIds.has(candidate.id) &&
      spaceTypeRank[candidate.type] < spaceTypeRank[form.type],
  );

  async function updatePhoto(file?: File) {
    const compressed = await compressImage(file);
    if (compressed)
      setForm((current) => ({
        ...current,
        photo: compressed,
        imageUpdatedAt: now(),
      }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const t = now(),
      validParent =
        form.type === "home"
          ? undefined
          : parentOptions.some((option) => option.id === form.parentId)
            ? form.parentId || undefined
            : undefined;
    await db.spaces.put({
      id: space?.id || uid(),
      name,
      type: form.type,
      parentId: validParent,
      photo: form.photo || undefined,
      imageUpdatedAt: form.imageUpdatedAt || undefined,
      notes: form.notes || undefined,
      capacity: form.capacity ? +form.capacity : undefined,
      createdAt: space?.createdAt || t,
      updatedAt: t,
    });
    close();
  }

  return (
    <Modal
      title={space ? "Editar espacio" : "Nuevo espacio"}
      onClose={close}
      wide
    >
      <form className="modal-form" onSubmit={save}>
        <label>
          Nombre *
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej. Armario blanco"
            required
          />
        </label>
        <label>
          Tipo
          <select
            value={form.type}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                type: e.target.value as SpaceType,
                parentId:
                  e.target.value === "home" ? "" : current.parentId,
              }))
            }
          >
            {Object.entries(spaceTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Espacio padre
          <select
            disabled={form.type === "home"}
            value={form.type === "home" ? "" : form.parentId}
            onChange={(e) => setForm({ ...form, parentId: e.target.value })}
          >
            <option value="">Sin espacio padre</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {spacePathText(option.id, data.spaces)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Capacidad
          <input
            type="number"
            min="0"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            placeholder="Opcional"
          />
        </label>
        <label className="full image-upload">
          {form.photo ? (
            <img src={form.photo} />
          ) : (
            <>
              <Upload />
              <span>Subir foto del espacio</span>
            </>
          )}
          <input
            hidden
            type="file"
            accept="image/*"
            onChange={(e) => updatePhoto(e.target.files?.[0])}
          />
        </label>
        <label className="full">
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Qué guardas aquí, cómo está organizado, recordatorios..."
          />
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button>{space ? "Guardar cambios" : "Crear espacio"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function LocationManagerModal({
  locations,
  selectedId,
  onSelect,
  close,
}: {
  locations: WeatherLocation[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<WeatherLocationSearchResult[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  async function runSearch() {
    if (query.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      setResults(await searchWeatherLocations(query));
    } catch {
      setError("No hemos podido buscar ubicaciones ahora mismo.");
    } finally {
      setBusy(false);
    }
  }

  async function saveResult(
    result: WeatherLocationSearchResult,
    makeDefault = false,
  ) {
    const existing = locations.find(
      (location) =>
        Math.abs(location.latitude - result.latitude) < 0.01 &&
        Math.abs(location.longitude - result.longitude) < 0.01,
    );
    const id = existing?.id || `weather-${uid()}`;
    await db.weatherLocations.put({
      id,
      name: `${result.name}${result.admin1 ? `, ${result.admin1}` : ""}${result.countryCode ? ` (${result.countryCode})` : ""}`,
      latitude: result.latitude,
      longitude: result.longitude,
      isDefault: existing?.isDefault || makeDefault || !locations.length,
      createdAt: existing?.createdAt || now(),
      updatedAt: now(),
    });
    if (makeDefault || !locations.some((location) => location.isDefault)) {
      await setDefaultWeatherLocation(id);
    }
    onSelect?.(id);
  }

  async function removeLocation(location: WeatherLocation) {
    if (locations.length === 1) {
      alert("Necesitas al menos una ubicación guardada.");
      return;
    }
    if (!confirm(`¿Eliminar “${location.name}”?`)) return;
    const fallback = locations.find((entry) => entry.id !== location.id);
    if (location.isDefault && fallback) {
      await setDefaultWeatherLocation(fallback.id);
      onSelect?.(fallback.id);
    }
    await softDeleteRecords("weatherLocations", [location.id]);
  }

  return (
    <Modal title="Ubicaciones de clima" onClose={close} wide>
      <div className="modal-form">
        <label className="full">
          Buscar ciudad o zona
          <div className="inline-input">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej. Ponteareas, Vigo, Madrid..."
            />
            <Button type="button" onClick={runSearch} disabled={busy || query.trim().length < 2}>
              <Search /> Buscar
            </Button>
          </div>
        </label>
        {error && <p className="form-error full">{error}</p>}
        <div className="full">
          <p className="field-label">Guardadas</p>
          <div className="space-list">
            {locations.map((location) => (
              <div className="space-list-row" key={location.id}>
                <div>
                  <b>{location.name}</b>
                  <small>
                    {location.latitude.toFixed(3)}, {location.longitude.toFixed(3)}
                  </small>
                </div>
                <div className="row">
                  {location.isDefault ? (
                    <span>Predeterminada</span>
                  ) : (
                    <button onClick={() => setDefaultWeatherLocation(location.id)}>
                      Hacer predeterminada
                    </button>
                  )}
                  {selectedId !== location.id && onSelect && (
                    <button onClick={() => onSelect(location.id)}>Usar</button>
                  )}
                  <button onClick={() => removeLocation(location)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {!!results.length && (
          <div className="full">
            <p className="field-label">Resultados</p>
            <div className="space-list">
              {results.map((result) => (
                <div className="space-list-row" key={result.id}>
                  <div>
                    <b>
                      {result.name}
                      {result.admin1 ? `, ${result.admin1}` : ""}
                    </b>
                    <small>
                      {result.countryCode || "—"} · {result.latitude.toFixed(3)},{" "}
                      {result.longitude.toFixed(3)}
                    </small>
                  </div>
                  <div className="row">
                    <button onClick={() => saveResult(result, false)}>Guardar</button>
                    <button onClick={() => saveResult(result, true)}>
                      Guardar y usar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function RoutineModal({
  routine,
  close,
}: {
  routine?: UserRoutine;
  close: () => void;
}) {
  const [form, setForm] = useState({
    dayOfWeek: String(routine?.dayOfWeek ?? 1),
    type: routine?.type || ("work" as UserRoutine["type"]),
    startTime: routine?.startTime || "",
    endTime: routine?.endTime || "",
    notes: routine?.notes || "",
  });

  async function save(e: FormEvent) {
    e.preventDefault();
    const stamp = now();
    await db.userRoutines.put({
      id: routine?.id || uid(),
      dayOfWeek: Number(form.dayOfWeek),
      type: form.type,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      notes: form.notes || undefined,
      createdAt: routine?.createdAt || stamp,
      updatedAt: stamp,
    });
    close();
  }

  async function remove() {
    if (!routine || !confirm("¿Eliminar esta rutina?")) return;
    await softDeleteRecords("userRoutines", [routine.id]);
    close();
  }

  return (
    <Modal title={routine ? "Editar rutina" : "Nueva rutina"} onClose={close}>
      <form className="modal-form" onSubmit={save}>
        <label>
          Día
          <select
            value={form.dayOfWeek}
            onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
          >
            {weekdayOrder.map((day) => (
              <option key={day} value={day}>
                {weekdayNames[day]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            value={form.type}
            onChange={(e) =>
              setForm({ ...form, type: e.target.value as UserRoutine["type"] })
            }
          >
            {Object.entries(routineTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Empieza
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
        </label>
        <label>
          Termina
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          />
        </label>
        <label className="full">
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Algo útil para ese día."
          />
        </label>
        <div className="modal-actions">
          {routine && (
            <Button type="button" variant="ghost" onClick={remove}>
              Eliminar
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button>Guardar rutina</Button>
        </div>
      </form>
    </Modal>
  );
}

function EventModal({
  event,
  close,
}: {
  event?: WardrobeEvent;
  close: () => void;
}) {
  const [form, setForm] = useState({
    title: event?.title || "",
    date: event?.date || today(),
    startTime: event?.startTime || "",
    endTime: event?.endTime || "",
    type: event?.type || ("event" as WardrobeEvent["type"]),
    dressCode: event?.dressCode || "",
    locationName: event?.locationName || "",
    latitude: event?.latitude?.toString() || "",
    longitude: event?.longitude?.toString() || "",
    notes: event?.notes || "",
  });
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<WeatherLocationSearchResult[]>([]);

  async function searchPlace() {
    if (query.trim().length < 2) return;
    try {
      setResults(await searchWeatherLocations(query));
    } catch {
      setResults([]);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const stamp = now();
    await db.wardrobeEvents.put({
      id: event?.id || uid(),
      title: form.title.trim(),
      date: form.date,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      type: form.type,
      dressCode: form.dressCode
        ? (form.dressCode as NonNullable<WardrobeEvent["dressCode"]>)
        : undefined,
      locationName: form.locationName || undefined,
      latitude: form.latitude ? +form.latitude : undefined,
      longitude: form.longitude ? +form.longitude : undefined,
      notes: form.notes || undefined,
      createdAt: event?.createdAt || stamp,
      updatedAt: stamp,
    });
    close();
  }

  async function remove() {
    if (!event || !confirm("¿Eliminar este evento?")) return;
    await softDeleteRecords("wardrobeEvents", [event.id]);
    close();
  }

  return (
    <Modal title={event ? "Editar evento" : "Nuevo evento"} onClose={close} wide>
      <form className="modal-form" onSubmit={save}>
        <label>
          Título *
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ej. Cena con amigas"
            required
          />
        </label>
        <label>
          Fecha
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
        </label>
        <label>
          Empieza
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
        </label>
        <label>
          Termina
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          />
        </label>
        <label>
          Tipo de plan
          <select
            value={form.type}
            onChange={(e) =>
              setForm({ ...form, type: e.target.value as WardrobeEvent["type"] })
            }
          >
            {Object.entries(eventTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dress code
          <select
            value={form.dressCode}
            onChange={(e) => setForm({ ...form, dressCode: e.target.value })}
          >
            <option value="">Sin indicar</option>
            {Object.entries(dressCodeLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          Ubicación
          <input
            value={form.locationName}
            onChange={(e) => setForm({ ...form, locationName: e.target.value })}
            placeholder="Ej. Vigo centro"
          />
        </label>
        <label className="full">
          Buscar ubicación opcional
          <div className="inline-input">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar para guardar coordenadas"
            />
            <Button type="button" variant="secondary" onClick={searchPlace}>
              <Search /> Buscar
            </Button>
          </div>
        </label>
        {!!results.length && (
          <div className="full space-list">
            {results.slice(0, 4).map((result) => (
              <button
                type="button"
                className="space-list-row"
                key={result.id}
                onClick={() =>
                  setForm({
                    ...form,
                    locationName: `${result.name}${result.admin1 ? `, ${result.admin1}` : ""}`,
                    latitude: String(result.latitude),
                    longitude: String(result.longitude),
                  })
                }
              >
                <div>
                  <b>{result.name}</b>
                  <small>
                    {result.admin1 || result.countryCode || "—"} ·{" "}
                    {result.latitude.toFixed(3)}, {result.longitude.toFixed(3)}
                  </small>
                </div>
                <span>Usar</span>
              </button>
            ))}
          </div>
        )}
        <label className="full">
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Algo importante para vestirte mejor ese día."
          />
        </label>
        <div className="modal-actions">
          {event && (
            <Button type="button" variant="ghost" onClick={remove}>
              Eliminar
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button>Guardar evento</Button>
        </div>
      </form>
    </Modal>
  );
}

function TripCard({
  trip,
  data,
  onEdit,
  onDelete,
}: {
  trip: Trip;
  data: Data;
  onEdit: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
}) {
  const stats = tripStats(data, trip);
  const forecast = tripForecast(data.weatherCache, trip.id)[0];
  return (
    <article className="trip-card">
      <NavLink to={`/viajes/${trip.id}`} className="trip-card-copy">
        <p className="eyebrow">{tripTypes[trip.type]}</p>
        <h3>{trip.name}</h3>
        <p>{trip.destinationName}</p>
        <small>
          {dateFmt(trip.startDate)} → {dateFmt(trip.endDate)} · {tripLength(trip)} días
        </small>
        <div className="trip-meta">
          <span>{stats.pending} pendientes</span>
          <span>{stats.outfitsPlanned} outfits</span>
          <span>{stats.daysWithoutOutfit} días sin look</span>
          {forecast && (
            <span className="weather-mini">
              {(() => {
                const visual = weatherVisual(forecast);
                const Icon = visual.Icon;
                return <Icon />;
              })()}
              {forecast.description} · {Math.round(forecast.temperatureMin)}–{Math.round(forecast.temperatureMax)}°C
            </span>
          )}
        </div>
      </NavLink>
      <div className="space-card-actions">
        <button className="icon-btn" onClick={() => onEdit(trip)}>
          <Pencil />
        </button>
        <button className="icon-btn" onClick={() => onDelete(trip)}>
          <Trash2 />
        </button>
      </div>
    </article>
  );
}

function TripModal({
  trip,
  close,
}: {
  trip?: Trip;
  close: () => void;
}) {
  const [form, setForm] = useState({
    name: trip?.name || "",
    destinationName: trip?.destinationName || "",
    latitude: trip?.latitude?.toString() || "",
    longitude: trip?.longitude?.toString() || "",
    startDate: trip?.startDate || today(),
    endDate: trip?.endDate || today(),
    type: trip?.type || ("vacation" as Trip["type"]),
    notes: trip?.notes || "",
  });
  const [query, setQuery] = useState(trip?.destinationName || ""),
    [results, setResults] = useState<WeatherLocationSearchResult[]>([]),
    [busy, setBusy] = useState(false);

  async function searchDestination() {
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      setResults(await searchWeatherLocations(query));
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.destinationName.trim()) return;
    const stamp = now();
    const record: Trip = {
      id: trip?.id || uid(),
      name: form.name.trim(),
      destinationName: form.destinationName.trim(),
      latitude: form.latitude ? +form.latitude : undefined,
      longitude: form.longitude ? +form.longitude : undefined,
      startDate: form.startDate,
      endDate: form.endDate < form.startDate ? form.startDate : form.endDate,
      type: form.type,
      notes: form.notes || undefined,
      createdAt: trip?.createdAt || stamp,
      updatedAt: stamp,
    };
    await db.trips.put(record);
    close();
  }

  return (
    <Modal title={trip ? "Editar viaje" : "Nuevo viaje"} onClose={close} wide>
      <form className="modal-form" onSubmit={save}>
        <label>
          Nombre *
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej. Lisboa en mayo"
            required
          />
        </label>
        <label>
          Tipo de viaje
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as Trip["type"] })}
          >
            {Object.entries(tripTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          Destino *
          <input
            value={form.destinationName}
            onChange={(e) => setForm({ ...form, destinationName: e.target.value })}
            placeholder="Ej. Lisboa"
            required
          />
        </label>
        <label className="full">
          Buscar destino y guardar coordenadas
          <div className="inline-input">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca ciudad, playa o destino"
            />
            <Button type="button" variant="secondary" onClick={searchDestination} disabled={busy}>
              <Search /> Buscar
            </Button>
          </div>
        </label>
        {!!results.length && (
          <div className="full space-list">
            {results.slice(0, 5).map((result) => (
              <button
                type="button"
                className="space-list-row"
                key={result.id}
                onClick={() =>
                  setForm({
                    ...form,
                    destinationName: `${result.name}${result.admin1 ? `, ${result.admin1}` : ""}`,
                    latitude: String(result.latitude),
                    longitude: String(result.longitude),
                  })
                }
              >
                <div>
                  <b>{result.name}</b>
                  <small>
                    {result.admin1 || result.countryCode || "—"} · {result.latitude.toFixed(3)}, {result.longitude.toFixed(3)}
                  </small>
                </div>
                <span>Usar</span>
              </button>
            ))}
          </div>
        )}
        <label>
          Fecha inicio
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            required
          />
        </label>
        <label>
          Fecha fin
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            required
          />
        </label>
        <label className="full">
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Planes clave, cenas, logística..."
          />
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button>{trip ? "Guardar viaje" : "Crear viaje"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function TripPackingModal({
  tripId,
  data,
  item,
  close,
}: {
  tripId: string;
  data: Data;
  item?: TripPackingItem;
  close: () => void;
}) {
  const clothing = item?.clothingItemId
    ? data.items.find((entry) => entry.id === item.clothingItemId)
    : undefined;
  const [mode, setMode] = useState<"clothing" | "manual">(
    item?.clothingItemId ? "clothing" : "manual",
  );
  const [form, setForm] = useState({
    clothingItemId: item?.clothingItemId || "",
    customName: item?.customName || clothing?.name || "",
    category: item?.category || clothing?.category || "",
    quantity: String(item?.quantity || 1),
    checked: item?.checked || false,
    notes: item?.notes || "",
  });
  const activeItems = data.items.filter((entry) => !entry.isArchived);

  async function save(e: FormEvent) {
    e.preventDefault();
    const stamp = now();
    await db.tripPackingItems.put({
      id: item?.id || uid(),
      tripId,
      clothingItemId: mode === "clothing" ? form.clothingItemId || undefined : undefined,
      customName: mode === "manual" ? form.customName.trim() || undefined : undefined,
      category:
        mode === "manual"
          ? form.category.trim() || undefined
          : activeItems.find((entry) => entry.id === form.clothingItemId)?.category,
      quantity: form.quantity ? Math.max(1, +form.quantity) : 1,
      checked: form.checked,
      notes: form.notes || undefined,
      createdAt: item?.createdAt || stamp,
      updatedAt: stamp,
    });
    close();
  }

  async function remove() {
    if (!item || !confirm("¿Eliminar este elemento de la maleta?")) return;
    await softDeleteRecords("tripPackingItems", [item.id]);
    close();
  }

  return (
    <Modal title={item ? "Editar elemento" : "Añadir a la maleta"} onClose={close} wide>
      <form className="modal-form" onSubmit={save}>
        <div className="full small-tabs">
          <button
            type="button"
            className={mode === "clothing" ? "active" : ""}
            onClick={() => setMode("clothing")}
          >
            Prenda del armario
          </button>
          <button
            type="button"
            className={mode === "manual" ? "active" : ""}
            onClick={() => setMode("manual")}
          >
            Elemento manual
          </button>
        </div>
        {mode === "clothing" ? (
          <label className="full">
            Prenda
            <select
              value={form.clothingItemId}
              onChange={(e) => {
                const picked = activeItems.find((entry) => entry.id === e.target.value);
                setForm({
                  ...form,
                  clothingItemId: e.target.value,
                  category: picked?.category || "",
                });
              }}
              required
            >
              <option value="">Selecciona una prenda</option>
              {activeItems.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} · {entry.category}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Nombre
              <input
                value={form.customName}
                onChange={(e) => setForm({ ...form, customName: e.target.value })}
                placeholder="Ej. cargador"
                required
              />
            </label>
            <label>
              Categoría
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Ej. tecnología"
              />
            </label>
            <div className="full">
              <p className="field-label">Ideas rápidas</p>
              <div className="chips">
                {packingTemplates.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => setForm({ ...form, customName: entry })}
                  >
                    {entry}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <label>
          Cantidad
          <input
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={form.checked}
            onChange={(e) => setForm({ ...form, checked: e.target.checked })}
          />{" "}
          Ya está en la maleta
        </label>
        <label className="full">
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Algo que quieras recordar."
          />
        </label>
        <div className="modal-actions">
          {item && (
            <Button type="button" variant="ghost" onClick={remove}>
              Eliminar
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}

function TripPlannedOutfitModal({
  trip,
  data,
  planned,
  seedDate,
  close,
}: {
  trip: Trip;
  data: Data;
  planned?: TripPlannedOutfit;
  seedDate?: string;
  close: () => void;
}) {
  const tripDays = tripDates(trip);
  const [mode, setMode] = useState<"outfit" | "manual">(
    planned?.outfitId ? "outfit" : "manual",
  );
  const [form, setForm] = useState({
    date: planned?.date || seedDate || trip.startDate,
    eventLabel: planned?.eventLabel || "",
    outfitId: planned?.outfitId || "",
    notes: planned?.notes || "",
    clothingItemIds: planned?.clothingItemIds || [],
  });
  const activeItems = data.items.filter((entry) => !entry.isArchived);

  function chooseOutfit(id: string) {
    const picked = data.outfits.find((entry) => entry.id === id);
    setForm({
      ...form,
      outfitId: id,
      clothingItemIds: picked?.clothingItemIds || [],
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.clothingItemIds.length) return;
    const stamp = now();
    await db.tripPlannedOutfits.put({
      id: planned?.id || uid(),
      tripId: trip.id,
      date: form.date || undefined,
      eventLabel: form.eventLabel || undefined,
      outfitId: mode === "outfit" ? form.outfitId || undefined : undefined,
      clothingItemIds: form.clothingItemIds,
      notes: form.notes || undefined,
      createdAt: planned?.createdAt || stamp,
      updatedAt: stamp,
    });
    close();
  }

  async function remove() {
    if (!planned || !confirm("¿Eliminar este outfit planificado?")) return;
    await softDeleteRecords("tripPlannedOutfits", [planned.id]);
    close();
  }

  return (
    <Modal title={planned ? "Editar outfit del viaje" : "Planificar outfit"} onClose={close} wide>
      <form className="modal-form" onSubmit={save}>
        <div className="full small-tabs">
          <button
            type="button"
            className={mode === "outfit" ? "active" : ""}
            onClick={() => setMode("outfit")}
          >
            Outfit existente
          </button>
          <button
            type="button"
            className={mode === "manual" ? "active" : ""}
            onClick={() => setMode("manual")}
          >
            Selección manual
          </button>
        </div>
        <label>
          Día
          <select
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          >
            {tripDays.map((date) => (
              <option key={date} value={date}>
                {dayLabel(date)} · {dateFmt(date)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Evento o momento
          <input
            value={form.eventLabel}
            onChange={(e) => setForm({ ...form, eventLabel: e.target.value })}
            placeholder="Ej. cena, boda, paseo..."
          />
        </label>
        {mode === "outfit" ? (
          <label className="full">
            Outfit
            <select
              value={form.outfitId}
              onChange={(e) => chooseOutfit(e.target.value)}
              required
            >
              <option value="">Selecciona un outfit</option>
              {data.outfits.map((outfit) => (
                <option key={outfit.id} value={outfit.id}>
                  {outfit.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="full">
          <p className="field-label">Prendas ({form.clothingItemIds.length})</p>
          <div className="picker">
            {activeItems.map((entry) => (
              <button
                type="button"
                className={form.clothingItemIds.includes(entry.id) ? "picked" : ""}
                key={entry.id}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    clothingItemIds: current.clothingItemIds.includes(entry.id)
                      ? current.clothingItemIds.filter((id) => id !== entry.id)
                      : [...current.clothingItemIds, entry.id],
                  }))
                }
              >
                <ItemThumb item={entry} />
                <span>{entry.name}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="full">
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Qué zapato va mejor, si se repite prenda, etc."
          />
        </label>
        <div className="modal-actions">
          {planned && (
            <Button type="button" variant="ghost" onClick={remove}>
              Eliminar
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button disabled={!form.clothingItemIds.length}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}

function TripsPage() {
  const d = useData(),
    n = useNavigate();
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Trip | undefined>();
  const trips = [...d.trips].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || b.updatedAt.localeCompare(a.updatedAt),
  );

  async function removeTrip(trip: Trip) {
    if (!confirm(`¿Eliminar “${trip.name}” y su planificación?`)) return;
    const packingIds = d.tripPackingItems
      .filter((entry) => entry.tripId === trip.id)
      .map((entry) => entry.id);
    const plannedIds = d.tripPlannedOutfits
      .filter((entry) => entry.tripId === trip.id)
      .map((entry) => entry.id);
    await db.transaction(
      "rw",
      [db.trips, db.tripPackingItems, db.tripPlannedOutfits, db.weatherCache, db.syncDeletes],
      async () => {
        if (packingIds.length) await softDeleteRecords("tripPackingItems", packingIds);
        if (plannedIds.length) await softDeleteRecords("tripPlannedOutfits", plannedIds);
        await softDeleteRecords("trips", [trip.id]);
        const weatherKeys = d.weatherCache
          .filter((entry) => entry.locationId === tripWeatherKey(trip.id))
          .map((entry) => entry.id);
        if (weatherKeys.length) await db.weatherCache.bulkDelete(weatherKeys);
      },
    );
  }

  return (
    <>
      <PageHead eyebrow={`${trips.length} VIAJES`} title="Viajes">
        <Button
          onClick={() => {
            setEditing(undefined);
            setOpen(true);
          }}
        >
          <Plus /> Crear viaje
        </Button>
      </PageHead>
      {trips.length ? (
        <div className="trip-grid">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              data={d}
              onEdit={(value) => {
                setEditing(value);
                setOpen(true);
              }}
              onDelete={removeTrip}
            />
          ))}
        </div>
      ) : (
        <Empty
          title="Tus viajes vivirán aquí"
          text="Crea un viaje para planificar outfits, consultar el clima del destino y preparar una maleta sin olvidos."
          action={<Button onClick={() => setOpen(true)}>Crear primer viaje</Button>}
        />
      )}
      {open && (
        <TripModal
          trip={editing}
          close={() => {
            setOpen(false);
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}

function TripDetail() {
  const { id } = useParams(),
    d = useData(),
    n = useNavigate(),
    trip = d.trips.find((entry) => entry.id === id);
  const [tripOpen, setTripOpen] = useState(false),
    [packingOpen, setPackingOpen] = useState(false),
    [plannedOpen, setPlannedOpen] = useState(false),
    [packingEditing, setPackingEditing] = useState<TripPackingItem | undefined>(),
    [plannedEditing, setPlannedEditing] = useState<TripPlannedOutfit | undefined>(),
    [seedDate, setSeedDate] = useState<string | undefined>(),
    [tab, setTab] = useState<"summary" | "packing" | "outfits">("summary"),
    [refreshingWeather, setRefreshingWeather] = useState(false),
    [weatherError, setWeatherError] = useState("");
  if (!trip)
    return <Empty title="Viaje no encontrado" text="Puede que ya no exista." />;
  const currentTrip = trip;
  const stats = tripStats(d, currentTrip);
  const forecast = tripForecast(d.weatherCache, currentTrip.id);
  const insights = tripUsageInsights(d, currentTrip);
  const upcoming = currentTrip.endDate >= today();
  const groupedPlanned = stats.dates.map((date) => ({
    date,
    outfits: stats.planned.filter((entry) => entry.date === date),
    weather: forecast.find((entry) => entry.date === date),
  }));
  const manualPlanned = stats.planned.filter((entry) => !entry.date);

  useEffect(() => {
    if (currentTrip.latitude == null || currentTrip.longitude == null || forecast.length) return;
    setRefreshingWeather(true);
    refreshTripWeather(currentTrip, Math.max(tripLength(currentTrip), 3))
      .catch(() => setWeatherError("No hemos podido traer el clima del destino ahora mismo."))
      .finally(() => setRefreshingWeather(false));
  }, [currentTrip, forecast.length]);

  async function refreshDestinationWeather() {
    if (currentTrip.latitude == null || currentTrip.longitude == null) {
      setWeatherError("Guarda un destino con coordenadas para consultar el clima.");
      return;
    }
    setRefreshingWeather(true);
    setWeatherError("");
    try {
      await refreshTripWeather(currentTrip, Math.max(tripLength(currentTrip), 3));
    } catch {
      setWeatherError("No hemos podido traer el clima del destino ahora mismo.");
    } finally {
      setRefreshingWeather(false);
    }
  }

  async function togglePacked(item: TripPackingItem) {
    await db.tripPackingItems.update(item.id, {
      checked: !item.checked,
      updatedAt: now(),
    });
  }

  async function deleteTrip() {
    if (!confirm(`¿Eliminar “${currentTrip.name}” y toda su planificación?`)) return;
    const weatherKeys = d.weatherCache
      .filter((entry) => entry.locationId === tripWeatherKey(currentTrip.id))
      .map((entry) => entry.id);
    await db.transaction(
      "rw",
      [db.trips, db.tripPackingItems, db.tripPlannedOutfits, db.weatherCache, db.syncDeletes],
      async () => {
        if (stats.packing.length)
          await softDeleteRecords(
            "tripPackingItems",
            stats.packing.map((entry) => entry.id),
          );
        if (stats.planned.length)
          await softDeleteRecords(
            "tripPlannedOutfits",
            stats.planned.map((entry) => entry.id),
          );
        await softDeleteRecords("trips", [currentTrip.id]);
        if (weatherKeys.length) await db.weatherCache.bulkDelete(weatherKeys);
      },
    );
    n("/viajes");
  }

  return (
    <>
      <button className="back" onClick={() => n(-1)}>
        <ChevronLeft /> Volver
      </button>
      <PageHead eyebrow={tripTypes[currentTrip.type].toUpperCase()} title={currentTrip.name}>
        <div className="actions">
          <Button variant="secondary" onClick={() => setTripOpen(true)}>
            <Pencil /> Editar
          </Button>
          <Button variant="secondary" onClick={refreshDestinationWeather} disabled={refreshingWeather}>
            <Cloud /> {refreshingWeather ? "Clima..." : "Actualizar clima"}
          </Button>
          <Button variant="ghost" onClick={deleteTrip}>
            <Trash2 /> Eliminar
          </Button>
        </div>
      </PageHead>
      <section className="panel trip-hero">
        <div>
          <p className="eyebrow">DESTINO</p>
          <h2>{currentTrip.destinationName}</h2>
          <p className="muted">
            {dateFmt(currentTrip.startDate)} → {dateFmt(currentTrip.endDate)} · {tripLength(currentTrip)} días
          </p>
          {currentTrip.notes && <p className="lead">{currentTrip.notes}</p>}
        </div>
        <div className="trip-hero-side">
          <div className="space-capacity">
            <b>{stats.pending}</b>
            <small>pendientes en la maleta</small>
          </div>
          <div className="space-capacity">
            <b>{stats.daysWithoutOutfit}</b>
            <small>días todavía sin outfit</small>
          </div>
        </div>
      </section>
      <div className="stat-grid">
        <Stat label="Items en maleta" value={stats.totalItems} icon={<Luggage />} />
        <Stat label="Completados" value={stats.completed} icon={<Check />} />
        <Stat label="Outfits planificados" value={stats.outfitsPlanned} icon={<Heart />} />
        <Stat label="Días sin outfit" value={stats.daysWithoutOutfit} icon={<CalendarDays />} />
      </div>
      <div className="tabs">
        <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>
          Resumen
        </button>
        <button className={tab === "packing" ? "active" : ""} onClick={() => setTab("packing")}>
          Maleta
        </button>
        <button className={tab === "outfits" ? "active" : ""} onClick={() => setTab("outfits")}>
          Outfits
        </button>
      </div>
      {(tab === "summary" || window.innerWidth > 760) && (
        <>
          <div className="two-col">
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">RECOMENDACIONES</p>
                  <h2>Qué tiene sentido llevar</h2>
                </div>
              </div>
              <div className="trip-guidance">
                {tripRecommendationText(currentTrip, forecast, stats.planned).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              {weatherError && <p className="form-error">{weatherError}</p>}
            </section>
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">CLIMA DEL DESTINO</p>
                  <h2>Vista rápida</h2>
                </div>
              </div>
              {forecast.length ? (
                <div className="forecast-strip">
                  {forecast.slice(0, tripLength(currentTrip)).map((day) => (
                    <div className="forecast-pill" key={day.date}>
                      <b>
                        {(() => {
                          const visual = weatherVisual(day);
                          const Icon = visual.Icon;
                          return <Icon />;
                        })()}
                        {dayLabel(day.date).slice(0, 3)}
                      </b>
                      <span>{Math.round(day.temperatureMin)}–{Math.round(day.temperatureMax)}°C</span>
                      <small>{day.description}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Clima aún no descargado"
                  text={
                    currentTrip.latitude != null && currentTrip.longitude != null
                      ? "Pulsa actualizar clima para consultar el destino."
                      : "Puedes guardar el viaje igualmente aunque no haya coordenadas todavía."
                  }
                />
              )}
            </section>
          </div>
          <div className="two-col">
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">REPETICIÓN INTELIGENTE</p>
                  <h2>Qué parece versátil y qué quizá sobra</h2>
                </div>
              </div>
              <div className="trip-guidance">
                {insights.repeated.length ? (
                  <p>
                    Se repiten bien: {insights.repeated
                      .slice(0, 4)
                      .map((entry) => `${entry.item?.name} (${entry.count})`)
                      .join(" · ")}
                  </p>
                ) : (
                  <p>Todavía no hay prendas repetidas entre outfits planificados.</p>
                )}
                {insights.unusedPacked.length ? (
                  <p>
                    Quizá sobran por ahora: {insights.unusedPacked
                      .slice(0, 4)
                      .map((item) => item.name)
                      .join(" · ")}
                  </p>
                ) : (
                  <p>De momento lo que has metido tiene alguna función clara dentro del viaje.</p>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">ESTADO DEL VIAJE</p>
                  <h2>Cómo va tu preparación</h2>
                </div>
              </div>
              <div className="trip-check-grid">
                <div>
                  <b>{stats.completed}/{stats.totalItems || 0}</b>
                  <small>Checklist completado</small>
                </div>
                <div>
                  <b>{stats.outfitsPlanned}</b>
                  <small>Outfits ya preparados</small>
                </div>
                <div>
                  <b>{stats.daysWithoutOutfit}</b>
                  <small>Días aún por planificar</small>
                </div>
                <div>
                  <b>{upcoming ? "Próximo" : "Pasado"}</b>
                  <small>{currentTrip.destinationName}</small>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
      {(tab === "packing" || window.innerWidth > 760) && (
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">CHECKLIST DE MALETA</p>
              <h2>Qué ya está dentro y qué falta</h2>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setPackingEditing(undefined);
                setPackingOpen(true);
              }}
            >
              <Plus /> Añadir item
            </Button>
          </div>
          {stats.packing.length ? (
            <div className="packing-list">
              {stats.packing.map((item) => {
                const clothing = item.clothingItemId
                  ? d.items.find((entry) => entry.id === item.clothingItemId)
                  : undefined;
                return (
                  <article className={`packing-row ${item.checked ? "checked" : ""}`} key={item.id}>
                    <button className="check-toggle" onClick={() => togglePacked(item)}>
                      {item.checked ? <Check /> : null}
                    </button>
                    <div className="packing-main">
                      <b>{tripPackingLabel(item, d.items)}</b>
                      <small>
                        {tripPackingMeta(item, d.items)}
                        {item.quantity && item.quantity > 1 ? ` · x${item.quantity}` : ""}
                        {item.notes ? ` · ${item.notes}` : ""}
                      </small>
                    </div>
                    {clothing ? (
                      <NavLink className="packing-thumb" to={`/prenda/${clothing.id}`}>
                        <ItemThumb item={clothing} />
                      </NavLink>
                    ) : (
                      <div className="packing-thumb placeholder">
                        <Luggage />
                      </div>
                    )}
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setPackingEditing(item);
                        setPackingOpen(true);
                      }}
                    >
                      <Pencil />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Tu maleta empieza aquí"
              text="Añade prendas del armario o elementos manuales como cargador, neceser o documentación."
              action={<Button onClick={() => setPackingOpen(true)}>Añadir primer item</Button>}
            />
          )}
        </section>
      )}
      {(tab === "outfits" || window.innerWidth > 760) && (
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">OUTFITS DEL VIAJE</p>
              <h2>Un look por día o por momento</h2>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setPlannedEditing(undefined);
                setSeedDate(currentTrip.startDate);
                setPlannedOpen(true);
              }}
            >
              <Plus /> Planificar outfit
            </Button>
          </div>
          <div className="trip-day-grid">
            {groupedPlanned.map((day) => (
              <div className="trip-day-card" key={day.date}>
                <header>
                  <div>
                    <b>{dayLabel(day.date)}</b>
                    <small>{dateFmt(day.date)}</small>
                  </div>
                  {day.weather && (
                    <span>
                      {Math.round(day.weather.temperatureMin)}–{Math.round(day.weather.temperatureMax)}°C
                    </span>
                  )}
                </header>
                {day.outfits.length ? (
                  <div className="trip-planned-list">
                    {day.outfits.map((planned) => (
                      <button
                        className="trip-planned-row"
                        key={planned.id}
                        onClick={() => {
                          setPlannedEditing(planned);
                          setSeedDate(planned.date);
                          setPlannedOpen(true);
                        }}
                      >
                        <div className="trip-planned-thumbs">
                          {planned.clothingItemIds.slice(0, 3).map((itemId) => {
                            const item = d.items.find((entry) => entry.id === itemId);
                            return item ? <ItemThumb key={itemId} item={item} /> : null;
                          })}
                        </div>
                        <span>
                          <b>{planned.eventLabel || "Look del día"}</b>
                          <small>{planned.notes || `${planned.clothingItemIds.length} prendas`}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    className="empty-rail"
                    onClick={() => {
                      setPlannedEditing(undefined);
                      setSeedDate(day.date);
                      setPlannedOpen(true);
                    }}
                  >
                    <Plus /> Añadir outfit para este día
                  </button>
                )}
              </div>
            ))}
          </div>
          {!!manualPlanned.length && (
            <div className="trip-manual-planned">
              <p className="eyebrow">MOMENTOS SIN DÍA FIJO</p>
              <div className="trip-planned-list">
                {manualPlanned.map((planned) => (
                  <button
                    className="trip-planned-row"
                    key={planned.id}
                    onClick={() => {
                      setPlannedEditing(planned);
                      setSeedDate(undefined);
                      setPlannedOpen(true);
                    }}
                  >
                    <div className="trip-planned-thumbs">
                      {planned.clothingItemIds.slice(0, 3).map((itemId) => {
                        const item = d.items.find((entry) => entry.id === itemId);
                        return item ? <ItemThumb key={itemId} item={item} /> : null;
                      })}
                    </div>
                    <span>
                      <b>{planned.eventLabel || "Sin fecha concreta"}</b>
                      <small>{planned.notes || `${planned.clothingItemIds.length} prendas`}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      {tripOpen && <TripModal trip={currentTrip} close={() => setTripOpen(false)} />}
      {packingOpen && (
        <TripPackingModal
          tripId={currentTrip.id}
          data={d}
          item={packingEditing}
          close={() => {
            setPackingOpen(false);
            setPackingEditing(undefined);
          }}
        />
      )}
      {plannedOpen && (
        <TripPlannedOutfitModal
          trip={currentTrip}
          data={d}
          planned={plannedEditing}
          seedDate={seedDate}
          close={() => {
            setPlannedOpen(false);
            setPlannedEditing(undefined);
            setSeedDate(undefined);
          }}
        />
      )}
    </>
  );
}

function RecommendationCard({
  recommendation,
  onRefresh,
  onSave,
  onWear,
}: {
  recommendation: RecommendedLook;
  onRefresh: () => void;
  onSave: () => void;
  onWear: () => void;
}) {
  return (
    <article className="context-card">
      <header>
        <div>
          <p className="eyebrow">
            {dayLabel(recommendation.context.date)} · {recommendation.context.moment.toUpperCase()}
          </p>
          <h3>{recommendation.context.title}</h3>
          <small>{recommendation.context.subtitle}</small>
        </div>
        <span className="confidence">
          {recommendation.source === "outfit" ? "Outfit" : "Look"}
        </span>
      </header>
      <p className="context-weather">{recommendation.weatherLine}</p>
      <div className="recommendation-strip">
        {recommendation.items.map((item) => (
          <NavLink to={`/prenda/${item.id}`} key={item.id}>
            <ItemThumb item={item} />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </div>
      <div className="context-reasons">
        {recommendation.reasons.slice(0, 2).map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
      </div>
      <div className="context-actions">
        <button onClick={onSave}>Guardar como outfit</button>
        <button onClick={onWear}>Marcar como usado</button>
        <button onClick={onRefresh}>Cambiar una prenda</button>
      </div>
    </article>
  );
}

function WhatToWearPage() {
  const d = useData();
  const [locationId, setLocationId] = useState(getDefaultWeatherLocation(d.weatherLocations).id),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState(""),
    [locationOpen, setLocationOpen] = useState(false),
    [eventOpen, setEventOpen] = useState(false),
    [editingEvent, setEditingEvent] = useState<WardrobeEvent | undefined>(),
    [variants, setVariants] = useState<Record<string, number>>({});
  const location =
    d.weatherLocations.find((entry) => entry.id === locationId) ||
    getDefaultWeatherLocation(d.weatherLocations);
  const locationOptions = d.weatherLocations.length ? d.weatherLocations : [location];
  const forecast = cachedForecast(d.weatherCache, location.id, 4);
  const days = nextDates(4).map((date) => ({
    date,
    weather: forecast.find((entry) => entry.date === date),
    contexts: contextsForDate(date, d),
  }));
  const upcomingEvents = [...d.wardrobeEvents]
    .filter((event) => event.date >= today())
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startTime || "12:00").localeCompare(b.startTime || "12:00"),
    )
    .slice(0, 6);

  useEffect(() => {
    if (!d.weatherLocations.find((entry) => entry.id === locationId)) {
      setLocationId(getDefaultWeatherLocation(d.weatherLocations).id);
    }
  }, [d.weatherLocations, locationId]);

  useEffect(() => {
    if (!location?.id || !weatherNeedsRefresh(d.weatherCache, location.id, 4)) return;
    setRefreshing(true);
    setError("");
    refreshWeather(location, 5)
      .catch(() => setError("No hemos podido actualizar el clima ahora mismo."))
      .finally(() => setRefreshing(false));
  }, [d.weatherCache, location]);

  async function manualRefresh() {
    setRefreshing(true);
    setError("");
    try {
      await refreshWeather(location, 5);
    } catch {
      setError("No hemos podido actualizar el clima ahora mismo.");
    } finally {
      setRefreshing(false);
    }
  }

  async function saveRecommendation(recommendation: RecommendedLook) {
    const stamp = now();
    await db.outfits.add({
      id: uid(),
      name: `${dayLabel(recommendation.context.date)} · ${recommendation.context.title}`,
      clothingItemIds: recommendation.items.map((item) => item.id),
      occasion: recommendation.context.title,
      season: [
        ...new Set(recommendation.items.flatMap((item) => item.season || [])),
      ],
      notes: recommendation.reasons.join(" "),
      favorite: false,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }

  async function markRecommendationUsed(recommendation: RecommendedLook) {
    await db.wearLogs.add({
      id: uid(),
      clothingItemIds: recommendation.items.map((item) => item.id),
      outfitId: recommendation.outfitId,
      date: recommendation.context.date,
      notes: `Recomendación: ${recommendation.context.title}`,
    });
  }

  return (
    <>
      <PageHead eyebrow="CLIMA + AGENDA + ARMARIO" title="Qué ponerme">
        <div className="actions">
          <Button variant="secondary" onClick={() => setLocationOpen(true)}>
            <MapPin /> Ubicaciones
          </Button>
          <Button variant="secondary" onClick={() => {
            setEditingEvent(undefined);
            setEventOpen(true);
          }}>
            <Plus /> Nuevo evento
          </Button>
          <Button onClick={manualRefresh} disabled={refreshing}>
            <RefreshCw /> {refreshing ? "Actualizando..." : "Actualizar clima"}
          </Button>
        </div>
      </PageHead>
      <section className="panel context-hero">
        <div>
          <p className="eyebrow">UBICACIÓN ACTIVA</p>
          <h2>
            {forecast[0] && (() => {
              const visual = weatherVisual(forecast[0]);
              const Icon = visual.Icon;
              return <Icon />;
            })()}
            {location.name}
          </h2>
          <p className="muted">
            {forecast[0]
              ? `${Math.round(forecast[0].temperatureMin)}–${Math.round(forecast[0].temperatureMax)}°C · ${forecast[0].description} · ${weatherVisual(forecast[0]).hint}`
              : "En cuanto tengamos clima descargado afinaremos mejor las recomendaciones."}
          </p>
        </div>
        <div className="inline-input">
          <select value={location.id} onChange={(e) => setLocationId(e.target.value)}>
            {locationOptions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
      </section>
      {error && <p className="form-error">{error}</p>}
      <div className="context-day-stack">
        {days.map((day) => (
          <section className="panel" key={day.date}>
            <div className="section-title">
              <div>
                <p className="eyebrow">{dayLabel(day.date).toUpperCase()}</p>
                <h2>{dateFmt(day.date)}</h2>
              </div>
              <small className="muted" style={{ margin: 0 }}>
                {day.weather ? (
                  <span className="weather-mini">
                    {(() => {
                      const visual = weatherVisual(day.weather);
                      const Icon = visual.Icon;
                      return <Icon />;
                    })()}
                    {`${Math.round(day.weather.temperatureMin)}–${Math.round(day.weather.temperatureMax)}°C · ${day.weather.description}`}
                  </span>
                ) : (
                  "Sin clima descargado"
                )}
              </small>
            </div>
            <div className="recommendation-grid">
              {day.contexts
                .map((context) =>
                  buildRecommendation(
                    d,
                    context,
                    day.weather,
                    variants[context.id] || 0,
                  ),
                )
                .filter(Boolean)
                .map((recommendation) => (
                  <RecommendationCard
                    key={recommendation!.id}
                    recommendation={recommendation!}
                    onRefresh={() =>
                      setVariants((current) => ({
                        ...current,
                        [recommendation!.id]: (current[recommendation!.id] || 0) + 1,
                      }))
                    }
                    onSave={() => saveRecommendation(recommendation!)}
                    onWear={() => markRecommendationUsed(recommendation!)}
                  />
                ))}
            </div>
          </section>
        ))}
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">PRÓXIMOS EVENTOS</p>
              <h2>Tu calendario interno</h2>
            </div>
            <button
              className="icon-btn"
              onClick={() => {
                setEditingEvent(undefined);
                setEventOpen(true);
              }}
            >
              <Plus />
            </button>
          </div>
          {upcomingEvents.length ? (
            <div className="space-list">
              {upcomingEvents.map((event) => (
                <div className="space-list-row" key={event.id}>
                  <div>
                    <b>{event.title}</b>
                    <small>
                      {dateFmt(event.date)} · {eventSummary(event)}
                      {event.dressCode ? ` · ${dressCodeLabels[event.dressCode]}` : ""}
                    </small>
                  </div>
                  <div className="row">
                    <button
                      onClick={() => {
                        setEditingEvent(event);
                        setEventOpen(true);
                      }}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Todavía no hay eventos"
              text="Añade cenas, trabajo, fiestas o planes para que el recomendador entienda mejor el contexto."
              action={<Button onClick={() => setEventOpen(true)}>Crear primer evento</Button>}
            />
          )}
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">RUTINA SEMANAL</p>
              <h2>Qué días trabajas y cómo se reparte tu semana</h2>
            </div>
            <NavLink to="/ajustes">Editar en Ajustes</NavLink>
          </div>
          <div className="routine-list">
            {weekdayOrder.map((day) => {
              const routine = d.userRoutines.find((entry) => entry.dayOfWeek === day);
              return (
                <div className="routine-row" key={day}>
                  <b>{weekdayNames[day]}</b>
                  <span>{routineSummary(routine)}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      {locationOpen && (
        <LocationManagerModal
          locations={locationOptions}
          selectedId={location.id}
          onSelect={(id) => {
            setLocationId(id);
            setLocationOpen(false);
          }}
          close={() => setLocationOpen(false)}
        />
      )}
      {eventOpen && (
        <EventModal
          event={editingEvent}
          close={() => {
            setEventOpen(false);
            setEditingEvent(undefined);
          }}
        />
      )}
    </>
  );
}

function Outfits() {
  const d = useData(),
    n = useNavigate(),
    [editOpen, setEditOpen] = useState<Outfit | true | false>(false),
    [detailOpen, setDetailOpen] = useState<Outfit | undefined>(),
    [wearOpen, setWearOpen] = useState<Outfit | undefined>();
  return (
    <>
      <PageHead eyebrow={`${d.outfits.length} COMBINACIONES`} title="Outfits">
        <Button onClick={() => n("/outfits/crear")}>
          <Plus /> Componer look
        </Button>
      </PageHead>
      {d.outfits.length ? (
        <div className="outfit-grid">
          {d.outfits.map((o) => (
            <article className="outfit" key={o.id}>
              <button className="outfit-open" onClick={() => setDetailOpen(o)}>
                <div className="outfit-collage">
                  {(o.wornPhoto || o.wornPhotos?.[0]) && (
                    <img
                      className="worn-preview"
                      src={o.wornPhoto || o.wornPhotos?.[0]}
                      alt=""
                    />
                  )}
                {o.clothingItemIds.slice(0, 3).map((id) => {
                  const i = d.items.find((x) => x.id === id);
                  return i && <ItemThumb key={id} item={i} />;
                })}
                </div>
              </button>
              <div>
                <span className="eyebrow">{o.occasion || "COMBINACIÓN"}</span>
                <h3>
                  {o.name} {o.favorite && <Heart className="filled" />}
                </h3>
                <p>
                  {o.clothingItemIds.length} prendas · {o.season.join(", ")}
                </p>
                <div className="outfit-status">
                  {(o.wornPhoto || o.wornPhotos?.length) && <span>Foto real</span>}
                  {o.lastWornAt && <span>Probado</span>}
                  {o.fitRating && <span>Queda {o.fitRating}/5</span>}
                </div>
                <div className="row">
                  <Button onClick={() => setWearOpen(o)}>Usar hoy</Button>
                  <Button variant="ghost" onClick={() => setDetailOpen(o)}>
                    <Camera />
                  </Button>
                  <Button variant="ghost" onClick={() => setEditOpen(o)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      confirm("¿Eliminar este outfit?") &&
                      softDeleteRecords("outfits", [o.id])
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Tus combinaciones vivirán aquí"
          text="Crea un outfit con prendas de tu armario y registra todos sus usos de una vez."
          action={<Button onClick={() => n("/outfits/crear")}>Componer primer look</Button>}
        />
      )}{" "}
      {detailOpen && (
        <OutfitDetailModal
          data={d}
          outfit={detailOpen}
          close={() => setDetailOpen(undefined)}
          onEdit={() => {
            setEditOpen(detailOpen);
            setDetailOpen(undefined);
          }}
          onWear={() => {
            setWearOpen(detailOpen);
            setDetailOpen(undefined);
          }}
        />
      )}
      {wearOpen && (
        <OutfitWearModal
          outfit={wearOpen}
          close={() => setWearOpen(undefined)}
        />
      )}
      {editOpen && (
        <OutfitModal
          data={d}
          outfit={editOpen === true ? undefined : editOpen}
          close={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

function RatingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number | "";
  onChange: (value: 1 | 2 | 3 | 4 | 5 | undefined) => void;
}) {
  return (
    <div className="rating-field">
      <span>{label}</span>
      <div>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            type="button"
            key={rating}
            className={value === rating ? "active" : ""}
            onClick={() =>
              onChange(value === rating ? undefined : (rating as 1 | 2 | 3 | 4 | 5))
            }
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );
}

function OutfitRealPhotos({
  outfit,
  onAdd,
}: {
  outfit: Outfit;
  onAdd: (files?: FileList | null) => void;
}) {
  const photos = Array.from(
    new Set([...(outfit.wornPhotos || []), outfit.wornPhoto || ""].filter(Boolean)),
  );
  return (
    <div className="worn-gallery">
      {photos.length ? (
        photos.map((photo, index) => (
          <img key={`${photo.slice(0, 24)}-${index}`} src={photo} alt="" />
        ))
      ) : (
        <label className="worn-upload">
          <Camera />
          <span>Añadir foto llevándolo puesto</span>
          <input
            hidden
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onAdd(e.target.files)}
          />
        </label>
      )}
      {!!photos.length && (
        <label className="worn-add">
          <Plus />
          <input
            hidden
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onAdd(e.target.files)}
          />
        </label>
      )}
    </div>
  );
}

function OutfitDetailModal({
  data,
  outfit,
  close,
  onEdit,
  onWear,
}: {
  data: Data;
  outfit: Outfit;
  close: () => void;
  onEdit: () => void;
  onWear: () => void;
}) {
  const current = data.outfits.find((entry) => entry.id === outfit.id) || outfit;
  const outfitItems = current.clothingItemIds
    .map((id) => data.items.find((item) => item.id === id))
    .filter(Boolean) as ClothingItem[];

  async function addPhotos(files?: FileList | null) {
    const photos = await compressImages(files || undefined);
    if (!photos.length) return;
    const nextPhotos = [...(current.wornPhotos || []), ...photos];
    await db.outfits.update(current.id, {
      wornPhoto: current.wornPhoto || nextPhotos[0],
      wornPhotos: nextPhotos,
      imageUpdatedAt: now(),
      updatedAt: now(),
    });
  }

  async function update(changes: Partial<Outfit>) {
    await db.outfits.update(current.id, {
      ...changes,
      updatedAt: now(),
    });
  }

  return (
    <Modal title={current.name} onClose={close} wide>
      <div className="outfit-detail-layout">
        <section>
          <p className="eyebrow">OUTFIT COMPUESTO</p>
          <div className="outfit-detail-collage">
            {outfitItems.map((item) => (
              <NavLink to={`/prenda/${item.id}`} key={item.id}>
                <ItemThumb item={item} />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </div>
          <div className="context-actions">
            <button onClick={onWear}>Usar hoy</button>
            <button onClick={onEdit}>Editar outfit</button>
          </div>
        </section>
        <section>
          <p className="eyebrow">LOOK REAL</p>
          <OutfitRealPhotos outfit={current} onAdd={addPhotos} />
          <div className="rating-panel">
            <RatingField
              label="Qué tal te queda"
              value={current.fitRating || ""}
              onChange={(value) => update({ fitRating: value })}
            />
            <RatingField
              label="Cómo te sientes"
              value={current.confidenceRating || ""}
              onChange={(value) => update({ confidenceRating: value })}
            />
          </div>
          <label className="after-notes">
            Notas después de llevarlo
            <textarea
              value={current.notesAfterWearing || ""}
              onChange={(e) =>
                update({ notesAfterWearing: e.target.value || undefined })
              }
              placeholder="Qué funcionó, qué cambiarías, cuándo repetirlo..."
            />
          </label>
          <div className="detail-badges">
            {current.lastWornAt && <span>Último uso: {dateFmt(current.lastWornAt)}</span>}
            {current.favorite && <span>Favorito</span>}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function OutfitWearModal({
  outfit,
  close,
}: {
  outfit: Outfit;
  close: () => void;
}) {
  const [photos, setPhotos] = useState<string[]>([]),
    [fitRating, setFitRating] = useState<1 | 2 | 3 | 4 | 5 | undefined>(outfit.fitRating),
    [confidenceRating, setConfidenceRating] = useState<1 | 2 | 3 | 4 | 5 | undefined>(outfit.confidenceRating),
    [notes, setNotes] = useState(outfit.notesAfterWearing || ""),
    [busy, setBusy] = useState(false);

  async function loadPhotos(files?: FileList | null) {
    setBusy(true);
    try {
      const compressed = await compressImages(files || undefined);
      setPhotos((current) => [...current, ...compressed]);
    } finally {
      setBusy(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const stamp = now();
    await db.transaction("rw", [db.wearLogs, db.outfits], async () => {
      await db.wearLogs.add({
        id: uid(),
        clothingItemIds: outfit.clothingItemIds,
        outfitId: outfit.id,
        date: today(),
        notes: notes || undefined,
        createdAt: stamp,
        updatedAt: stamp,
      });
      const nextPhotos = [...(outfit.wornPhotos || []), ...photos];
      await db.outfits.update(outfit.id, {
        wornPhoto: outfit.wornPhoto || nextPhotos[0],
        wornPhotos: nextPhotos.length ? nextPhotos : outfit.wornPhotos,
        fitRating,
        confidenceRating,
        notesAfterWearing: notes || undefined,
        lastWornAt: today(),
        imageUpdatedAt: photos.length ? stamp : outfit.imageUpdatedAt,
        updatedAt: stamp,
      });
    });
    close();
  }

  return (
    <Modal title="Usar outfit hoy" onClose={close} wide>
      <form className="modal-form" onSubmit={save}>
        <label className="full image-upload">
          {photos.length ? (
            <div className="worn-upload-preview">
              {photos.map((photo, index) => (
                <img key={`${photo.slice(0, 24)}-${index}`} src={photo} />
              ))}
            </div>
          ) : (
            <>
              <Camera />
              <span>Subir foto del look puesto</span>
            </>
          )}
          <input
            hidden
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => loadPhotos(e.target.files)}
          />
        </label>
        <div className="full rating-panel">
          <RatingField
            label="Qué tal te queda"
            value={fitRating || ""}
            onChange={setFitRating}
          />
          <RatingField
            label="Cómo te sientes con este look"
            value={confidenceRating || ""}
            onChange={setConfidenceRating}
          />
        </div>
        <label className="full">
          Nota después de llevarlo
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Qué te gustó, qué cambiarías, cuándo repetirlo..."
          />
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button disabled={busy}>{busy ? "Preparando foto..." : "Guardar uso"}</Button>
        </div>
      </form>
    </Modal>
  );
}

type OutfitZone = "top" | "middle" | "shoes";
const zoneMeta: Record<OutfitZone, { label: string; hint: string }> = {
  top: { label: "Arriba", hint: "Tops, camisas y capas" },
  middle: { label: "En medio", hint: "Pantalones, faldas y shorts" },
  shoes: { label: "Abajo", hint: "Zapatos, botas y sandalias" },
};
function outfitZone(item: ClothingItem): OutfitZone | undefined {
  const value = `${item.category} ${item.subcategory || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/zapato|zapatilla|bota|sandalia|mocasin|tacon|calzado/.test(value))
    return "shoes";
  if (/pantalon|vaquero|falda|short|bermuda|legging/.test(value))
    return "middle";
  if (/top|camisa|camiseta|jersey|blusa|chaqueta|abrigo|sudadera/.test(value))
    return "top";
  return undefined;
}
function OutfitBuilder() {
  const d = useData(),
    n = useNavigate(),
    [selected, setSelected] = useState<Partial<Record<OutfitZone, string>>>({}),
    [name, setName] = useState(`Look ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date())}`),
    [occasion, setOccasion] = useState(""),
    [seasons, setSeasons] = useState<string[]>([]),
    [notes, setNotes] = useState(""),
    [favorite, setFavorite] = useState(false),
    [details, setDetails] = useState(false);
  const items = d.items.filter((i) => !i.isArchived);
  const byZone = (zone: OutfitZone) => items.filter((i) => outfitZone(i) === zone);
  const chosen = (["top", "middle", "shoes"] as OutfitZone[])
    .map((z) => items.find((i) => i.id === selected[z]))
    .filter(Boolean) as ClothingItem[];
  function shuffle() {
    const next: Partial<Record<OutfitZone, string>> = {};
    (["top", "middle", "shoes"] as OutfitZone[]).forEach((zone) => {
      const list = byZone(zone);
      if (list.length) next[zone] = list[Math.floor(Math.random() * list.length)].id;
    });
    setSelected(next);
  }
  async function save() {
    if (!chosen.length || !name.trim()) return;
    const stamp = now();
    const id = uid();
    await db.outfits.add({
      id,
      name: name.trim(),
      clothingItemIds: chosen.map((i) => i.id),
      occasion: occasion || undefined,
      season: seasons,
      notes: notes || undefined,
      favorite,
      createdAt: stamp,
      updatedAt: stamp,
    });
    n("/outfits");
  }
  return (
    <div className="builder-page">
      <header className="builder-head">
        <button className="icon-btn" onClick={() => n(-1)} aria-label="Volver">
          <ChevronLeft />
        </button>
        <div>
          <p className="eyebrow">MODO OUTFIT</p>
          <h1>Compón tu look</h1>
        </div>
        <button className="shuffle" onClick={shuffle}>
          <Shuffle /> <span>Mezclar</span>
        </button>
      </header>
      <div className="builder-layout">
        <aside className="look-preview">
          <div className="preview-label">
            <span>Vista del look</span>
            <b>{chosen.length}/3</b>
          </div>
          <div className="preview-stack">
            {(["top", "middle", "shoes"] as OutfitZone[]).map((zone) => {
              const item = items.find((i) => i.id === selected[zone]);
              return (
                <div className={`preview-slot ${zone} ${item ? "filled" : ""}`} key={zone}>
                  {item ? (
                    <>
                      <ItemThumb item={item} />
                      <button
                        onClick={() => setSelected((s) => ({ ...s, [zone]: undefined }))}
                        aria-label={`Quitar ${item.name}`}
                      >
                        <X />
                      </button>
                    </>
                  ) : (
                    <span>{zoneMeta[zone].label}</span>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
        <div className="outfit-rails">
          {(["top", "middle", "shoes"] as OutfitZone[]).map((zone) => {
            const list = byZone(zone);
            return (
              <section className="outfit-rail" key={zone}>
                <header>
                  <div>
                    <p>{zoneMeta[zone].label}</p>
                    <span>{zoneMeta[zone].hint}</span>
                  </div>
                  <b>{list.length}</b>
                </header>
                {list.length ? (
                  <div className="rail-track">
                    {list.map((item) => (
                      <button
                        className={selected[zone] === item.id ? "selected" : ""}
                        onClick={() => setSelected((s) => ({ ...s, [zone]: item.id }))}
                        key={item.id}
                      >
                        <ItemThumb item={item} />
                        <span>{item.name}</span>
                        <i><Check /></i>
                      </button>
                    ))}
                  </div>
                ) : (
                  <NavLink className="empty-rail" to="/prenda/nueva">
                    <Plus /> No tienes prendas para esta zona. Añadir una
                  </NavLink>
                )}
              </section>
            );
          })}
        </div>
      </div>
      <section className={`builder-details ${details ? "open" : ""}`}>
        <button className="details-toggle" onClick={() => setDetails((x) => !x)}>
          <span><b>{name}</b><small>{occasion || "Añade los detalles del look"}</small></span>
          <Pencil />
        </button>
        {details && (
          <div className="details-fields">
            <label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Ocasión<select value={occasion} onChange={(e) => setOccasion(e.target.value)}><option value="">Sin indicar</option>{d.settings.occasions.map((x) => <option key={x}>{x}</option>)}</select></label>
            <div className="full"><span className="field-label">Temporada</span><div className="chips">{d.settings.seasons.map((x) => <button className={seasons.includes(x) ? "selected" : ""} onClick={() => setSeasons((s) => s.includes(x) ? s.filter((v) => v !== x) : [...s, x])} key={x}>{x}</button>)}</div></div>
            <label className="full">Notas<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ideas para combinarlo, ocasión..." /></label>
          </div>
        )}
      </section>
      <div className="builder-actions">
        <button className={`favorite-toggle ${favorite ? "active" : ""}`} onClick={() => setFavorite((x) => !x)} aria-label="Marcar favorito"><Heart /></button>
        <button className="clear-look" onClick={() => setSelected({})} disabled={!chosen.length}>Limpiar</button>
        <Button onClick={save} disabled={!chosen.length || !name.trim()}>Guardar outfit <span>{chosen.length}/3</span></Button>
      </div>
    </div>
  );
}

function OutfitModal({
  data,
  outfit,
  close,
}: {
  data: Data;
  outfit?: Outfit;
  close: () => void;
}) {
  const [name, setName] = useState(outfit?.name || ""),
    [occasion, setOcc] = useState(outfit?.occasion || ""),
    [ids, setIds] = useState<string[]>(outfit?.clothingItemIds || []),
    [fav, setFav] = useState(outfit?.favorite || false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name || !ids.length) return;
    const t = now();
    await db.outfits.put({
      ...outfit,
      id: outfit?.id || uid(),
      name,
      clothingItemIds: ids,
      occasion,
      season: outfit?.season || [],
      favorite: fav,
      createdAt: outfit?.createdAt || t,
      updatedAt: t,
    });
    close();
  }
  return (
    <Modal
      title={outfit ? "Editar outfit" : "Crear outfit"}
      onClose={close}
      wide
    >
      <form onSubmit={save} className="modal-form">
        <label>
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Ej. Cena de verano"
          />
        </label>
        <label>
          Ocasión
          <select value={occasion} onChange={(e) => setOcc(e.target.value)}>
            <option value="">Sin indicar</option>
            {data.settings.occasions.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={fav}
            onChange={(e) => setFav(e.target.checked)}
          />{" "}
          Marcar como favorito
        </label>
        <div className="full">
          <p className="field-label">Selecciona prendas ({ids.length})</p>
          <div className="picker">
            {data.items.map((i) => (
              <button
                type="button"
                className={ids.includes(i.id) ? "picked" : ""}
                onClick={() =>
                  setIds((x) =>
                    x.includes(i.id)
                      ? x.filter((y) => y !== i.id)
                      : [...x, i.id],
                  )
                }
                key={i.id}
              >
                <ItemThumb item={i} />
                <span>{i.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={close}>
            Cancelar
          </Button>
          <Button disabled={!name || !ids.length}>Guardar outfit</Button>
        </div>
      </form>
    </Modal>
  );
}

function Decisions() {
  const d = useData(),
    groups = ["sell", "donate", "repair", "maybe"] as DecisionStatus[],
    [active, setActive] = useState<DecisionStatus>("sell"),
    list = d.items.filter((i) => i.decisionStatus === active),
    total = groups.reduce(
      (n, k) => n + d.items.filter((i) => i.decisionStatus === k).length,
      0,
    );
  return (
    <>
      <PageHead eyebrow={`${total} PARA REVISAR`} title="Decisiones" />
      <p className="lead">
        Un espacio para decidir con calma qué se queda y qué puede seguir su
        camino.
      </p>
      <div className="decision-tabs">
        {groups.map((k) => (
          <button
            className={active === k ? "active" : ""}
            onClick={() => setActive(k)}
            key={k}
          >
            <span className={`dot ${k}`} />
            {decisions[k]}
            <b>{d.items.filter((i) => i.decisionStatus === k).length}</b>
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="decision-board">
          {list.map((i) => (
            <NavLink to={`/prenda/${i.id}`} key={i.id}>
              <div>
                <ItemThumb item={i} />
                {active === "sell" && (
                  <em>
                    {i.vintedStatus === "listed"
                      ? "Subida"
                      : i.vintedStatus === "sold"
                        ? "Vendida"
                        : "No subida"}
                  </em>
                )}
              </div>
              <span>
                <b>{i.name}</b>
                <small>
                  {i.category}
                  {i.estimatedValue ? ` · ${money(i.estimatedValue)}` : ""}
                </small>
              </span>
            </NavLink>
          ))}
        </div>
      ) : (
        <div className="context-empty">
          <Archive />
          <div>
            <h2>Nada en “{decisions[active]}”</h2>
            <p>Las prendas que marques con esta decisión aparecerán aquí.</p>
          </div>
          <NavLink to="/armario">Explorar armario</NavLink>
        </div>
      )}
    </>
  );
}

function SmartReviewPage() {
  const d = useData(),
    smart = buildSmartInsights(d);
  async function applyAction(
    ids: string[] | undefined,
    action: DecisionStatus | "review_later" | undefined,
  ) {
    if (!ids?.length || !action) return;
    if (action === "review_later") {
      await db.clothingItems.bulkUpdate(
        ids.map((id) => ({
          key: id,
          changes: {
            decisionStatus: "maybe",
            tags: Array.from(
              new Set([
                ...(d.items.find((item) => item.id === id)?.tags || []),
                "revisar",
              ]),
            ),
            updatedAt: now(),
          },
        })),
      );
      return;
    }
    await db.clothingItems.bulkUpdate(
      ids.map((id) => ({
        key: id,
        changes: {
          decisionStatus: action,
          updatedAt: now(),
        },
      })),
    );
  }
  const wishlistAdvice = d.wishlist
    .filter((wish) => wish.status === "pending")
    .map((wish) => ({
      wish,
      advice: wishlistAdviceText(wish, d),
    }));
  return (
    <>
      <PageHead
        eyebrow={`${smart.insights.length} INSIGHTS LOCALES`}
        title="Revisión inteligente"
      >
        <Button variant="secondary" onClick={() => window.location.hash = "#/armario"}>
          <Shirt /> Ver armario
        </Button>
      </PageHead>
      <div className="utility-links">
        <NavLink to="/wishlist">
          <Heart /> Wishlist inteligente
        </NavLink>
        <NavLink to="/decisiones">
          <Archive /> Decisiones
        </NavLink>
      </div>
      {smart.insights.length ? (
        <div className="insight-grid">
          {smart.insights.map((insight) => (
            <section className="panel insight-card" key={insight.id}>
              <div className="section-title">
                <div>
                  <p className="eyebrow">{insight.kind.toUpperCase()}</p>
                  <h2>{insight.title}</h2>
                </div>
                <span className={`confidence ${insight.confidence}`}>
                  {insight.confidence}
                </span>
              </div>
              <p className="muted">{insight.explanation}</p>
              {insight.itemIds?.length ? (
                <div className="mini-items">
                  {insight.itemIds.slice(0, 4).map((id) => {
                    const item = d.items.find((entry) => entry.id === id);
                    return item ? (
                      <NavLink to={`/prenda/${item.id}`} key={item.id}>
                        <ItemThumb item={item} />
                        <span>
                          {item.name}
                          <small>
                            {decisions[item.decisionStatus]} · {item.category}
                          </small>
                        </span>
                      </NavLink>
                    ) : null;
                  })}
                </div>
              ) : null}
              <div className="resale-actions">
                {insight.action && (
                  <button onClick={() => applyAction(insight.itemIds, insight.action)}>
                    {insight.action === "sell"
                      ? "Marcar para vender"
                      : insight.action === "donate"
                        ? "Marcar para donar"
                        : insight.action === "keep"
                          ? "Conservar"
                          : "Revisar después"}
                  </button>
                )}
                {insight.itemIds?.[0] && (
                  <button
                    onClick={() =>
                      (window.location.hash = `#/prenda/${insight.itemIds?.[0]}`)
                    }
                  >
                    Abrir prenda
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty
          title="Aún faltan señales para afinar"
          text="Cuando empieces a revisar prendas y registrar algo más de contexto, aparecerán aquí sugerencias útiles."
        />
      )}
      <div className="two-col">
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">CATEGORÍAS</p>
              <h2>Dónde merece la pena mirar</h2>
            </div>
          </div>
          <div className="space-list">
            {Array.from(
              new Set(
                d.items.filter((item) => !item.isArchived).map((item) => item.category),
              ),
            )
              .slice(0, 8)
              .map((category) => {
                const items = d.items.filter(
                  (item) => !item.isArchived && item.category === category,
                );
                const uses = d.wears.filter((wear) =>
                  wear.clothingItemIds.some(
                    (id) => d.items.find((item) => item.id === id)?.category === category,
                  ),
                ).length;
                const lowRated = items.filter(
                  (item) =>
                    average([
                      item.currentLoveLevel || 0,
                      item.currentFitLevel || 0,
                      item.currentStyleMatch || 0,
                    ]) <= 2 && item.currentLoveLevel,
                ).length;
                return (
                  <div className="space-list-row" key={category}>
                    <div>
                      <b>{category}</b>
                      <small>
                        {items.length} prendas · {uses} usos recientes · {lowRated} con valoración baja
                      </small>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">WISHLIST INTELIGENTE</p>
              <h2>Comprar mejor, con más contexto</h2>
            </div>
          </div>
          {wishlistAdvice.length ? (
            <div className="space-list">
              {wishlistAdvice.map(({ wish, advice }) => (
                <div className="space-list-row" key={wish.id}>
                  <div>
                    <b>{wish.name}</b>
                    <small>{advice.text}</small>
                  </div>
                  <span>{advice.advice}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Tu wishlist está tranquila"
              text="Cuando añadas deseos, aquí aparecerá contexto para comprar con más criterio."
            />
          )}
        </section>
      </div>
    </>
  );
}

function Balance() {
  const d = useData(),
    [purchase, setPurchase] = useState<PurchaseOrder | true | false>(false),
    [sale, setSale] = useState<SaleRecord | true | false>(false),
    tabState = useState<"summary" | "purchases" | "sales">("summary"),
    [tab, setTab] = tabState;
  const spend = d.orders.reduce((a, o) => a + o.totalCost, 0),
    income = d.sales.reduce(
      (a, s) => a + (s.netProfit ?? s.salePrice - (s.fees || 0)),
      0,
    ),
    soldListings = d.resaleListings.filter((x) => x.status === "sold"),
    avgSoldPrice = soldListings.length
      ? soldListings.reduce((sum, listing) => sum + (listing.soldPrice || 0), 0) /
        soldListings.length
      : 0,
    m = currentMonth(),
    mi = d.orders
      .filter((o) => month(o.date) === m)
      .reduce((a, o) => a + o.clothingItemIds.length, 0),
    mo = d.exits.filter((x) => month(x.date) === m).length;
  return (
    <>
      <PageHead eyebrow="COMPRAS Y VENTAS" title="El balance de tu armario">
        <div className="split-actions">
          <Button variant="secondary" onClick={() => setPurchase(true)}>
            <PackagePlus /> Nueva compra
          </Button>
          <Button onClick={() => setSale(true)}>
            <CircleDollarSign /> Registrar venta
          </Button>
        </div>
      </PageHead>
      <div className="utility-links">
        <NavLink to="/salidas"><Archive /> Otras salidas</NavLink>
        <NavLink to="/plan-venta"><Store /> Plan de venta</NavLink>
        <NavLink to="/wishlist"><Heart /> Wishlist ({d.wishlist.filter((w) => w.status === "pending").length})</NavLink>
        <NavLink to="/pedidos"><PackagePlus /> Prendas desde pedidos</NavLink>
      </div>
      <div className="tabs">
        <button
          className={tab === "summary" ? "active" : ""}
          onClick={() => setTab("summary")}
        >
          Resumen
        </button>
        <button
          className={tab === "purchases" ? "active" : ""}
          onClick={() => setTab("purchases")}
        >
          Compras
        </button>
        <button
          className={tab === "sales" ? "active" : ""}
          onClick={() => setTab("sales")}
        >
          Ventas
        </button>
      </div>
      {tab === "summary" && (
        <>
          <div className="stat-grid">
            <Stat label="Gasto total" value={money(spend)} />
            <Stat label="Ganado en ventas" value={money(income)} />
            <Stat label="Balance neto" value={money(income - spend)} />
            <Stat label="Precio medio venta" value={soldListings.length ? money(avgSoldPrice) : "—"} />
          </div>
          <section className="one-in">
            <div>
              <p className="eyebrow">SI ALGO ENTRA, ALGO SALE</p>
              <h2>
                {mi === mo
                  ? "Este mes tu armario está equilibrado"
                  : mi > mo
                    ? `Podrías dar salida a ${mi - mo} prendas`
                    : "Han salido más prendas de las que entraron"}
              </h2>
              <p>
                Este mes han entrado {mi} prendas y han salido {mo}.
              </p>
            </div>
            <div className="inout">
              <span>
                <b>{mi}</b>Entradas
              </span>
              <i />
              <span>
                <b>{mo}</b>Salidas
              </span>
            </div>
          </section>
          <MonthlyChart orders={d.orders} sales={d.sales} />
        </>
      )}
      {tab === "purchases" &&
        (d.orders.length ? (
          <div className="records">
            {[...d.orders]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((o) => (
                <article key={o.id}>
                  <div className="record-icon">
                    <ShoppingBag />
                  </div>
                  <div>
                    <h3>{o.orderName || o.store}</h3>
                    <p>
                      {o.store} · {dateFmt(o.date)}
                    </p>
                    <small>
                      {o.clothingItemIds.length} prendas ·{" "}
                      {o.clothingItemIds.length
                        ? `${money(o.totalCost / o.clothingItemIds.length)} por prenda`
                        : "Sin prendas asociadas"}
                    </small>
                  </div>
                  <b>{money(o.totalCost)}</b>
                  <button className="icon-btn" onClick={() => setPurchase(o)}>
                    <Pencil />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() =>
                      confirm("¿Eliminar esta compra?") &&
                      softDeleteRecords("purchaseOrders", [o.id])
                    }
                  >
                    <Trash2 />
                  </button>
                </article>
              ))}
          </div>
        ) : (
          <Empty
            title="Aún no hay compras"
            text="Registra un pedido y vincula las prendas que entraron."
          />
        ))}
      {tab === "sales" &&
        (d.sales.length ? (
          <div className="records">
            {[...d.sales]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((s) => {
                const i = d.items.find((x) => x.id === s.clothingItemId);
                return (
                  <article key={s.id}>
                    <div className="record-icon">
                      <CircleDollarSign />
                    </div>
                    <div>
                      <h3>{i?.name || "Prenda eliminada"}</h3>
                      <p>
                        {s.platform} · {dateFmt(s.date)}
                      </p>
                      <small>
                        Precio {money(s.salePrice)}
                        {s.fees ? ` · ${money(s.fees)} de comisión` : ""}
                      </small>
                    </div>
                    <b>+{money(s.netProfit ?? s.salePrice - (s.fees || 0))}</b>
                    <button className="icon-btn" onClick={() => setSale(s)}>
                      <Pencil />
                    </button>
                  </article>
                );
              })}
          </div>
        ) : (
          <Empty
            title="Aún no hay ventas"
            text="Cuando vendas una prenda, podrás ver aquí cuánto has recuperado."
          />
        ))}
      {purchase && (
        <PurchaseModal
          data={d}
          order={purchase === true ? undefined : purchase}
          close={() => setPurchase(false)}
        />
      )}{" "}
      {sale && (
        <SaleModal
          data={d}
          sale={sale === true ? undefined : sale}
          close={() => setSale(false)}
        />
      )}
    </>
  );
}
function PurchaseModal({
  data,
  order,
  close,
}: {
  data: Data;
  order?: PurchaseOrder;
  close: () => void;
}) {
  const [form, setForm] = useState({
    date: order?.date || today(),
    store: order?.store || "",
    orderName: order?.orderName || "",
    totalCost: order?.totalCost ?? "",
    shippingCost: order?.shippingCost ?? "",
    discount: order?.discount ?? "",
    notes: order?.notes || "",
    ids: order?.clothingItemIds || ([] as string[]),
  });
  async function save(e: FormEvent) {
    e.preventDefault();
    const t = now(),
      id = order?.id || uid(),
      obj: PurchaseOrder = {
        id,
        date: form.date,
        store: form.store,
        orderName: form.orderName,
        totalCost: +form.totalCost,
        shippingCost: form.shippingCost === "" ? undefined : +form.shippingCost,
        discount: form.discount === "" ? undefined : +form.discount,
        notes: form.notes,
        clothingItemIds: form.ids,
        createdAt: order?.createdAt || t,
        updatedAt: t,
      };
    await db.transaction(
      "rw",
      [db.purchaseOrders, db.clothingItems],
      async () => {
        await db.purchaseOrders.put(obj);
        if (order)
          await db.clothingItems
            .where("purchaseOrderId")
            .equals(id)
            .modify({ purchaseOrderId: undefined });
        await db.clothingItems.bulkUpdate(
          form.ids.map((key) => ({ key, changes: { purchaseOrderId: id } })),
        );
      },
    );
    close();
  }
  return (
    <Modal
      title={order ? "Editar compra" : "Nueva compra"}
      onClose={close}
      wide
    >
      <form className="modal-form" onSubmit={save}>
        <label>
          Tienda *
          <input
            required
            value={form.store}
            onChange={(e) => setForm({ ...form, store: e.target.value })}
          />
        </label>
        <label>
          Fecha *
          <input
            required
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </label>
        <label>
          Nombre del pedido
          <input
            value={form.orderName}
            onChange={(e) => setForm({ ...form, orderName: e.target.value })}
            placeholder="Ej. Rebajas de verano"
          />
        </label>
        <label>
          Coste total (€) *
          <input
            required
            min="0"
            type="number"
            step=".01"
            value={form.totalCost}
            onChange={(e) => setForm({ ...form, totalCost: e.target.value })}
          />
        </label>
        <label>
          Envío (€)
          <input
            min="0"
            type="number"
            step=".01"
            value={form.shippingCost}
            onChange={(e) => setForm({ ...form, shippingCost: e.target.value })}
          />
        </label>
        <label>
          Descuento (€)
          <input
            min="0"
            type="number"
            step=".01"
            value={form.discount}
            onChange={(e) => setForm({ ...form, discount: e.target.value })}
          />
        </label>
        <label className="full">
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <div className="full">
          <p className="field-label">
            Prendas de este pedido ({form.ids.length})
          </p>
          <div className="picker compact">
            {data.items
              .filter((i) => !i.soldAt)
              .map((i) => (
                <button
                  type="button"
                  className={form.ids.includes(i.id) ? "picked" : ""}
                  onClick={() =>
                    setForm({
                      ...form,
                      ids: form.ids.includes(i.id)
                        ? form.ids.filter((x) => x !== i.id)
                        : [...form.ids, i.id],
                    })
                  }
                  key={i.id}
                >
                  <ItemThumb item={i} />
                  <span>{i.name}</span>
                </button>
              ))}
          </div>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button>Guardar compra</Button>
        </div>
      </form>
    </Modal>
  );
}
function SaleModal({
  data,
  sale,
  close,
}: {
  data: Data;
  sale?: SaleRecord;
  close: () => void;
}) {
  const [form, setForm] = useState({
    clothingItemId: sale?.clothingItemId || "",
    date: sale?.date || today(),
    platform: sale?.platform || "vinted",
    salePrice: sale?.salePrice ?? "",
    fees: sale?.fees ?? "",
    notes: sale?.notes || "",
  });
  async function save(e: FormEvent) {
    e.preventDefault();
    const t = now(),
      id = sale?.id || uid(),
      obj: SaleRecord = {
        id,
        clothingItemId: form.clothingItemId,
        date: form.date,
        platform: form.platform as SaleRecord["platform"],
        salePrice: +form.salePrice,
        fees: form.fees === "" ? undefined : +form.fees,
        netProfit: +form.salePrice - (+form.fees || 0),
        notes: form.notes,
        createdAt: sale?.createdAt || t,
        updatedAt: t,
      };
    await db.transaction("rw", [db.saleRecords, db.clothingItems, db.closetExits, db.resaleListings], async () => {
      await db.saleRecords.put(obj);
      const existingExit = await db.closetExits.where("clothingItemId").equals(form.clothingItemId).filter((x) => x.type === "sold").first();
      const listing = await db.resaleListings.where("clothingItemId").equals(form.clothingItemId).first();
      await db.closetExits.put({
        id: existingExit?.id || uid(),
        clothingItemId: form.clothingItemId,
        date: form.date,
        type: "sold",
        amount: obj.netProfit,
        platform: form.platform,
        notes: form.notes,
        createdAt: existingExit?.createdAt || t,
        updatedAt: t,
      });
      await db.clothingItems.update(form.clothingItemId, {
        decisionStatus: "sell",
        vintedStatus: form.platform === "vinted" ? "sold" : undefined,
        soldAt: form.date,
        saleRecordId: id,
        isArchived: true,
        archivedAt: form.date,
        archiveReason: "sold",
        updatedAt: t,
      });
      if (listing)
        await db.resaleListings.update(listing.id, {
          status: "sold",
          soldPrice: obj.salePrice,
          fees: obj.fees,
          netProfit: obj.netProfit,
          soldAt: form.date,
          lastUpdatedAt: t,
          updatedAt: t,
        });
    });
    close();
  }
  return (
    <Modal title={sale ? "Editar venta" : "Registrar venta"} onClose={close}>
      <form className="modal-form" onSubmit={save}>
        <label className="full">
          Prenda *
          <select
            required
            value={form.clothingItemId}
            onChange={(e) =>
              setForm({ ...form, clothingItemId: e.target.value })
            }
          >
            <option value="">Selecciona una prenda</option>
            {data.items
              .filter((i) => !i.saleRecordId || i.id === sale?.clothingItemId)
              .map((i) => (
                <option value={i.id} key={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Fecha
          <input
            required
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </label>
        <label>
          Plataforma
          <select
            value={form.platform}
            onChange={(e) =>
              setForm({ ...form, platform: e.target.value as "vinted" })
            }
          >
            <option value="vinted">Vinted</option>
            <option value="wallapop">Wallapop</option>
            <option value="other">Otra</option>
          </select>
        </label>
        <label>
          Precio de venta (€)
          <input
            required
            min="0"
            type="number"
            step=".01"
            value={form.salePrice}
            onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
          />
        </label>
        <label>
          Comisiones (€)
          <input
            min="0"
            type="number"
            step=".01"
            value={form.fees}
            onChange={(e) => setForm({ ...form, fees: e.target.value })}
          />
        </label>
        <div className="profit full">
          <span>Ganancia neta estimada</span>
          <b>{money((+form.salePrice || 0) - (+form.fees || 0))}</b>
        </div>
        <label className="full">
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button>Registrar venta</Button>
        </div>
      </form>
    </Modal>
  );
}
function MonthlyChart({
  orders,
  sales,
}: {
  orders: PurchaseOrder[];
  sales: SaleRecord[];
}) {
  const data = useMemo(() => {
    const m = new Map<
      string,
      { month: string; gasto: number; ingresos: number }
    >();
    [...orders, ...sales].forEach((x) => {
      const k = month(x.date);
      if (!m.has(k)) m.set(k, { month: k, gasto: 0, ingresos: 0 });
    });
    orders.forEach((o) => (m.get(month(o.date))!.gasto += o.totalCost));
    sales.forEach(
      (s) =>
        (m.get(month(s.date))!.ingresos +=
          s.netProfit ?? s.salePrice - (s.fees || 0)),
    );
    return [...m.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-8);
  }, [orders, sales]);
  return (
    <section className="panel chart">
      <div className="section-title">
        <div>
          <p className="eyebrow">ÚLTIMOS MESES</p>
          <h2>Gasto e ingresos</h2>
        </div>
      </div>
      {data.length ? (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <XAxis dataKey="month" axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip formatter={(v) => money(Number(v))} />
            <Area
              type="monotone"
              dataKey="gasto"
              stroke="#171717"
              fill="#e5e5e5"
            />
            <Area
              type="monotone"
              dataKey="ingresos"
              stroke="#728578"
              fill="#dce5df"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <Empty
          title="El gráfico está esperando"
          text="Aparecerá cuando registres compras o ventas."
        />
      )}
    </section>
  );
}

function ResalePlan() {
  const d = useData(),
    [tab, setTab] = useState<(typeof resalePipeline)[number]>("to_photo"),
    [editing, setEditing] = useState<ResaleListing | ClothingItem | false>(false),
    [copyOpen, setCopyOpen] = useState<ResaleListing | null>(null),
    [soldOpen, setSoldOpen] = useState<ResaleListing | null>(null);
  const candidates = d.items.filter(
    (item) => item.decisionStatus === "sell" && !item.isArchived,
  );
  const listings = d.resaleListings
    .map((listing) => ({
      listing,
      item: d.items.find((item) => item.id === listing.clothingItemId),
    }))
    .filter((entry) => entry.item);
  const byStatus = (status: ResaleListing["status"]) =>
    listings.filter((entry) => entry.listing.status === status);
  const soldListings = d.resaleListings.filter((x) => x.status === "sold");
  const listedOld = d.resaleListings.filter(
    (x) => x.status === "listed" && resaleAge(x) >= 30,
  );
  const avgIncome = soldListings.length
    ? soldListings.reduce((sum, listing) => sum + (listing.netProfit || 0), 0) /
      soldListings.length
    : 0;
  const toSellWithoutListing = candidates.filter((item) => !item.resaleListingId);
  const avgDaysToSell = soldListings.length
    ? Math.round(
        soldListings.reduce(
          (sum, listing) =>
            sum +
            Math.max(
              0,
              Math.round(
                (new Date(listing.soldAt || listing.updatedAt).getTime() -
                  new Date(listing.listedAt || listing.createdAt).getTime()) /
                  86400000,
              ),
            ),
          0,
        ) / soldListings.length,
      )
    : 0;
  const lastSaleGap = d.sales.length
    ? daysSince(
        [...d.sales].sort((a, b) => b.date.localeCompare(a.date))[0]?.date,
      )
    : 999;
  const recommendations = [
    listedOld.length
      ? `${listedOld.length} prendas llevan más de 30 días subidas: revisa fotos o precio.`
      : "",
    d.resaleListings.some((x) => x.status === "listed" && resaleAge(x) >= 60)
      ? "Hay anuncios con más de 60 días: baja 10-20% o resube."
      : "",
    d.resaleListings.some((x) => x.status === "listed" && resaleAge(x) >= 90)
      ? "Más de 90 días sin salir: retira, dona o cambia estrategia."
      : "",
    toSellWithoutListing.length
      ? `Fotografía primero ${toSellWithoutListing
          .slice(0, 2)
          .map((item) => item.name)
          .join(" y ")}.`
      : "",
    byStatus("draft").length
      ? `Tienes ${byStatus("draft").length} borradores listos para subir poco a poco.`
      : "",
    lastSaleGap >= 60
      ? "Hace bastante que no vendes: prueba a renovar anuncios o bajar precios."
      : lastSaleGap >= 30
        ? "Llevas más de 30 días sin vender: conviene mover el pipeline."
        : "",
  ].filter(Boolean);

  async function createOrEditListing(input: ResaleListing | ClothingItem) {
    setEditing(input);
  }

  async function updateListing(id: string, changes: Partial<ResaleListing>) {
    await db.resaleListings.update(id, {
      ...changes,
      lastUpdatedAt: now(),
      updatedAt: now(),
    });
  }

  async function quickStatus(
    listing: ResaleListing,
    status: ResaleListing["status"],
    extra: Partial<ResaleListing> = {},
  ) {
    const stamp = now();
    const item = d.items.find((entry) => entry.id === listing.clothingItemId);
    await db.transaction("rw", [db.resaleListings, db.clothingItems, db.closetExits], async () => {
      await updateListing(listing.id, {
        status,
        photosTaken: status !== "to_photo",
        descriptionReady:
          status === "draft" || status === "listed" || status === "reserved" || status === "sold"
            ? true
            : listing.descriptionReady,
        listedAt:
          status === "listed" && !listing.listedAt ? today() : listing.listedAt,
        reservedAt: status === "reserved" ? today() : extra.reservedAt,
        soldAt: status === "sold" ? today() : extra.soldAt,
        withdrawnAt:
          status === "withdrawn" || status === "donated_instead" ? today() : extra.withdrawnAt,
        lastUpdatedAt: stamp,
        ...extra,
      });
      if (item && status === "listed") {
        await db.clothingItems.update(item.id, {
          vintedStatus: listing.platform === "vinted" ? "listed" : item.vintedStatus,
          updatedAt: stamp,
        });
      }
      if (item && status === "withdrawn") {
        await db.clothingItems.update(item.id, {
          vintedStatus: item.vintedStatus === "listed" ? "not_listed" : item.vintedStatus,
          updatedAt: stamp,
        });
      }
      if (item && status === "donated_instead") {
        await db.closetExits.put({
          id: uid(),
          clothingItemId: item.id,
          date: today(),
          type: "donated",
          notes: "Donada desde el plan de venta",
          createdAt: stamp,
          updatedAt: stamp,
        });
        await db.clothingItems.update(item.id, {
          isArchived: true,
          archivedAt: today(),
          archiveReason: "donated",
          updatedAt: stamp,
        });
      }
    });
  }

  return (
    <>
      <PageHead
        eyebrow={`${d.resaleListings.length} LISTINGS · ${candidates.length} PRENDAS PARA VENDER`}
        title="Plan de venta"
      >
        <Button onClick={() => toSellWithoutListing[0] && createOrEditListing(toSellWithoutListing[0])}>
          <Plus /> Nuevo listing
        </Button>
      </PageHead>
      <div className="stat-grid">
        <Stat label="Para vender" value={candidates.length} icon={<Store />} />
        <Stat label="Pendientes de foto" value={byStatus("to_photo").length} icon={<Camera />} />
        <Stat label="Subidas" value={byStatus("listed").length} icon={<Upload />} />
        <Stat label="Ingresos totales" value={money(soldListings.reduce((sum, x) => sum + (x.netProfit || 0), 0))} icon={<CircleDollarSign />} />
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">RESUMEN</p>
              <h2>Estado actual de tus ventas</h2>
            </div>
          </div>
          <div className="space-list">
            <div className="space-list-row"><div><b>Borradores</b><small>Listos para preparar anuncio</small></div><span>{byStatus("draft").length}</span></div>
            <div className="space-list-row"><div><b>Reservadas</b><small>En espera de cierre</small></div><span>{byStatus("reserved").length}</span></div>
            <div className="space-list-row"><div><b>Vendidas</b><small>Precio medio {soldListings.length ? money(soldListings.reduce((sum, x) => sum + (x.soldPrice || 0), 0) / soldListings.length) : "—"}</small></div><span>{soldListings.length}</span></div>
            <div className="space-list-row"><div><b>Subidas hace mucho</b><small>Más de 30 días activas</small></div><span>{listedOld.length}</span></div>
          </div>
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">RECOMENDACIONES</p>
              <h2>Qué haría ahora</h2>
            </div>
          </div>
          {recommendations.length ? (
            <div className="space-list">
              {recommendations.map((text) => (
                <div className="space-list-row" key={text}>
                  <div>
                    <b>Consejo útil</b>
                    <small>{text}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Todo fluye bien"
              text="Cuando tengas listings activos durante más tiempo o ventas nuevas, verás aquí sugerencias concretas."
            />
          )}
        </section>
      </div>
      {!!toSellWithoutListing.length && (
        <section className="panel sell-prep">
          <div className="section-title">
            <div>
              <p className="eyebrow">SIN LISTING TODAVÍA</p>
              <h2>Prendas listas para entrar en el plan</h2>
            </div>
          </div>
          <div className="sell-row">
            {toSellWithoutListing.map((item) => (
              <button onClick={() => createOrEditListing(item)} key={item.id}>
                <ItemThumb item={item} />
                <span>
                  {item.name}
                  <small>Crear listing de venta</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="tabs resale-tabs">
        {resalePipeline.map((status) => (
          <button
            className={tab === status ? "active" : ""}
            onClick={() => setTab(status)}
            key={status}
          >
            {(() => {
              const Icon = resaleIcons[status];
              return <Icon />;
            })()}
            {resaleStatuses[status]} <b>{byStatus(status).length}</b>
          </button>
        ))}
      </div>
      <div className="resale-board">
        {resalePipeline.map((status) => (
          <section
            className={`panel resale-column ${tab === status ? "active" : ""}`}
            key={status}
          >
            <div className="section-title">
              <div>
                <p className="eyebrow">{resaleStatuses[status].toUpperCase()}</p>
                <h2>{byStatus(status).length}</h2>
              </div>
            </div>
            <div className="resale-cards">
              {byStatus(status).length ? (
                byStatus(status).map(({ listing, item }) => (
                  <article className="resale-card" key={listing.id}>
                    <div className="resale-card-top">
                      <ItemThumb item={item!} />
                      <div>
                        <h3>{item!.name}</h3>
                        <p className="state-line">
                          {(() => {
                            const Icon = resaleIcons[listing.status];
                            return <Icon />;
                          })()}
                          {listing.platform} · {resaleStatuses[listing.status]}
                        </p>
                        <small>
                          {listing.status === "listed"
                            ? `${resaleAge(listing)} días subida`
                            : listing.status === "sold"
                              ? `Vendida por ${money(listing.soldPrice || 0)}`
                              : listing.askingPrice
                                ? `Precio actual ${money(listing.askingPrice)}`
                                : "Sin precio todavía"}
                        </small>
                      </div>
                    </div>
                    <div className="card-tags">
                      <span>{listing.photosTaken ? "Fotos ✓" : "Fotos pendientes"}</span>
                      <span>{listing.descriptionReady ? "Texto ✓" : "Texto pendiente"}</span>
                    </div>
                    <div className="resale-actions">
                      {listing.status === "to_photo" && (
                        <button onClick={() => quickStatus(listing, "photos_done", { photosTaken: true })}>
                          Fotos hechas
                        </button>
                      )}
                      {listing.status === "photos_done" && (
                        <button onClick={() => quickStatus(listing, "draft", { descriptionReady: true })}>
                          Crear borrador
                        </button>
                      )}
                      {(listing.status === "draft" || listing.status === "photos_done") && (
                        <button
                          onClick={() =>
                            quickStatus(listing, "listed", {
                              descriptionReady: true,
                              listedAt: listing.listedAt || today(),
                            })
                          }
                        >
                          Marcar subida
                        </button>
                      )}
                      {listing.status === "listed" && (
                        <>
                          <button onClick={() => quickStatus(listing, "reserved")}>Reservada</button>
                          <button
                            onClick={() => {
                              const next = suggestedDrop(listing);
                              if (next && next !== listing.askingPrice)
                                void updateListing(listing.id, { askingPrice: next });
                            }}
                          >
                            Bajar precio
                          </button>
                        </>
                      )}
                      {listing.status === "reserved" && (
                        <button onClick={() => setSoldOpen(listing)}>Marcar vendida</button>
                      )}
                      {listing.status !== "sold" && listing.status !== "donated_instead" && (
                        <button onClick={() => quickStatus(listing, "withdrawn")}>Retirar</button>
                      )}
                      {listing.status !== "sold" && (
                        <button onClick={() => quickStatus(listing, "donated_instead")}>Donar al final</button>
                      )}
                      <button onClick={() => setCopyOpen(listing)}>Preparar anuncio</button>
                      <button onClick={() => setEditing(listing)}>Editar</button>
                    </div>
                    <div className="resale-actions secondary">
                      <button onClick={() => window.location.hash = `#/prenda/${item!.id}`}>Abrir prenda</button>
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  title="Nada por aquí"
                  text="Cuando una prenda entre en esta fase aparecerá en esta columna."
                />
              )}
            </div>
          </section>
        ))}
      </div>
      {editing && (
        <ResaleListingModal
          data={d}
          source={editing}
          close={() => setEditing(false)}
        />
      )}
      {copyOpen && (
        <ResaleCopyModal
          item={d.items.find((x) => x.id === copyOpen.clothingItemId)!}
          listing={copyOpen}
          close={() => setCopyOpen(null)}
        />
      )}
      {soldOpen && (
        <ResaleSoldModal
          listing={soldOpen}
          item={d.items.find((x) => x.id === soldOpen.clothingItemId)!}
          close={() => setSoldOpen(null)}
        />
      )}
      <section className="panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">MÉTRICAS RÁPIDAS</p>
            <h2>Qué está funcionando</h2>
          </div>
        </div>
        <div className="stat-grid">
          <Stat label="Ingreso medio" value={soldListings.length ? money(avgIncome) : "—"} />
          <Stat label="Tiempo medio hasta venta" value={soldListings.length ? `${avgDaysToSell} días` : "—"} />
          <Stat label="Retiradas" value={d.resaleListings.filter((x) => x.status === "withdrawn").length} />
          <Stat label="Donadas al final" value={d.resaleListings.filter((x) => x.status === "donated_instead").length} />
        </div>
      </section>
    </>
  );
}

function ResaleListingModal({
  data,
  source,
  close,
}: {
  data: Data;
  source: ResaleListing | ClothingItem;
  close: () => void;
}) {
  const existing =
    "clothingItemId" in source
      ? source
      : data.resaleListings.find((x) => x.clothingItemId === source.id);
  const item =
    "clothingItemId" in source
      ? data.items.find((x) => x.id === source.clothingItemId)!
      : source;
  const generated = buildListingCopy(item, existing);
  const [form, setForm] = useState({
    platform: existing?.platform || "vinted",
    status: existing?.status || ("to_photo" as ResaleListing["status"]),
    askingPrice: existing?.askingPrice?.toString() || generated.suggestedPrice?.toString() || "",
    minimumPrice: existing?.minimumPrice?.toString() || "",
    title: existing?.title || generated.title,
    description: existing?.description || generated.description,
    notes: existing?.notes || "",
    photosTaken: existing?.photosTaken || false,
    descriptionReady: existing?.descriptionReady || false,
  });
  async function save(e: FormEvent) {
    e.preventDefault();
    const t = now();
    const id = existing?.id || uid();
    await db.transaction("rw", [db.resaleListings, db.clothingItems], async () => {
      await db.resaleListings.put({
        id,
        clothingItemId: item.id,
        platform: form.platform as ResaleListing["platform"],
        status: form.status,
        askingPrice: form.askingPrice ? +form.askingPrice : undefined,
        minimumPrice: form.minimumPrice ? +form.minimumPrice : undefined,
        photosTaken: form.photosTaken,
        descriptionReady: form.descriptionReady,
        listedAt:
          form.status === "listed"
            ? existing?.listedAt || today()
            : existing?.listedAt,
        title: form.title || undefined,
        description: form.description || undefined,
        notes: form.notes || undefined,
        createdAt: existing?.createdAt || t,
        updatedAt: t,
        lastUpdatedAt: t,
      });
      await db.clothingItems.update(item.id, {
        resaleListingId: id,
        decisionStatus: "sell",
        vintedStatus:
          form.platform === "vinted" && form.status === "listed" ? "listed" : item.vintedStatus,
        updatedAt: t,
      });
    });
    close();
  }
  return (
    <Modal title={existing ? "Editar listing" : "Nuevo listing"} onClose={close} wide>
      <form className="modal-form" onSubmit={save}>
        <label>
          Plataforma
          <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as ResaleListing["platform"] })}>
            <option value="vinted">Vinted</option>
            <option value="wallapop">Wallapop</option>
            <option value="other">Otra</option>
          </select>
        </label>
        <label>
          Estado
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ResaleListing["status"] })}>
            {Object.entries(resaleStatuses).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Precio actual
          <input type="number" min="0" step=".01" value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: e.target.value })} />
        </label>
        <label>
          Precio mínimo
          <input type="number" min="0" step=".01" value={form.minimumPrice} onChange={(e) => setForm({ ...form, minimumPrice: e.target.value })} />
        </label>
        <label className="full">
          Título
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value, descriptionReady: true })} />
        </label>
        <label className="full">
          Descripción
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value, descriptionReady: true })} />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={form.photosTaken} onChange={(e) => setForm({ ...form, photosTaken: e.target.checked })} />
          <span />
          Fotos hechas
        </label>
        <label className="toggle">
          <input type="checkbox" checked={form.descriptionReady} onChange={(e) => setForm({ ...form, descriptionReady: e.target.checked })} />
          <span />
          Descripción lista
        </label>
        <label className="full">
          Notas
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={close}>Cancelar</Button>
          <Button>Guardar listing</Button>
        </div>
      </form>
    </Modal>
  );
}

function ResaleCopyModal({
  item,
  listing,
  close,
}: {
  item: ClothingItem;
  listing: ResaleListing;
  close: () => void;
}) {
  const copy = buildListingCopy(item, listing);
  const all = `${copy.title}\n\n${copy.description}\n\nPrecio sugerido: ${copy.suggestedPrice ? money(copy.suggestedPrice) : "—"}`;
  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    alert("Texto copiado.");
  }
  return (
    <Modal title="Preparar anuncio Vinted" onClose={close} wide>
      <div className="vinted-copy">
        <label>
          Título
          <div><p>{copy.title}</p></div>
        </label>
        <label>
          Descripción
          <div><p>{copy.description}</p></div>
        </label>
        <label>
          Precio sugerido
          <div><p>{copy.suggestedPrice ? money(copy.suggestedPrice) : "Sin sugerencia todavía"}</p></div>
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={() => copyText(copy.title)}>Copiar título</Button>
          <Button type="button" variant="secondary" onClick={() => copyText(copy.description)}>Copiar descripción</Button>
          <Button type="button" onClick={() => copyText(all)}>Copiar todo</Button>
        </div>
      </div>
    </Modal>
  );
}

function ResaleSoldModal({
  listing,
  item,
  close,
}: {
  listing: ResaleListing;
  item: ClothingItem;
  close: () => void;
}) {
  const [form, setForm] = useState({
    soldPrice: listing.soldPrice?.toString() || listing.askingPrice?.toString() || "",
    fees: listing.fees?.toString() || "",
    date: listing.soldAt || today(),
  });
  async function save(e: FormEvent) {
    e.preventDefault();
    const t = now();
    const soldPrice = +form.soldPrice || 0;
    const fees = +form.fees || 0;
    const netProfit = soldPrice - fees;
    await db.transaction("rw", [db.resaleListings, db.saleRecords, db.clothingItems, db.closetExits], async () => {
      const existingSale = item.saleRecordId
        ? await db.saleRecords.get(item.saleRecordId)
        : await db.saleRecords.where("clothingItemId").equals(item.id).first();
      const existingExit = await db.closetExits
        .where("clothingItemId")
        .equals(item.id)
        .filter((x) => x.type === "sold")
        .first();
      const saleId = existingSale?.id || item.saleRecordId || uid();
      await db.resaleListings.update(listing.id, {
        status: "sold",
        soldPrice,
        fees: fees || undefined,
        netProfit,
        soldAt: form.date,
        lastUpdatedAt: t,
        updatedAt: t,
      });
      await db.saleRecords.put({
        id: saleId,
        clothingItemId: item.id,
        date: form.date,
        platform: listing.platform,
        salePrice: soldPrice,
        fees: fees || undefined,
        netProfit,
        notes: listing.notes,
        createdAt: existingSale?.createdAt || t,
        updatedAt: t,
      } as SaleRecord);
      await db.closetExits.put({
        id: existingExit?.id || uid(),
        clothingItemId: item.id,
        date: form.date,
        type: "sold",
        amount: netProfit,
        platform: listing.platform,
        notes: listing.notes,
        createdAt: existingExit?.createdAt || t,
        updatedAt: t,
      });
      await db.clothingItems.update(item.id, {
        saleRecordId: saleId,
        soldAt: form.date,
        vintedStatus: listing.platform === "vinted" ? "sold" : item.vintedStatus,
        isArchived: true,
        archivedAt: form.date,
        archiveReason: "sold",
        updatedAt: t,
      });
    });
    close();
  }
  return (
    <Modal title="Marcar como vendida" onClose={close}>
      <form className="modal-form" onSubmit={save}>
        <label>
          Precio vendido
          <input required type="number" min="0" step=".01" value={form.soldPrice} onChange={(e) => setForm({ ...form, soldPrice: e.target.value })} />
        </label>
        <label>
          Comisiones
          <input type="number" min="0" step=".01" value={form.fees} onChange={(e) => setForm({ ...form, fees: e.target.value })} />
        </label>
        <label className="full">
          Fecha
          <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <div className="profit full">
          <span>Ganancia neta</span>
          <b>{money((+form.soldPrice || 0) - (+form.fees || 0))}</b>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={close}>Cancelar</Button>
          <Button>Guardar venta</Button>
        </div>
      </form>
    </Modal>
  );
}

function Stats() {
  const d = useData();
  const count = (key: "category" | "decisionStatus") =>
    Object.entries(
      d.items.reduce(
        (a, i) => ({ ...a, [i[key]]: (a[i[key]] || 0) + 1 }),
        {} as Record<string, number>,
      ),
    ).map(([name, value]) => ({
      name: name in decisions ? decisions[name as DecisionStatus] : name,
      value,
    }));
  const cats = count("category"),
    decs = count("decisionStatus"),
    store = Object.entries(
      d.orders.reduce(
        (a, o) => ({ ...a, [o.store]: (a[o.store] || 0) + o.totalCost }),
        {} as Record<string, number>,
      ),
    ).map(([name, value]) => ({ name, value }));
  const totalUses = d.wears.reduce((a, w) => a + w.clothingItemIds.length, 0),
    priced = d.items.filter(
      (i) =>
        i.originalPrice &&
        d.wears.some((w) => w.clothingItemIds.includes(i.id)),
    );
  const soldListings = d.resaleListings.filter((x) => x.status === "sold"),
    avgSoldPrice = soldListings.length
      ? soldListings.reduce((sum, listing) => sum + (listing.soldPrice || 0), 0) /
        soldListings.length
      : 0,
    avgTimeToSell = soldListings.length
      ? Math.round(
          soldListings.reduce(
            (sum, listing) =>
              sum +
              Math.max(
                0,
                Math.round(
                  (new Date(listing.soldAt || listing.updatedAt).getTime() -
                    new Date(listing.listedAt || listing.createdAt).getTime()) /
                    86400000,
                ),
              ),
            0,
          ) / soldListings.length,
        )
      : 0,
    retiredOrDonated =
      d.resaleListings.filter((x) => x.status === "withdrawn").length +
      d.resaleListings.filter((x) => x.status === "donated_instead").length;
  const cpu = priced.length
    ? priced.reduce(
        (a, i) =>
          a +
          i.originalPrice! /
            d.wears.filter((w) => w.clothingItemIds.includes(i.id)).length,
        0,
      ) / priced.length
    : 0;
  if (!d.items.length)
    return (
      <>
        <PageHead eyebrow="UNA MIRADA CON PERSPECTIVA" title="Estadísticas" />
        <div className="stats-intro">
          <BarChart3 />
          <div>
            <h2>Tus datos crecerán con tu armario</h2>
            <p>
              Añade prendas y registra usos. Aquí descubrirás qué llevas más,
              cuánto aprovechas cada compra y cómo evoluciona tu armario.
            </p>
            <NavLink to="/prenda/nueva">Añadir una prenda</NavLink>
          </div>
        </div>
      </>
    );
  return (
    <>
      <PageHead eyebrow="UNA MIRADA CON PERSPECTIVA" title="Estadísticas" />
      <div className="stat-grid">
        <Stat label="Prendas activas" value={d.items.filter((i) => !i.isArchived).length} />
        <Stat label="Archivadas" value={d.items.filter((i) => i.isArchived).length} />
        <Stat label="Usos registrados" value={totalUses} />
        <Stat
          label="Coste por uso medio"
          value={cpu ? money(cpu) : "Sin datos"}
        />
        <Stat label="Ingresos por ventas" value={money(d.sales.reduce((sum, sale) => sum + (sale.netProfit ?? sale.salePrice - (sale.fees || 0)), 0))} />
        <Stat label="Precio medio venta" value={soldListings.length ? money(avgSoldPrice) : "—"} />
        <Stat label="Tiempo medio hasta venta" value={soldListings.length ? `${avgTimeToSell} días` : "—"} />
        <Stat label="Retiradas o donadas" value={retiredOrDonated} />
      </div>
      <div className="two-col charts">
        <ChartBox title="Prendas por categoría">
          {cats.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cats} layout="vertical">
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip />
                <Bar dataKey="value" fill="#262626" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoData />
          )}
        </ChartBox>
        <ChartBox title="Decisiones">
          {decs.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={decs}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={3}
                >
                  {decs.map((_, i) => (
                    <Cell
                      key={i}
                  fill={
                    ["#525252", "#94a3b8", "#a3a3a3", "#aaa1b8", "#7c8f84"][
                          i % 5
                        ]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <NoData />
          )}
        </ChartBox>
        <ChartBox title="Gasto por tienda">
          {store.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={store}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Bar dataKey="value" fill="#404040" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoData />
          )}
        </ChartBox>
        <MonthlyChart orders={d.orders} sales={d.sales} />
      </div>
    </>
  );
}
function ChartBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel chart">
      <div className="section-title">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}
function NoData() {
  return <div className="chart-empty">Todavía no hay datos suficientes.</div>;
}

function SettingsPage() {
  const d = useData(),
    sync = useSyncSummary(),
    file = useRef<HTMLInputElement>(null),
    [budget, setBudget] = useState(
      d.settings.monthlyClothingBudget?.toString() || "",
    ),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [authMode, setAuthMode] = useState<"login" | "signup">("login"),
    [syncBusy, setSyncBusy] = useState(false),
    [locationOpen, setLocationOpen] = useState(false),
    [routineOpen, setRoutineOpen] = useState(false),
    [editingRoutine, setEditingRoutine] = useState<UserRoutine | undefined>();
  async function saveBudget() {
    await db.settings.update("main", {
      monthlyClothingBudget: budget ? +budget : undefined,
    });
  }
  async function savePreferenceTags(
    key:
      | "preferredWorkTags"
      | "preferredWeekendTags"
      | "preferredNightTags"
      | "preferredEventTags",
    raw: string,
  ) {
    await db.settings.put({
      ...d.settings,
      [key]: raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    });
  }
  async function runSyncTask(task: () => Promise<void>) {
    setSyncBusy(true);
    try {
      await task();
    } catch {
      alert(
        "No hemos podido completar esta acción ahora mismo. Revisa tus credenciales o la configuración de Firebase.",
      );
    } finally {
      setSyncBusy(false);
    }
  }
  async function exportData() {
    const data = {
        version: 8,
        exportedAt: now(),
        clothingItems: d.items,
        wearLogs: d.wears,
        outfits: d.outfits,
        settings: d.settings,
        purchaseOrders: d.orders,
        saleRecords: d.sales,
        closetExits: d.exits,
        wishlistItems: d.wishlist,
        spaces: d.spaces,
        resaleListings: d.resaleListings,
        weatherLocations: d.weatherLocations,
        userRoutines: d.userRoutines,
        wardrobeEvents: d.wardrobeEvents,
        trips: d.trips,
        tripPackingItems: d.tripPackingItems,
        tripPlannedOutfits: d.tripPlannedOutfits,
      },
      blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mi-vestidor-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importData(f?: File) {
    if (!f) return;
    try {
      const x = JSON.parse(await f.text());
      if (!Array.isArray(x.clothingItems) || !x.settings) throw Error();
      if (
        !confirm(
          "La importación sustituirá todos los datos actuales. ¿Continuar?",
        )
      )
        return;
      await db.transaction("rw", db.tables, async () => {
        await Promise.all(db.tables.map((t) => t.clear()));
        await db.clothingItems.bulkAdd(x.clothingItems);
        await db.wearLogs.bulkAdd(x.wearLogs || []);
        await db.outfits.bulkAdd(x.outfits || []);
        await db.purchaseOrders.bulkAdd(x.purchaseOrders || []);
        await db.saleRecords.bulkAdd(x.saleRecords || []);
        await db.closetExits.bulkAdd(x.closetExits || []);
        await db.wishlistItems.bulkAdd(x.wishlistItems || []);
        await db.spaces.bulkAdd(x.spaces || []);
        await db.resaleListings.bulkAdd(x.resaleListings || []);
        await db.weatherLocations.bulkAdd(x.weatherLocations || []);
        await db.userRoutines.bulkAdd(x.userRoutines || []);
        await db.wardrobeEvents.bulkAdd(x.wardrobeEvents || []);
        await db.trips.bulkAdd(x.trips || []);
        await db.tripPackingItems.bulkAdd(x.tripPackingItems || []);
        await db.tripPlannedOutfits.bulkAdd(x.tripPlannedOutfits || []);
        await db.settings.put({ ...defaults, ...x.settings, id: "main" });
        await db.syncState.put(syncDefaults);
      });
      alert("Backup importado correctamente.");
    } catch {
      alert(
        "No hemos podido leer este archivo. Comprueba que sea un backup de Mi Vestidor.",
      );
    }
  }
  async function reset() {
    if (confirm("¿Borrar todos los datos? Esta acción no se puede deshacer."))
      await db.transaction("rw", db.tables, async () => {
        await Promise.all(db.tables.map((t) => t.clear()));
        await db.settings.add(defaults);
        await db.syncState.add(syncDefaults);
      });
  }
  return (
    <>
      <PageHead eyebrow="TU ESPACIO, A TU MANERA" title="Ajustes" />
      <div className="settings-grid">
        <section className="panel">
          <h2>Objetivos suaves</h2>
          <p className="muted">Un punto de referencia, nunca una reprimenda.</p>
          <label>
            Presupuesto mensual para ropa (€)
            <div className="inline-input">
              <input
                type="number"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Sin límite"
              />
              <Button onClick={saveBudget}>Guardar</Button>
            </div>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={d.settings.oneInOneOutGoal || false}
              onChange={(e) =>
                db.settings.update("main", {
                  oneInOneOutGoal: e.target.checked,
                })
              }
            />
            <span /> Mostrar el objetivo “si algo entra, algo sale”
          </label>
        </section>
        <section className="panel">
          <h2>Clima y contexto</h2>
          <p className="muted">
            La app usa Open-Meteo y sigue funcionando aunque no haya conexión.
          </p>
          <div className="sync-status">
            <div className="sync-row">
              <b>Ubicación predeterminada</b>
              <span>{getDefaultWeatherLocation(d.weatherLocations).name}</span>
            </div>
            <div className="sync-row">
              <b>Ubicaciones frecuentes</b>
              <span>{d.weatherLocations.length}</span>
            </div>
          </div>
          <Button variant="secondary" onClick={() => setLocationOpen(true)}>
            <MapPin /> Gestionar ubicaciones
          </Button>
          <div className="settings-preferences">
            <label>
              Etiquetas preferidas para trabajo
              <input
                defaultValue={(d.settings.preferredWorkTags || []).join(", ")}
                onBlur={(e) => savePreferenceTags("preferredWorkTags", e.target.value)}
                placeholder="trabajo, oficina, cómodo..."
              />
            </label>
            <label>
              Preferencias para finde
              <input
                defaultValue={(d.settings.preferredWeekendTags || []).join(", ")}
                onBlur={(e) => savePreferenceTags("preferredWeekendTags", e.target.value)}
                placeholder="casual, relajado, cómodo..."
              />
            </label>
            <label>
              Preferencias para noche
              <input
                defaultValue={(d.settings.preferredNightTags || []).join(", ")}
                onBlur={(e) => savePreferenceTags("preferredNightTags", e.target.value)}
                placeholder="noche, favorito, arreglado..."
              />
            </label>
            <label>
              Preferencias para eventos
              <input
                defaultValue={(d.settings.preferredEventTags || []).join(", ")}
                onBlur={(e) => savePreferenceTags("preferredEventTags", e.target.value)}
                placeholder="evento, especial, formal..."
              />
            </label>
          </div>
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Rutina semanal</h2>
              <p className="muted">
                Define trabajo, estudio o días libres con horario si te ayuda.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setEditingRoutine(undefined);
                setRoutineOpen(true);
              }}
            >
              <Plus /> Nueva rutina
            </Button>
          </div>
          <div className="routine-list">
            {weekdayOrder.map((day) => {
              const routine = d.userRoutines.find((entry) => entry.dayOfWeek === day);
              return (
                <button
                  className="routine-row"
                  key={day}
                  onClick={() => {
                    setEditingRoutine(routine);
                    setRoutineOpen(true);
                  }}
                >
                  <b>{weekdayNames[day]}</b>
                  <span>{routineSummary(routine)}</span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <h2>Tus datos</h2>
          <p className="muted">
            Exportar e importar sigue disponible aunque actives sincronización.
          </p>
          <div className="setting-actions">
            <button onClick={exportData}>
              <Download />
              <span>
                <b>Exportar backup</b>
                <small>Descarga todos tus datos en JSON</small>
              </span>
            </button>
            <button onClick={() => file.current?.click()}>
              <Upload />
              <span>
                <b>Importar backup</b>
                <small>Restaura una copia guardada</small>
              </span>
            </button>
            <input
              hidden
              ref={file}
              type="file"
              accept="application/json"
              onChange={(e) => importData(e.target.files?.[0])}
            />
            <button className="reset" onClick={reset}>
              <RotateCcw />
              <span>
                <b>Empezar de cero</b>
                <small>Borra todos los datos locales</small>
              </span>
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>Sincronización</h2>
          <p className="muted">{syncStatusText(sync)}</p>
          <div className="sync-status">
            <div className="sync-row">
              <b>Modo actual</b>
              <span>{sync.syncEnabled && sync.user ? "Sincronizado" : "Local"}</span>
            </div>
            <div className="sync-row">
              <b>Estado de conexión</b>
              <span>{sync.online ? "Con conexión" : "Sin conexión"}</span>
            </div>
            <div className="sync-row">
              <b>Última sincronización</b>
              <span>{sync.lastSyncedAt ? lastSyncText(sync.lastSyncedAt) : "Todavía no"}</span>
            </div>
            <div className="sync-row">
              <b>Cambios pendientes</b>
              <span>{sync.syncEnabled ? sync.pendingChanges : 0}</span>
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={sync.syncEnabled}
              disabled={!sync.hasConfig && !sync.syncEnabled}
              onChange={(e) =>
                runSyncTask(() => saveSyncEnabled(e.target.checked))
              }
            />
            <span />
            Activar sincronización opcional
          </label>
          {!sync.hasConfig && (
            <p className="muted">
              Falta configurar Firebase en este dispositivo para activar esta función.
            </p>
          )}
          {sync.syncEnabled && !sync.user && sync.hasConfig && (
            <div className="sync-auth">
              <div className="small-tabs">
                <button
                  className={authMode === "login" ? "active" : ""}
                  onClick={() => setAuthMode("login")}
                >
                  Entrar
                </button>
                <button
                  className={authMode === "signup" ? "active" : ""}
                  onClick={() => setAuthMode("signup")}
                >
                  Crear cuenta
                </button>
              </div>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </label>
              <div className="form-actions">
                <Button
                  type="button"
                  disabled={syncBusy || !email || !password}
                  onClick={() =>
                    runSyncTask(async () => {
                      if (authMode === "login") {
                        await signInWithEmail(email, password);
                      } else {
                        await signUpWithEmail(email, password);
                      }
                    })
                  }
                >
                  <LogIn /> {authMode === "login" ? "Iniciar sesión" : "Crear cuenta"}
                </Button>
              </div>
            </div>
          )}
          {sync.syncEnabled && sync.user && (
            <div className="setting-actions sync-actions">
              <button
                disabled={syncBusy}
                onClick={() =>
                  runSyncTask(async () => {
                    if (!sync.hasCompletedInitialSync) await markEverythingPending();
                    await syncNow();
                  })
                }
              >
                <Cloud />
                <span>
                  <b>
                    {sync.hasCompletedInitialSync
                      ? "Sincronizar ahora"
                      : "Subir datos locales y empezar"}
                  </b>
                  <small>
                    {sync.hasCompletedInitialSync
                      ? "Empuja cambios locales y baja novedades remotas"
                      : "Primera migración opcional a la nube sin borrar local"}
                  </small>
                </span>
              </button>
              <button disabled={syncBusy || !sync.online} onClick={() => runSyncTask(() => syncNow())}>
                <RefreshCw />
                <span>
                  <b>Forzar sincronización manual</b>
                  <small>
                    {sync.online
                      ? `${sync.pendingChanges} cambios pendientes`
                      : "Se lanzará cuando recuperes conexión"}
                  </small>
                </span>
              </button>
              <button disabled={syncBusy} onClick={() => runSyncTask(() => signOutFromSync())}>
                <LogOut />
                <span>
                  <b>Cerrar sesión</b>
                  <small>{sync.user.email || "Seguirás usando la app en local"}</small>
                </span>
              </button>
            </div>
          )}
        </section>
        <ListSettings settings={d.settings} />
        <section className="panel about">
          <h2>Mi Vestidor</h2>
          <p>Versión 1.0 · Local-first y con sincronización opcional.</p>
          <small>
            Tus datos siguen pudiendo vivir solo en este dispositivo si no activas la nube.
          </small>
        </section>
      </div>
      {locationOpen && (
        <LocationManagerModal
          locations={d.weatherLocations.length ? d.weatherLocations : [defaultWeatherLocation]}
          selectedId={getDefaultWeatherLocation(d.weatherLocations).id}
          close={() => setLocationOpen(false)}
        />
      )}
      {routineOpen && (
        <RoutineModal
          routine={editingRoutine}
          close={() => {
            setRoutineOpen(false);
            setEditingRoutine(undefined);
          }}
        />
      )}
    </>
  );
}
function ListSettings({ settings }: { settings: Settings }) {
  const [tab, setTab] = useState<
      | "categories"
      | "subcategories"
      | "colors"
      | "stores"
      | "brands"
      | "occasions"
      | "frequentTags"
      | "salePlatforms"
    >("categories"),
    [value, setValue] = useState(""),
    [colorName, setColorName] = useState(""),
    [colorHex, setColorHex] = useState("#9CA3AF");
  const labels = {
    categories: "Categorías",
    subcategories: "Subcategorías",
    colors: "Colores",
    stores: "Tiendas",
    brands: "Marcas",
    occasions: "Ocasiones",
    frequentTags: "Etiquetas",
    salePlatforms: "Venta",
  };
  const values = (settings[tab] || []) as string[];
  async function replace(values: string[]) {
    await db.settings.put({ ...settings, [tab]: values, updatedAt: now() });
  }
  async function add() {
    const v = prettyValue(value);
    if (!v) return;
    await replace(addUnique(values, v));
    setValue("");
  }
  async function remove(v: string) {
    await replace(values.filter((x) => normalizeKey(x) !== normalizeKey(v)));
  }
  async function addColor() {
    const name = prettyValue(colorName);
    if (!name) return;
    const nextColors = addUnique(settings.colors || [], name);
    const nextWardrobeColors = [
      ...wardrobeColors(settings).filter(
        (color) => normalizeKey(color.name) !== normalizeKey(name),
      ),
      {
        id: normalizeKey(name) || uid(),
        name,
        hex: colorHex,
      },
    ];
    await db.settings.put({
      ...settings,
      colors: nextColors,
      wardrobeColors: nextWardrobeColors,
      updatedAt: now(),
    });
    setColorName("");
    setColorHex("#9CA3AF");
  }
  async function removeColor(name: string) {
    await db.settings.put({
      ...settings,
      colors: (settings.colors || []).filter(
        (entry) => normalizeKey(entry) !== normalizeKey(name),
      ),
      wardrobeColors: wardrobeColors(settings).filter(
        (entry) => normalizeKey(entry.name) !== normalizeKey(name),
      ),
      updatedAt: now(),
    });
  }
  return (
    <section className="panel full-span">
      <h2>Listas y etiquetas</h2>
      <div className="small-tabs">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <button
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
            key={k}
          >
            {labels[k]}
          </button>
        ))}
      </div>
      {tab === "colors" ? (
        <>
          <div className="editable-list color-list">
            {wardrobeColors(settings).map((color) => (
              <span key={color.id}>
                <i
                  className={normalizeKey(color.name) === "multicolor" ? "multi" : ""}
                  style={{ background: color.hex }}
                />
                {color.name}
                <button onClick={() => removeColor(color.name)}>
                  <X />
                </button>
              </span>
            ))}
          </div>
          <div className="inline-input color-input">
            <input
              value={colorName}
              onChange={(e) => setColorName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addColor();
              }}
              placeholder="Nombre del color"
            />
            <input
              type="color"
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              aria-label="Color"
            />
            <Button onClick={addColor}>
              <Plus /> Añadir color
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="editable-list">
            {values.map((x) => (
              <span key={x}>
                {x}
                <button onClick={() => remove(x)}>
                  <X />
                </button>
              </span>
            ))}
          </div>
          <div className="inline-input">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder={`Añadir a ${labels[tab].toLowerCase()}`}
            />
            <Button onClick={add}>
              <Plus /> Añadir
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
const exitLabels: Record<ExitType, string> = {
  sold: "Vendida",
  donated: "Donada",
  discarded: "Tirada",
  gifted: "Regalada",
  returned: "Devuelta",
  lost: "Perdida",
};

function WearHistory() {
  const d = useData(),
    [open, setOpen] = useState(false),
    [edit, setEdit] = useState<(typeof d.wears)[number] | undefined>();
  const logs = [...d.wears].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageHead eyebrow={`${logs.length} REGISTROS`} title="Historial de usos">
        <Button onClick={() => setOpen(true)}>
          <Plus /> Registrar uso
        </Button>
      </PageHead>
      {logs.length ? (
        <div className="timeline">
          {logs.map((log) => (
            <article key={log.id}>
              <time>{dateFmt(log.date)}</time>
              <div className="wear-thumbs">
                {log.clothingItemIds.map((id) => {
                  const i = d.items.find((x) => x.id === id);
                  return (
                    i && (
                      <NavLink to={`/prenda/${id}`} key={id}>
                        <ItemThumb item={i} />
                        <span>{i.name}</span>
                      </NavLink>
                    )
                  );
                })}
              </div>
              <div className="wear-copy">
                <b>
                  {log.outfitId
                    ? d.outfits.find((o) => o.id === log.outfitId)?.name
                    : "Uso diario"}
                </b>
                {log.notes && <p>{log.notes}</p>}
              </div>
              <button
                className="icon-btn"
                onClick={() => {
                  setEdit(log);
                  setOpen(true);
                }}
              >
                <Pencil />
              </button>
              <button
                className="icon-btn"
                onClick={() =>
                  confirm("¿Eliminar este uso?") &&
                  softDeleteRecords("wearLogs", [log.id])
                }
              >
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="context-empty">
          <CalendarDays />
          <div>
            <h2>Empieza tu historial</h2>
            <p>Selecciona lo que llevas hoy y regístralo en unos segundos.</p>
          </div>
          <Button onClick={() => setOpen(true)}>Registrar uso</Button>
        </div>
      )}
      {open && (
        <QuickWearModal
          data={d}
          log={edit}
          close={() => {
            setOpen(false);
            setEdit(undefined);
          }}
        />
      )}
    </>
  );
}

function QuickWearModal({
  data,
  log,
  close,
}: {
  data: Data;
  log?: Data["wears"][number];
  close: () => void;
}) {
  const [date, setDate] = useState(log?.date || today()),
    [ids, setIds] = useState(log?.clothingItemIds || []),
    [outfitId, setOutfit] = useState(log?.outfitId || ""),
    [notes, setNotes] = useState(log?.notes || ""),
    [q, setQ] = useState("");
  const active = data.items.filter(
    (i) => !i.isArchived && i.name.toLowerCase().includes(q.toLowerCase()),
  );
  function chooseOutfit(id: string) {
    setOutfit(id);
    const o = data.outfits.find((x) => x.id === id);
    if (o) setIds(o.clothingItemIds);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!ids.length) return;
    if (!log) {
      const duplicate = data.wears.find(
        (w) =>
          w.date === date &&
          w.clothingItemIds.length === ids.length &&
          w.clothingItemIds.every((x) => ids.includes(x)) &&
          Date.now() - new Date(w.createdAt || 0).getTime() <
            5000,
      );
      if (duplicate) return close();
    }
    const stamp = now();
    await db.wearLogs.put({
      id: log?.id || uid(),
      date,
      clothingItemIds: ids,
      outfitId: outfitId || undefined,
      notes: notes || undefined,
      createdAt: log?.createdAt || stamp,
      updatedAt: stamp,
    });
    close();
  }
  return (
    <Modal title={log ? "Editar uso" : "¿Qué llevas hoy?"} onClose={close} wide>
      <form className="modal-form" onSubmit={save}>
        <label>
          Fecha
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label>
          Outfit
          <select
            value={outfitId}
            onChange={(e) => chooseOutfit(e.target.value)}
          >
            <option value="">Sin outfit</option>
            {data.outfits.map((o) => (
              <option value={o.id} key={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="full search">
          <Search />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar prendas..."
          />
        </label>
        <div className="full picker compact">
          {active.map((i) => (
            <button
              type="button"
              className={ids.includes(i.id) ? "picked" : ""}
              onClick={() =>
                setIds((x) =>
                  x.includes(i.id) ? x.filter((y) => y !== i.id) : [...x, i.id],
                )
              }
              key={i.id}
            >
              <ItemThumb item={i} />
              <span>{i.name}</span>
            </button>
          ))}
        </div>
        <label className="full">
          Notas
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
          />
        </label>
        <div className="modal-actions">
          <span className="selection-count">{ids.length} seleccionadas</span>
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button disabled={!ids.length}>Guardar uso</Button>
        </div>
      </form>
    </Modal>
  );
}

function ExitManager() {
  const d = useData(),
    [open, setOpen] = useState(false),
    [vinted, setVinted] = useState<ClothingItem>();
  return (
    <>
      <PageHead
        eyebrow={`${d.exits.length} SALIDAS REGISTRADAS`}
        title="Salidas del armario"
      >
        <Button onClick={() => setOpen(true)}>
          <Archive /> Registrar salida
        </Button>
      </PageHead>
      <div className="utility-links">
        <NavLink to="/plan-venta">
          <Store /> Plan de venta
        </NavLink>
        <NavLink to="/wishlist">
          <Heart /> Wishlist
        </NavLink>
        <NavLink to="/pedidos">
          <PackagePlus /> Prendas desde pedidos
        </NavLink>
      </div>
      {d.items.some((i) => i.decisionStatus === "sell" && !i.isArchived) && (
        <section className="panel sell-prep">
          <div className="section-title">
            <div>
              <p className="eyebrow">LISTAS PARA VENDER</p>
              <h2>Prepara tus anuncios</h2>
            </div>
          </div>
          <div className="sell-row">
            {d.items
              .filter((i) => i.decisionStatus === "sell" && !i.isArchived)
              .map((i) => (
                <button onClick={() => setVinted(i)} key={i.id}>
                  <ItemThumb item={i} />
                  <span>
                    {i.name}
                    <small>Preparar anuncio Vinted</small>
                  </span>
                </button>
              ))}
          </div>
        </section>
      )}
      {d.exits.length ? (
        <div className="records">
          {[...d.exits]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((x) => {
              const i = d.items.find((y) => y.id === x.clothingItemId);
              return (
                <article key={x.id}>
                  <div className="record-icon">
                    <Archive />
                  </div>
                  <div>
                    <h3>{i?.name || "Prenda"}</h3>
                    <p>
                      {exitLabels[x.type]} · {dateFmt(x.date)}
                    </p>
                    <small>
                      {x.notes || x.platform || "Salida registrada"}
                    </small>
                  </div>
                  <b>{x.amount ? money(x.amount) : exitLabels[x.type]}</b>
                  <button
                    className="icon-btn"
                    onClick={async () => {
                      if (confirm("¿Restaurar esta prenda al armario?")) {
                        await db.clothingItems.update(x.clothingItemId, {
                          isArchived: false,
                          archivedAt: undefined,
                          archiveReason: undefined,
                        });
                        await softDeleteRecords("closetExits", [x.id]);
                      }
                    }}
                  >
                    <Undo2 />
                  </button>
                </article>
              );
            })}
        </div>
      ) : (
        <Empty
          title="Aún no hay salidas"
          text="Registra ventas, donaciones o cualquier prenda que deje tu armario."
          action={
            <Button onClick={() => setOpen(true)}>Registrar salida</Button>
          }
        />
      )}{" "}
      {open && <ExitModal data={d} close={() => setOpen(false)} />}{" "}
      {vinted && (
        <VintedModal item={vinted} close={() => setVinted(undefined)} />
      )}
    </>
  );
}

function ExitModal({ data, close }: { data: Data; close: () => void }) {
  const [form, setForm] = useState({
    clothingItemId: "",
    date: today(),
    type: "donated" as ExitType,
    amount: "",
    platform: "",
    notes: "",
  });
  async function save(e: FormEvent) {
    e.preventDefault();
    const t = now(),
      exit: ClosetExit = {
        id: uid(),
        clothingItemId: form.clothingItemId,
        date: form.date,
        type: form.type,
        amount: form.amount ? +form.amount : undefined,
        platform: form.platform || undefined,
        notes: form.notes || undefined,
        createdAt: t,
        updatedAt: t,
      };
    await db.transaction(
      "rw",
      [db.closetExits, db.clothingItems, db.saleRecords, db.resaleListings],
      async () => {
        await db.closetExits.add(exit);
        const changes: Partial<ClothingItem> = {
          isArchived: true,
          archivedAt: form.date,
          archiveReason: form.type,
          updatedAt: t,
        };
        if (form.type === "sold") {
          const saleId = uid();
          const salePrice = +form.amount || 0;
          await db.saleRecords.add({
            id: saleId,
            clothingItemId: form.clothingItemId,
            date: form.date,
            platform:
              form.platform?.toLowerCase() === "vinted"
                ? "vinted"
                : form.platform?.toLowerCase() === "wallapop"
                  ? "wallapop"
                  : "other",
            salePrice,
            netProfit: salePrice,
            notes: form.notes,
            createdAt: t,
            updatedAt: t,
          });
          changes.saleRecordId = saleId;
          changes.soldAt = form.date;
          if (form.platform.toLowerCase() === "vinted")
            changes.vintedStatus = "sold";
          const listing = await db.resaleListings.where("clothingItemId").equals(form.clothingItemId).first();
          if (listing)
            await db.resaleListings.update(listing.id, {
              status: "sold",
              soldPrice: salePrice,
              netProfit: salePrice,
              soldAt: form.date,
              lastUpdatedAt: t,
              updatedAt: t,
            });
        } else if (form.type === "donated") {
          const listing = await db.resaleListings.where("clothingItemId").equals(form.clothingItemId).first();
          if (listing)
            await db.resaleListings.update(listing.id, {
              status: "donated_instead",
              withdrawnAt: form.date,
              lastUpdatedAt: t,
              updatedAt: t,
            });
        }
        await db.clothingItems.update(form.clothingItemId, changes);
      },
    );
    close();
  }
  return (
    <Modal title="Registrar salida" onClose={close}>
      <form className="modal-form" onSubmit={save}>
        <label className="full">
          Prenda
          <select
            required
            value={form.clothingItemId}
            onChange={(e) =>
              setForm({ ...form, clothingItemId: e.target.value })
            }
          >
            <option value="">Selecciona una</option>
            {data.items
              .filter((i) => !i.isArchived)
              .map((i) => (
                <option value={i.id} key={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Motivo
          <select
            value={form.type}
            onChange={(e) =>
              setForm({ ...form, type: e.target.value as ExitType })
            }
          >
            {Object.entries(exitLabels).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </label>
        {form.type === "sold" && (
          <>
            <label>
              Importe (€)
              <input
                min="0"
                step=".01"
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </label>
            <label>
              Plataforma
              <input
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                placeholder="Vinted, Wallapop..."
              />
            </label>
          </>
        )}
        <label className="full">
          Notas
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button>Guardar salida</Button>
        </div>
      </form>
    </Modal>
  );
}

function VintedModal({
  item,
  close,
}: {
  item: ClothingItem;
  close: () => void;
}) {
  const title = [
    item.subcategory || item.category,
    item.colors[0],
    item.brand,
    item.size && `talla ${item.size}`,
  ]
    .filter(Boolean)
    .join(" ");
  const description = [
    `${item.subcategory || item.category}${item.brand ? ` de ${item.brand}` : ""}${item.size ? ` en talla ${item.size}` : ""}.`,
    `${physical[item.physicalStatus]}.`,
    item.colors.length ? `Color ${item.colors.join(" y ").toLowerCase()}.` : "",
    "Se vende porque ya no le doy uso.",
    item.notes,
  ]
    .filter(Boolean)
    .join(" ");
  const copy = (text: string) => navigator.clipboard.writeText(text);
  return (
    <Modal title="Anuncio para Vinted" onClose={close}>
      <div className="vinted-copy">
        <label>
          Título sugerido
          <div>
            <p>{title}</p>
            <Button variant="ghost" onClick={() => copy(title)}>
              <Clipboard /> Copiar
            </Button>
          </div>
        </label>
        <label>
          Descripción
          <div>
            <p>{description}</p>
            <Button variant="ghost" onClick={() => copy(description)}>
              <Clipboard /> Copiar
            </Button>
          </div>
        </label>
        <div className="profit">
          <span>Precio sugerido</span>
          <b>
            {item.estimatedValue ? money(item.estimatedValue) : "Por definir"}
          </b>
        </div>
        <Button
          onClick={() =>
            copy(
              `${title}\n\n${description}\n\nPrecio: ${item.estimatedValue ? money(item.estimatedValue) : "a convenir"}`,
            )
          }
        >
          <Clipboard /> Copiar todo
        </Button>
      </div>
    </Modal>
  );
}

function Wishlist() {
  const d = useData(),
    [open, setOpen] = useState<WishlistItem | true | false>(false);
  const pending = d.wishlist.filter((x) => x.status === "pending");
  return (
    <>
      <PageHead
        eyebrow={`${pending.length} DESEOS PENDIENTES`}
        title="Wishlist"
      >
        <Button onClick={() => setOpen(true)}>
          <Plus /> Añadir deseo
        </Button>
      </PageHead>
      {pending.length ? (
        <div className="wish-grid">
          {pending.map((w) => {
            const similar = d.items.filter(
              (i) =>
                !i.isArchived &&
                i.category === w.category &&
                (!w.colors?.length ||
                  w.colors.some((c) => i.colors.includes(c))),
            );
            const advice = wishlistAdviceText(w, d);
            return (
              <article key={w.id}>
                <div className={`priority ${w.priority}`}>
                  {w.priority === "high"
                    ? "Prioridad alta"
                    : w.priority === "medium"
                      ? "Prioridad media"
                      : "Prioridad baja"}
                </div>
                <h2>{w.name}</h2>
                <p>
                  {[
                    w.category,
                    w.store,
                    w.estimatedPrice && money(w.estimatedPrice),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {w.reason && <blockquote>{w.reason}</blockquote>}
                <small>
                  Ya tienes {similar.length} prendas parecidas en tu armario.
                </small>
                <blockquote>{advice.text}</blockquote>
                <div className="row">
                  <Button variant="secondary" onClick={() => setOpen(w)}>
                    <Pencil /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      db.wishlistItems.update(w.id, {
                        status: "bought",
                        updatedAt: now(),
                      })
                    }
                  >
                    Marcar comprada
                  </Button>
                  <button
                    className="icon-btn"
                    onClick={() =>
                      confirm("¿Eliminar este deseo?") &&
                      softDeleteRecords("wishlistItems", [w.id])
                    }
                  >
                    <Trash2 />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Compra con intención"
          text="Guarda aquí lo que estás pensando comprar y compáralo con lo que ya tienes."
          action={<Button onClick={() => setOpen(true)}>Añadir deseo</Button>}
        />
      )}
      <div className="utility-links">
        <NavLink to="/pedidos">
          <PackagePlus /> Ver pedidos
        </NavLink>
        <NavLink to="/armario">
          <Shirt /> Revisar armario
        </NavLink>
      </div>
      {open && (
        <WishlistModal
          data={d}
          item={open === true ? undefined : open}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

function WishlistModal({
  data,
  item,
  close,
}: {
  data: Data;
  item?: WishlistItem;
  close: () => void;
}) {
  const [form, setForm] = useState({
    name: item?.name || "",
    category: item?.category || "",
    colors: item?.colors || ([] as string[]),
    store: item?.store || "",
    estimatedPrice: item?.estimatedPrice ?? "",
    maxPrice: item?.maxPrice ?? "",
    plannedUse: item?.plannedUse || "",
    waitForSale: item?.waitForSale || false,
    targetSeason: item?.targetSeason || ([] as string[]),
    priority: item?.priority || "medium",
    reason: item?.reason || "",
  });
  const toggleSeason = (value: string) =>
    setForm((current) => ({
      ...current,
      targetSeason: current.targetSeason.includes(value)
        ? current.targetSeason.filter((x) => x !== value)
        : [...current.targetSeason, value],
    }));
  async function save(e: FormEvent) {
    e.preventDefault();
    const t = now();
    const base = {
      id: item?.id || uid(),
      name: form.name,
      category: form.category || undefined,
      colors: form.colors,
      store: form.store || undefined,
      estimatedPrice:
        form.estimatedPrice === "" ? undefined : +form.estimatedPrice,
      maxPrice: form.maxPrice === "" ? undefined : +form.maxPrice,
      targetSeason: form.targetSeason.length ? form.targetSeason : undefined,
      plannedUse: form.plannedUse || undefined,
      waitForSale: form.waitForSale,
      priority: form.priority as WishlistItem["priority"],
      reason: form.reason || undefined,
      status: item?.status || "pending",
      createdAt: item?.createdAt || t,
      updatedAt: t,
    } as WishlistItem;
    const advice = wishlistAdviceText(base, data);
    await db.wishlistItems.put({
      ...base,
      purchaseAdvice: advice.advice,
      similarItemIds: advice.relatedItemIds,
    });
    close();
  }
  return (
    <Modal title={item ? "Editar deseo" : "Nuevo deseo"} onClose={close}>
      <form className="modal-form" onSubmit={save}>
        <label className="full">
          Qué buscas
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej. Pantalón negro recto"
          />
        </label>
        <label>
          Categoría
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="">Sin categoría</option>
            {data.settings.categories.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Tienda
          <input
            value={form.store}
            onChange={(e) => setForm({ ...form, store: e.target.value })}
          />
        </label>
        <label>
          Precio estimado (€)
          <input
            min="0"
            type="number"
            value={form.estimatedPrice}
            onChange={(e) =>
              setForm({ ...form, estimatedPrice: e.target.value })
            }
          />
        </label>
        <label>
          Precio máximo (€)
          <input
            min="0"
            type="number"
            value={form.maxPrice}
            onChange={(e) => setForm({ ...form, maxPrice: e.target.value })}
          />
        </label>
        <label>
          Prioridad
          <select
            value={form.priority}
            onChange={(e) =>
              setForm({ ...form, priority: e.target.value as "medium" })
            }
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>
        </label>
        <label className="full">
          Uso previsto
          <input
            value={form.plannedUse}
            onChange={(e) => setForm({ ...form, plannedUse: e.target.value })}
            placeholder="Ej. oficina, viaje, diario..."
          />
        </label>
        <div className="full">
          <span className="field-label">Temporada objetivo</span>
          <div className="chips">
            {data.settings.seasons.map((season) => (
              <button
                type="button"
                className={form.targetSeason.includes(season) ? "selected" : ""}
                onClick={() => toggleSeason(season)}
                key={season}
              >
                {season}
              </button>
            ))}
          </div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={form.waitForSale}
            onChange={(e) =>
              setForm({ ...form, waitForSale: e.target.checked })
            }
          />
          <span />
          Prefiero esperar a rebajas si conviene
        </label>
        <label className="full">
          Por qué lo quieres
          <textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button>Guardar deseo</Button>
        </div>
      </form>
    </Modal>
  );
}

type DraftItem = {
  name: string;
  category: string;
  subcategory: string;
  colors: string;
  size: string;
  price: string;
  physicalStatus: PhysicalStatus;
  decisionStatus: DecisionStatus;
  notes: string;
};
const blankDraft = (): DraftItem => ({
  name: "",
  category: "",
  subcategory: "",
  colors: "",
  size: "",
  price: "",
  physicalStatus: "new",
  decisionStatus: "keep",
  notes: "",
});
function OrderItems() {
  const d = useData(),
    [order, setOrder] = useState<PurchaseOrder>(),
    [drafts, setDrafts] = useState<DraftItem[]>([blankDraft()]),
    [split, setSplit] = useState(true);
  async function save() {
    if (!order) return;
    const valid = drafts.filter((x) => x.name && x.category);
    if (!valid.length) return;
    const existingCount = order.clothingItemIds.length,
      share = order.totalCost / (existingCount + valid.length),
      t = now(),
      items = valid.map(
        (x) =>
          ({
            id: uid(),
            name: x.name,
            category: x.category,
            subcategory: x.subcategory || undefined,
            colors: x.colors
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
            season: [],
            size: x.size || undefined,
            originalPrice: x.price ? +x.price : split ? share : undefined,
            physicalStatus: x.physicalStatus,
            decisionStatus: x.decisionStatus,
            notes: x.notes || undefined,
            purchaseOrderId: order.id,
            purchaseDate: order.date,
            store: order.store,
            createdAt: t,
            updatedAt: t,
          }) as ClothingItem,
      );
    await db.transaction(
      "rw",
      [db.clothingItems, db.purchaseOrders],
      async () => {
        await db.clothingItems.bulkAdd(items);
        await db.purchaseOrders.update(order.id, {
          clothingItemIds: [
            ...order.clothingItemIds,
            ...items.map((i) => i.id),
          ],
          updatedAt: t,
        });
      },
    );
    setOrder(undefined);
    setDrafts([blankDraft()]);
  }
  return (
    <>
      <PageHead
        eyebrow="DE LA COMPRA AL ARMARIO"
        title="Prendas desde pedidos"
      />
      <div className="order-grid">
        {d.orders.map((o) => (
          <article key={o.id}>
            <div>
              <p className="eyebrow">{dateFmt(o.date)}</p>
              <h2>{o.orderName || o.store}</h2>
              <span>
                {o.clothingItemIds.length} prendas · {money(o.totalCost)}
              </span>
            </div>
            <div className="order-items">
              {o.clothingItemIds.map((id) => {
                const i = d.items.find((x) => x.id === id);
                return (
                  i && (
                    <NavLink to={`/prenda/${id}`} key={id}>
                      <ItemThumb item={i} />
                      <span>{i.name}</span>
                    </NavLink>
                  )
                );
              })}
            </div>
            <Button variant="secondary" onClick={() => setOrder(o)}>
              <Plus /> Crear prendas
            </Button>
          </article>
        ))}
      </div>
      {!d.orders.length && (
        <Empty
          title="Primero registra una compra"
          text="Cuando tengas un pedido, podrás crear aquí todas sus prendas de una vez."
          action={
            <NavLink className="btn primary" to="/balance">
              Ir a Balance
            </NavLink>
          }
        />
      )}{" "}
      {order && (
        <Modal
          title={`Prendas de ${order.orderName || order.store}`}
          onClose={() => setOrder(undefined)}
          wide
        >
          <div className="drafts">
            {drafts.map((x, index) => (
              <div className="draft" key={index}>
                <input
                  placeholder="Nombre *"
                  value={x.name}
                  onChange={(e) =>
                    setDrafts((a) =>
                      a.map((v, i) =>
                        i === index ? { ...v, name: e.target.value } : v,
                      ),
                    )
                  }
                />
                <select
                  value={x.category}
                  onChange={(e) =>
                    setDrafts((a) =>
                      a.map((v, i) =>
                        i === index ? { ...v, category: e.target.value } : v,
                      ),
                    )
                  }
                >
                  <option value="">Categoría *</option>
                  {d.settings.categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <input
                  placeholder="Subcategoría"
                  value={x.subcategory}
                  onChange={(e) =>
                    setDrafts((a) =>
                      a.map((v, i) =>
                        i === index ? { ...v, subcategory: e.target.value } : v,
                      ),
                    )
                  }
                />
                <input
                  placeholder="Colores, separados por coma"
                  value={x.colors}
                  onChange={(e) =>
                    setDrafts((a) =>
                      a.map((v, i) =>
                        i === index ? { ...v, colors: e.target.value } : v,
                      ),
                    )
                  }
                />
                <input
                  placeholder="Talla"
                  value={x.size}
                  onChange={(e) =>
                    setDrafts((a) =>
                      a.map((v, i) =>
                        i === index ? { ...v, size: e.target.value } : v,
                      ),
                    )
                  }
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Precio individual"
                  value={x.price}
                  onChange={(e) =>
                    setDrafts((a) =>
                      a.map((v, i) =>
                        i === index ? { ...v, price: e.target.value } : v,
                      ),
                    )
                  }
                />
                <select
                  value={x.physicalStatus}
                  onChange={(e) =>
                    setDrafts((a) =>
                      a.map((v, i) =>
                        i === index
                          ? {
                              ...v,
                              physicalStatus: e.target.value as PhysicalStatus,
                            }
                          : v,
                      ),
                    )
                  }
                >
                  {Object.entries(physical).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  value={x.decisionStatus}
                  onChange={(e) =>
                    setDrafts((a) =>
                      a.map((v, i) =>
                        i === index
                          ? { ...v, decisionStatus: e.target.value as DecisionStatus }
                          : v,
                      ),
                    )
                  }
                >
                  {Object.entries(decisions).map(([k, v]) => (
                    <option value={k} key={k}>{v}</option>
                  ))}
                </select>
                <input
                  placeholder="Notas"
                  value={x.notes}
                  onChange={(e) =>
                    setDrafts((a) =>
                      a.map((v, i) =>
                        i === index ? { ...v, notes: e.target.value } : v,
                      ),
                    )
                  }
                />
                <button
                  className="icon-btn"
                  onClick={() =>
                    setDrafts((a) => a.filter((_, i) => i !== index))
                  }
                >
                  <X />
                </button>
              </div>
            ))}
          </div>
          <button
            className="add-line"
            onClick={() => setDrafts((a) => [...a, blankDraft()])}
          >
            <Plus /> Añadir otra prenda
          </button>
          <label className="toggle">
            <input
              type="checkbox"
              checked={split}
              onChange={(e) => setSplit(e.target.checked)}
            />
            <span /> Repartir el coste del pedido cuando no haya precio
            individual
          </label>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setOrder(undefined)}>
              Cancelar
            </Button>
            <Button onClick={save}>
              Crear {drafts.filter((x) => x.name && x.category).length} prendas
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default App;
