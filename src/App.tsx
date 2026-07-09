import {
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
  BarChart3,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Clipboard,
  ClipboardList,
  Cloud,
  Download,
  Heart,
  Home,
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
  Sparkles,
  Store,
  Trash2,
  Undo2,
  Upload,
  WalletCards,
  Wifi,
  WifiOff,
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
  ExitType,
  LocalSyncState,
  Outfit,
  PhysicalStatus,
  PurchaseOrder,
  ResaleListing,
  SaleRecord,
  Settings,
  Space,
  SpaceType,
  WishlistItem,
} from "./types";

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
const statusClass: Record<DecisionStatus, string> = {
  keep: "keep",
  sell: "sell",
  donate: "donate",
  maybe: "maybe",
  repair: "repair",
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
    | "resaleListings",
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
  await db.transaction("rw", [db.spaces, db.clothingItems], async () => {
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
      syncState: syncDefaults,
      settings: defaults,
    }
  );
}
type Data = ReturnType<typeof useData>;
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
          <Route path="/outfits" element={<Outfits />} />
          <Route path="/outfits/crear" element={<OutfitBuilder />} />
          <Route path="/usos" element={<WearHistory />} />
          <Route path="/pedidos" element={<OrderItems />} />
          <Route path="/espacios" element={<SpacesPage />} />
          <Route path="/espacios/:id" element={<SpaceDetail />} />
          <Route path="/plan-venta" element={<ResalePlan />} />
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
  ["/espacios", MapPin, "Espacios"],
  ["/outfits", Heart, "Outfits"],
  ["/usos", CalendarDays, "Usos"],
  ["/pedidos", PackagePlus, "Pedidos"],
  ["/plan-venta", Store, "Plan de venta"],
  ["/decisiones", Archive, "Decidir"],
  ["/balance", WalletCards, "Balance"],
  ["/estadisticas", BarChart3, "Estadísticas"],
  ["/ajustes", SettingsIcon, "Ajustes"],
] as const;
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
        {nav.map(([to, I, label]) => (
          <NavLink key={to} to={to} end={to === "/"}>
            <I />
            {label}
          </NavLink>
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
  const mobile = [nav[0], nav[1], nav[3], nav[7]];
  return (
    <nav className="bottom-nav">
      {mobile.map(([to, I, label]) => (
        <NavLink key={to} to={to} end={to === "/"}>
          <I />
          <span>{label}</span>
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
  if (!d.items.length && !d.orders.length && !d.sales.length && !d.wishlist.length)
    return <Welcome onAdd={() => n("/prenda/nueva")} />;
  return (
    <>
      <PageHead eyebrow="RESUMEN" title="Tu armario, hoy">
        <Button onClick={() => n("/prenda/nueva")}>
          <Plus /> Añadir prenda
        </Button>
      </PageHead>
      <section className="hero">
        <div>
          <p className="eyebrow">ESTE MES</p>
          <h2>
            {outs >= ins
              ? "Todo en equilibrio"
              : "Han entrado algunas prendas nuevas"}
          </h2>
          <p>
            {ins} entradas · {outs} salidas
          </p>
        </div>
        <div className="balance-number">
          <span>Balance del mes</span>
          <b>{money(earned - spent)}</b>
        </div>
      </section>
      <div className="stat-grid">
        <Stat label="Prendas activas" value={activeItems.length} icon={<Shirt />} />
        <Stat
          label="Gasto este mes"
          value={money(spent)}
          note={
            d.settings.monthlyClothingBudget
              ? `${money(d.settings.monthlyClothingBudget - spent)} disponibles`
              : undefined
          }
          icon={<ShoppingBag />}
        />
        <Stat
          label="Recuperado"
          value={money(earned)}
          icon={<CircleDollarSign />}
        />
        <Stat
          label="Sin usar en 90 días"
          value={forgotten}
          icon={<ClipboardList />}
        />
      </div>
      <div className="quick-links">
        <NavLink to="/usos">
          <CalendarDays />
          <span>
            <b>Registrar uso</b>
            <small>Apunta rápidamente lo que llevas</small>
          </span>
        </NavLink>
        <NavLink to="/decisiones">
          <Archive />
          <span>
            <b>Para revisar</b>
            <small>
              {counts.sell + counts.donate + counts.maybe + counts.repair}{" "}
              decisiones pendientes
            </small>
          </span>
        </NavLink>
        <NavLink to="/outfits">
          <Heart />
          <span>
            <b>Crear una combinación</b>
            <small>Mezcla prendas de tu armario</small>
          </span>
        </NavLink>
        <NavLink to="/pedidos">
          <PackagePlus />
          <span>
            <b>Nueva compra</b>
            <small>Crea prendas desde un pedido</small>
          </span>
        </NavLink>
        <NavLink to="/salidas">
          <Archive />
          <span>
            <b>Registrar salida</b>
            <small>Venta, donación u otra salida</small>
          </span>
        </NavLink>
        <NavLink to="/plan-venta">
          <Store />
          <span>
            <b>Plan de venta</b>
            <small>Organiza Vinted y tus ventas por fases</small>
          </span>
        </NavLink>
        <NavLink to="/wishlist">
          <Heart />
          <span>
            <b>Wishlist</b>
            <small>{d.wishlist.filter((w) => w.status === "pending").length} deseos pendientes</small>
          </span>
        </NavLink>
      </div>
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
                        style={{ background: colorValue(c) }}
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
const colorValue = (c: string) =>
  (
    ({
      Negro: "#292727",
      Blanco: "#f4f1eb",
      Beige: "#d8c9ad",
      Marrón: "#795548",
      Gris: "#999",
      Azul: "#557a9e",
      Verde: "#708a72",
      Rojo: "#a85c58",
      Rosa: "#d7a8ad",
      Amarillo: "#d8bc68",
      Morado: "#8b7195",
      Naranja: "#c78355",
    }) as Record<string, string>
  )[c] || "#c2bab3";

function ItemForm() {
  const { id } = useParams(),
    d = useData(),
    n = useNavigate(),
    existing = d.items.find((i) => i.id === id);
  const [form, setForm] = useState<Partial<ClothingItem>>(
      existing || {
        name: "",
        category: "",
        colors: [],
        season: [],
        physicalStatus: "good",
        decisionStatus: "keep",
      },
    ),
    [error, setError] = useState("");
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
  async function image(file?: File) {
    const compressed = await compressImage(file);
    if (compressed) {
      set("image", compressed);
      set("imageUpdatedAt", now());
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name?.trim() || !form.category)
      return setError("Indica un nombre y una categoría.");
    if ((form.originalPrice || 0) < 0 || (form.estimatedValue || 0) < 0)
      return setError("Los precios no pueden ser negativos.");
    const stamp = now();
    const item = {
      ...form,
      id: existing?.id || uid(),
      name: form.name.trim(),
      category: form.category,
      colors: form.colors || [],
      season: form.season || [],
      physicalStatus: form.physicalStatus || "good",
      decisionStatus: form.decisionStatus || "keep",
      createdAt: existing?.createdAt || stamp,
      updatedAt: stamp,
    } as ClothingItem;
    await db.clothingItems.put(item);
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
          title="Información básica"
          intro="Lo esencial para reconocerla."
        >
          <label>
            Nombre *
            <input
              value={form.name || ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ej. Camisa de lino"
            />
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
          <label>
            Subcategoría
            <input
              value={form.subcategory || ""}
              onChange={(e) => set("subcategory", e.target.value)}
              placeholder="Opcional"
            />
          </label>
          <label>
            Talla
            <input
              value={form.size || ""}
              onChange={(e) => set("size", e.target.value)}
            />
          </label>
          <label className="full">
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
        <FormSection title="Imagen" intro="Se guarda solo en tu dispositivo.">
          <label className="image-upload">
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
        <FormSection title="Clasificación">
          <div className="full">
            <span className="field-label">Colores</span>
            <div className="chips">
              {d.settings.colors.map((x) => (
                <button
                  type="button"
                  className={(form.colors || []).includes(x) ? "selected" : ""}
                  onClick={() => toggle("colors", x)}
                  key={x}
                >
                  {x}
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
          <label className="full">
            Etiquetas
            <input
              value={(form.tags || []).join(", ")}
              onChange={(e) =>
                set(
                  "tags",
                  e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
              placeholder="oficina, básico, cómodo..."
            />
          </label>
          <label>
            Marca
            <input
              value={form.brand || ""}
              onChange={(e) => set("brand", e.target.value)}
            />
          </label>
          <label>
            Tienda
            <input
              value={form.store || ""}
              onChange={(e) => set("store", e.target.value)}
            />
          </label>
        </FormSection>
        <FormSection title="Compra y valor">
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
        </FormSection>
        <FormSection title="Estado y decisión">
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
        </FormSection>
        <FormSection title="Notas">
          <label className="full">
            Algo que quieras recordar
            <textarea
              value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Cómo combinarla, arreglos pendientes..."
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
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section className="form-section">
      <header>
        <h2>{title}</h2>
        {intro && <p>{intro}</p>}
      </header>
      <div className="form-grid">{children}</div>
    </section>
  );
}

function ItemDetail() {
  const { id } = useParams(),
    d = useData(),
    n = useNavigate(),
    item = d.items.find((i) => i.id === id),
    [vintedOpen, setVintedOpen] = useState(false);
  if (!item)
    return (
      <Empty title="Prenda no encontrada" text="Puede que se haya eliminado." />
    );
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
      await db.transaction("rw", [db.clothingItems, db.wearLogs, db.resaleListings], async () => {
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
              {decisions[item.decisionStatus]}
            </span>
            <span>{physical[item.physicalStatus]}</span>
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
            <Button variant="ghost" onClick={remove}>
              <Trash2 /> Eliminar
            </Button>
            {item.decisionStatus === "sell" && !item.isArchived && (
              <Button variant="secondary" onClick={() => setVintedOpen(true)}>
                <Clipboard /> Anuncio Vinted
              </Button>
            )}
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
          </section>
          <div className="quick-decision">
            <p>Decisión rápida</p>
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
        </div>
      </div>
      {vintedOpen && (
        <VintedModal item={item} close={() => setVintedOpen(false)} />
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

function Outfits() {
  const d = useData(),
    n = useNavigate(),
    [open, setOpen] = useState<Outfit | true | false>(false);
  async function use(o: Outfit) {
    await db.wearLogs.add({
      id: uid(),
      clothingItemIds: o.clothingItemIds,
      outfitId: o.id,
      date: today(),
    });
  }
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
              <div className="outfit-collage">
                {o.clothingItemIds.slice(0, 3).map((id) => {
                  const i = d.items.find((x) => x.id === id);
                  return i && <ItemThumb key={id} item={i} />;
                })}
              </div>
              <div>
                <span className="eyebrow">{o.occasion || "COMBINACIÓN"}</span>
                <h3>
                  {o.name} {o.favorite && <Heart className="filled" />}
                </h3>
                <p>
                  {o.clothingItemIds.length} prendas · {o.season.join(", ")}
                </p>
                <div className="row">
                  <Button onClick={() => use(o)}>Usar hoy</Button>
                  <Button variant="ghost" onClick={() => setOpen(o)}>
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
      {open && (
        <OutfitModal
          data={d}
          outfit={open === true ? undefined : open}
          close={() => setOpen(false)}
        />
      )}
    </>
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
                        <p>{listing.platform} · {resaleStatuses[listing.status]}</p>
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
    [syncBusy, setSyncBusy] = useState(false);
  async function saveBudget() {
    await db.settings.update("main", {
      monthlyClothingBudget: budget ? +budget : undefined,
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
        version: 3,
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
    </>
  );
}
function ListSettings({ settings }: { settings: Settings }) {
  const [tab, setTab] = useState<
      "categories" | "colors" | "stores" | "occasions" | "frequentTags"
    >("categories"),
    [value, setValue] = useState("");
  const labels = {
    categories: "Categorías",
    colors: "Colores",
    stores: "Tiendas",
    occasions: "Ocasiones",
    frequentTags: "Etiquetas",
  };
  const values = settings[tab] || [];
  async function replace(values: string[]) {
    await db.settings.put({ ...settings, [tab]: values });
  }
  async function add() {
    const v = value.trim();
    if (!v || values.includes(v)) return;
    await replace([...values, v]);
    setValue("");
  }
  async function remove(v: string) {
    await replace(values.filter((x) => x !== v));
  }
  return (
    <section className="panel full-span">
      <h2>Listas personales</h2>
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
    priority: item?.priority || "medium",
    reason: item?.reason || "",
  });
  async function save(e: FormEvent) {
    e.preventDefault();
    const t = now();
    await db.wishlistItems.put({
      id: item?.id || uid(),
      name: form.name,
      category: form.category || undefined,
      colors: form.colors,
      store: form.store || undefined,
      estimatedPrice:
        form.estimatedPrice === "" ? undefined : +form.estimatedPrice,
      priority: form.priority as WishlistItem["priority"],
      reason: form.reason || undefined,
      status: item?.status || "pending",
      createdAt: item?.createdAt || t,
      updatedAt: t,
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
