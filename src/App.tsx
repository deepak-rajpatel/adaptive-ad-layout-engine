import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  Folder,
  ImagePlus,
  Info,
  Layers,
  Lock,
  LogOut,
  Moon,
  MoreHorizontal,
  Pencil,
  Star,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { Priority } from "./engine/spec";
import {
  distanceTextFloor,
  insets,
  type InputMode,
  type Surface,
  type ViewingDistance,
} from "./engine/surfaces";
import { resolve } from "./engine/resolver";
import { renderCanvas } from "./render/canvas";
// Campaign type stays in saved data (drafts, imports, planner) but has no Ad Designer control.
import {
  offerLimit,
  toSpec,
  type Creative,
  type CreativeKey,
} from "./lib/creative";
import { buttonSizes } from "./engine/spec";
import { contrast, textOn } from "./engine/contrast";
import {
  ctaOptions,
  effectivePriorities,
  goalOrder,
  intentCopy,
} from "./engine/creativeModel";
import { validDestination, type Goal } from "./engine/placements";
import "./designer.css";
import "./workflow.css";
import { editedAgo } from "./lib/time";
import { HomePage } from "./components/HomePage";
import {
  CreatePage,
  emptyCreateForm,
  type CreateForm,
  type NewAd,
} from "./components/CreatePage";
import { sample, surfaces } from "./lib/data";
import { measure } from "./lib/measure";
import { supabase } from "./lib/supabase";
import {
  download,
  draftKey,
  imageData,
  mergeLegacyPlannerSettings,
  parseProject,
  retireLegacyPlannerSettings,
  readLibrary,
  readLocal,
  schemaVersion,
  themeKey,
  toSaved,
  writeLocal,
  writeLibrary,
  type SavedCreative,
} from "./lib/persistence";
import { Preview } from "./components/Preview";
import { AssetLibrary } from "./components/AssetLibrary";
import { Modal } from "./components/Modal";
import { NumberField } from "./components/NumberField";
import { CreativePlanner } from "./components/CreativePlanner";

function initialDraft() {
  let draft: { creative: Creative; surface: Surface; name: string; savedAt: string };
  const stored = readLocal<Record<string, unknown> | null>(draftKey, null);
  // Project name and last-edit time ride along with the autosaved draft.
  const meta = {
    name: typeof stored?.name === "string" ? stored.name.slice(0, 120) : "",
    savedAt:
      typeof stored?.savedAt === "string" && Number.isFinite(Date.parse(stored.savedAt))
        ? stored.savedAt
        : "",
  };
  try {
    draft = {
      ...parseProject(stored ?? { creative: sample, surface: surfaces[3] }),
      ...meta,
    };
  } catch {
    draft = { creative: sample, surface: surfaces[3], name: "", savedAt: "" };
  }
  draft = { ...draft, creative: mergeLegacyPlannerSettings(draft.creative) };
  // Shareable review links: ?surface=kiosk&height=420 opens that preset directly.
  const params = new URLSearchParams(window.location.search);
  const preset = surfaces.find((s) => s.id === params.get("surface"));
  if (!preset) return draft;
  const height = Number(params.get("height"));
  return {
    ...draft,
    surface:
      params.has("height") && height >= 140 && height <= 2400
        ? { ...preset, height }
        : preset,
  };
}
const draft = initialDraft();
/** JSON with object keys sorted, so equal content compares equal regardless of key order. */
const stableJson = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "Something went wrong. Please try again.";
// PostgREST reports a missing table as PGRST205; Postgres as 42P01.
const setupMissing = (code?: string) => code === "PGRST205" || code === "42P01";
const setupMessage =
  "Cloud library is not set up on this deployment yet: its database tables are missing. Local saving works. The project owner must run the Supabase migrations listed in the README.";
const kioskPreset = surfaces.find((s) => s.id === "kiosk")!;
const priorityLabels: Record<"brand" | "image" | "offer", string> = {
  brand: "Branding",
  image: "Product image",
  offer: "Offer",
};
const requiredLabels: Record<CreativeKey, string> = {
  headline: "Headline",
  cta: "Button",
  brand: "Brand",
  image: "Image",
  offer: "Offer",
};
// Sales (the brief's product ad) leads the menu; a saved project's goal is kept as chosen.
const goalMenu: readonly Goal[] = goalOrder;

export default function App() {
  const [creative, setCreative] = useState<Creative>(draft.creative);
  const [surface, setSurface] = useState<Surface>(draft.surface);
  // Home is the normal entry point. Direct links keep working: ?surface=… and
  // ?view=designer open the Ad Designer, ?view=platforms and ?view=library their pages.
  const [page, setPage] = useState<
    "home" | "create" | "studio" | "planner" | "library"
  >(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    if (view === "platforms") return "planner";
    if (view === "library") return "library";
    if (view === "designer" || params.has("surface")) return "studio";
    return "home";
  });
  const [projectName, setProjectName] = useState(draft.name);
  // Unfinished Create-page inputs survive navigating away (cleared once the ad is created).
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [draftSavedAt, setDraftSavedAt] = useState(draft.savedAt);
  const draftWritten = useRef(false);
  // Block body on purpose: some browsers return a Promise from scrollTo, which React
  // would otherwise treat as a cleanup function and crash on the next page change.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  const [mobileTab, setMobileTab] = useState("preview");
  const [renderer, setRenderer] = useState<"dom" | "canvas">("dom");
  const [guides, setGuides] = useState(false);
  const [ctaCustom, setCtaCustom] = useState(false);
  // Character counters show only for the focused field (or near a limit).
  const [focused, setFocused] = useState<string | null>(null);
  const lastImage = useRef<string | null>(null);
  const [dark, setDark] = useState(() => readLocal(themeKey, false));
  const [message, setMessage] = useState("");
  const [draftStatus, setDraftStatus] = useState("Draft restored");
  const [initialLibrary] = useState(readLibrary);
  const [library, setLibrary] = useState<SavedCreative[]>(initialLibrary.items);
  useEffect(() => {
    if (initialLibrary.skipped)
      setMessage(
        `${initialLibrary.skipped} saved version${initialLibrary.skipped > 1 ? "s" : ""} in this browser could not be read and ${initialLibrary.skipped > 1 ? "are" : "is"} hidden. The stored data has not been deleted.`,
      );
  }, [initialLibrary]);
  const [cloudItems, setCloudItems] = useState<SavedCreative[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [cloudError, setCloudError] = useState("");
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudSetup, setCloudSetup] = useState<"unknown" | "ready" | "missing">(
    "unknown",
  );
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [name, setName] = useState("");
  const [collection, setCollection] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name">("recent");
  const [saveCloud, setSaveCloud] = useState(false);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState("All collections");
  const [libraryMode, setLibraryMode] = useState<"local" | "cloud">("local");
  const [assetOpen, setAssetOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const activeUserId = useRef<string | null>(null);
  const spec = useMemo(() => toSpec(creative), [creative]);
  const result = useMemo(
    () => resolve(spec, surface, measure),
    [spec, surface],
  );
  const coreResults = useMemo(
    () => surfaces.slice(0, 4).map((s) => resolve(spec, s, measure)),
    [spec],
  );
  const valid = result.status === "ready" || result.status === "adapted";
  const update = <K extends keyof Creative>(key: K, value: Creative[K]) =>
    setCreative((c) => ({ ...c, [key]: value }));
  // Editing a preset's dimensions turns it into a custom surface, so the UI
  // never labels altered geometry with a platform preset's name.
  const updateSurface = (patch: Record<string, unknown>) =>
    setSurface((s) => {
      const next = { ...s, ...patch } as Surface;
      if (JSON.stringify(next) === JSON.stringify(s)) return s;
      const custom = surfaces.find((v) => v.id === "custom")!;
      return s.id === "custom"
        ? next
        : ({
            ...next,
            id: custom.id,
            name: custom.name,
            category: custom.category,
            note: undefined,
            source: undefined,
          } as Surface);
    });
  const setInput = (input: InputMode) =>
    updateSurface(
      input === "none"
        ? { input, minTapTarget: undefined }
        : {
            input,
            minTapTarget: surface.input === "none" ? 44 : surface.minTapTarget,
          },
    );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      writeLocal(themeKey, dark);
    } catch {
      /* Theme remains usable without persistence. */
    }
  }, [dark]);
  useEffect(() => {
    const timer = setTimeout(() => {
      // The first write after load keeps the stored edit time; later writes are real edits.
      const savedAt =
        draftWritten.current || !draftSavedAt ? new Date().toISOString() : draftSavedAt;
      try {
        writeLocal(draftKey, {
          version: schemaVersion,
          creative,
          surface,
          name: projectName,
          savedAt,
        });
        draftWritten.current = true;
        setDraftSavedAt(savedAt);
        retireLegacyPlannerSettings();
        setDraftStatus("Draft saved on this device");
      } catch {
        setDraftStatus("Draft not saved: storage is full. Export JSON to keep your work.");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [creative, surface, projectName]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6500);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message);
      activeUserId.current = data.session?.user.id ?? null;
      setUser(data.session?.user ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      activeUserId.current = session?.user.id ?? null;
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") {
        setPassword("");
        setRecoveryOpen(true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function loadCloud() {
    if (!supabase || !user) return;
    const requestUserId = user.id;
    setCloudLoading(true);
    setCloudError("");
    const { data, error } = await supabase
      .from("creatives")
      .select("*")
      .order("updated_at", { ascending: false });
    if (activeUserId.current !== requestUserId) return;
    if (error) {
      const missing = setupMissing(error.code);
      setCloudSetup(missing ? "missing" : "unknown");
      setCloudError(
        missing
          ? setupMessage
          : `Cloud library unavailable: ${error.message}. Local saving is available.`,
      );
    } else {
      setCloudSetup("ready");
      const rows = data || [];
      const items = rows.flatMap(toSaved);
      setCloudItems(items);
      if (items.length < rows.length)
        setCloudError(
          `${rows.length - items.length} cloud version(s) could not be read and are hidden. They have not been deleted.`,
        );
    }
    setCloudLoading(false);
  }
  useEffect(() => {
    setCloudItems([]);
    if (user) void loadCloud();
    else {
      setCloudLoading(false);
      setLibraryMode("local");
    }
  }, [user?.id]); // User-scoped library is cleared on sign out.
  function persist(items: SavedCreative[]) {
    writeLibrary(items);
    setLibrary(items);
  }
  async function auth(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage(
        "Cloud connection is not configured. You can still use the studio locally.",
      );
      return;
    }
    setBusy(true);
    setAuthMessage("");
    try {
      const { data, error } =
        authMode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: window.location.origin },
            });
      if (error) throw error;
      if (data.session) {
        setAuthOpen(false);
        setPassword("");
        setMessage("You are signed in. Your cloud library is ready to load.");
      } else
        setAuthMessage(
          "Check your email to confirm your account, then return here to sign in.",
        );
    } catch (e) {
      setAuthMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaveError("");
    setBusy(true);
    try {
      parseProject({ creative, surface });
      if (!name.trim()) throw new Error("Give this creative a name.");
      const item: SavedCreative = {
        id: crypto.randomUUID(),
        name: name.trim(),
        collection: collection.trim() || "Unsorted",
        favorite: false,
        creative,
        surface,
        updated_at: new Date().toISOString(),
      };
      if (saveCloud) {
        if (!supabase || !user)
          throw new Error("Sign in before saving to the cloud.");
        const { error } = await supabase
          .from("creatives")
          .insert({ ...item, user_id: user.id });
        if (error) throw error;
        setCloudItems((items) => [item, ...items]);
      } else persist([item, ...library]);
      setSaveOpen(false);
      setProjectName(item.name);
      setMessage(
        saveCloud
          ? "Version saved to your cloud library."
          : "Version saved in this browser. Export JSON for a portable backup.",
      );
    } catch (e) {
      setSaveError(`Could not save: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  }
  async function changeSaved(
    item: SavedCreative,
    action: "favorite" | "delete" | "duplicate" | "rename",
  ) {
    try {
      const next =
        action === "duplicate"
          ? {
              ...item,
              id: crypto.randomUUID(),
              name: `${item.name} (copy)`,
              updated_at: new Date().toISOString(),
            }
          : {
              ...item,
              favorite: action === "favorite" ? !item.favorite : item.favorite,
            };
      if (action === "rename") {
        const nextName = window.prompt("Creative name", item.name);
        if (!nextName?.trim()) return;
        next.name = nextName.trim().slice(0, 120);
      }
      if (libraryMode === "cloud") {
        if (!supabase || !user) throw new Error("Sign in first.");
        const { error } =
          action === "delete"
            ? await supabase.from("creatives").delete().eq("id", item.id)
            : await supabase
                .from("creatives")
                .upsert({ ...next, user_id: user.id });
        if (error) throw error;
        setCloudItems((items) =>
          action === "delete"
            ? items.filter((v) => v.id !== item.id)
            : action === "duplicate"
              ? [next, ...items]
              : items.map((v) => (v.id === item.id ? next : v)),
        );
      } else
        persist(
          action === "delete"
            ? library.filter((v) => v.id !== item.id)
            : action === "duplicate"
              ? [next, ...library]
              : library.map((v) => (v.id === item.id ? next : v)),
        );
      setDeleteId(null);
    } catch (e) {
      setMessage(errorText(e));
    }
  }
  async function exportPng() {
    try {
      const canvas = document.createElement("canvas");
      await renderCanvas(canvas, result);
      const blob = await new Promise<Blob | null>((done) =>
        canvas.toBlob(done),
      );
      if (!blob) throw new Error("Export failed.");
      download(blob, `omniframe-${surface.id}.png`);
      setMessage(`Exported ${surface.width} × ${surface.height}px PNG.`);
    } catch (e) {
      setMessage(
        `Export failed: ${errorText(e)}. Upload the image locally if its host blocks export.`,
      );
    }
  }
  async function exportJson() {
    try {
      let image = creative.image;
      // An empty image means the creative has none; there is nothing to embed.
      if (image && !image.startsWith("data:")) {
        const response = await fetch(image);
        if (!response.ok)
          throw new Error(
            "Could not embed the image. Upload a local image first.",
          );
        const blob = await response.blob();
        image = await imageData(
          new File([blob], "product", { type: blob.type }),
        );
      }
      download(
        new Blob(
          [
            JSON.stringify(
              {
                version: schemaVersion,
                creative: { ...creative, image },
                surface,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        "omniframe-creative.json",
      );
      setMessage("Exported portable JSON with the product image embedded.");
    } catch (e) {
      setMessage(errorText(e));
    }
  }
  async function resetPassword() {
    if (!supabase || !email.trim()) {
      setAuthMessage("Enter your email above first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setAuthMessage(
      error
        ? error.message
        : "If this account exists, a password reset link will arrive by email.",
    );
    setBusy(false);
  }
  async function finishRecovery(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setAuthMessage(error.message);
    else {
      setRecoveryOpen(false);
      setPassword("");
      setMessage("Password updated.");
    }
    setBusy(false);
  }
  async function importProject(file?: File): Promise<boolean> {
    if (!file) return false;
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Project file must be under 4 MB.");
      const parsed = parseProject(JSON.parse(await file.text()));
      setCreative(parsed.creative);
      setSurface(parsed.surface);
      setProjectName(file.name.replace(/\.json$/i, "").slice(0, 120));
      setMessage("Project imported.");
      return true;
    } catch (e) {
      setMessage(`Import failed: ${errorText(e)}`);
      return false;
    }
  }
  const displayName =
    projectName.trim() || creative.brand.trim() || "Untitled creative";
  // Compares content, not key order: loading and upgrading rebuild objects in a different order.
  const sameWork = (
    a: { creative: Creative; surface: Surface },
    b: { creative: Creative; surface: Surface },
  ) =>
    stableJson(a.creative) === stableJson(b.creative) &&
    stableJson(a.surface) === stableJson(b.surface);
  // The built-in example is not user work; anything else (or a named project) is.
  const isUserWork =
    !!projectName.trim() ||
    !sameWork({ creative, surface }, { creative: sample, surface: surfaces[3] });
  /**
   * Keeps the current draft recoverable before it is replaced: stored in My creatives
   * (the existing local library) unless an identical version is already there.
   */
  function preserveDraft(): "kept" | "unchanged" | "failed" {
    if (!isUserWork || library.some((item) => sameWork(item, { creative, surface })))
      return "unchanged";
    try {
      parseProject({ version: schemaVersion, creative, surface });
      persist([
        {
          id: crypto.randomUUID(),
          name: `${displayName} (draft)`.slice(0, 120),
          collection: "Drafts",
          favorite: false,
          creative,
          surface,
          updated_at: new Date().toISOString(),
        },
        ...library,
      ]);
      return "kept";
    } catch (e) {
      setMessage(
        `Your current draft could not be kept, so nothing was replaced: ${errorText(e)} Fix it or export JSON first.`,
      );
      return "failed";
    }
  }
  /** Replaces the current work (after preserving it) and opens the Ad Designer. */
  function loadWork(next: { creative: Creative; surface: Surface }, nextName: string) {
    const kept = sameWork(next, { creative, surface }) ? "unchanged" : preserveDraft();
    if (kept === "failed") return false;
    setCreative(next.creative);
    setSurface(next.surface);
    setProjectName(nextName);
    setCtaCustom(false);
    lastImage.current = null;
    setPage("studio");
    if (kept === "kept") setMessage("Your previous draft was kept in My creatives.");
    return true;
  }
  function openSaved(item: SavedCreative) {
    try {
      const parsed = parseProject(item);
      if (!loadWork(parsed, item.name)) return;
      setName(item.name);
      setCollection(item.collection);
    } catch (e) {
      setMessage(`Could not open ${item.name}: ${errorText(e)}`);
    }
  }
  function createAd(ad: NewAd) {
    const created = loadWork(
      {
        creative: {
          ...sample,
          brand: ad.brand,
          headline: ad.headline,
          offer: ad.offer,
          cta: ad.cta,
          image: ad.image,
          goal: ad.goal,
          useGoalPriorities: true,
          destination: "",
          body: "",
          longHeadline: "",
          description: "",
          focalX: 50,
          focalY: 50,
          focalOverrides: {},
        },
        surface: surfaces[3],
      },
      ad.name || "Untitled creative",
    );
    if (created) setCreateForm(emptyCreateForm);
  }
  /** Imports a project file after keeping any unsaved draft (Home and Ad Designer). */
  async function importPreserving(file: File) {
    const kept = preserveDraft();
    if (kept === "failed") return;
    if (await importProject(file)) {
      setPage("studio");
      if (kept === "kept")
        setMessage("Project imported. Your previous draft was kept in My creatives.");
    }
  }
  function exportSaved(item: SavedCreative) {
    download(
      new Blob(
        [JSON.stringify({ version: schemaVersion, creative: item.creative, surface: item.surface }, null, 2)],
        { type: "application/json" },
      ),
      `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "creative"}.json`,
    );
  }
  const recentCards = useMemo(
    () =>
      [...library, ...cloudItems]
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, 3)
        .map((item) => ({
          item,
          result: resolve(toSpec(item.creative), item.surface, measure),
        })),
    [library, cloudItems],
  );
  const selectedLibrary = libraryMode === "cloud" ? cloudItems : library;
  const savedResults = useMemo(
    () =>
      new Map(
        selectedLibrary.map((item) => [
          item.id,
          resolve(toSpec(item.creative), item.surface, measure),
        ]),
      ),
    [selectedLibrary],
  );
  const filtered = selectedLibrary
    .filter(
      (item) =>
        (!favoritesOnly || item.favorite) &&
        (collectionFilter === "All collections" ||
          item.collection === collectionFilter) &&
        `${item.name} ${item.collection} ${item.creative.headline} ${item.creative.brand}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sortBy === "name"
        ? a.name.localeCompare(b.name)
        : Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
  return (
    <>
      <header className="topbar">
        <button
          className="wordmark"
          onClick={() => setPage("home")}
          aria-label="Omniframe home"
        >
          <span className="brand-mark">o</span>omniframe
          <span className="wordmark-dot">.</span>
        </button>
        <nav aria-label="Main navigation">
          {(
            [
              ["home", "Home"],
              ["studio", "Ad Designer"],
              ["planner", "Ad platforms"],
              ["library", "My creatives"],
            ] as const
          ).map(([id, label]) => {
            // Create an ad is part of the Home journey.
            const active = page === id || (id === "home" && page === "create");
            return (
              <button
                key={id}
                className={active ? "nav-active" : ""}
                aria-current={active ? "page" : undefined}
                onClick={() => setPage(id)}
              >
                {label}
              </button>
            );
          })}
        </nav>
        <div className="top-actions">
          <button
            className="icon-button"
            onClick={() => setDark(!dark)}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {dark ? <Sun /> : <Moon />}
          </button>
          {user ? (
            <button
              className="button small"
              title={user.email}
              onClick={async () => {
                const response = await supabase?.auth.signOut();
                if (response?.error) {
                  setMessage(response.error.message);
                  return;
                }
                setMessage(
                  "Signed out. Local drafts are still available in this browser.",
                );
              }}
            >
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          ) : (
            <button
              className="button small"
              onClick={() => {
                setAuthOpen(true);
                setAuthMessage("");
              }}
            >
              Sign in <ArrowRight size={15} />
            </button>
          )}
        </div>
      </header>
      <main>
        <div hidden={page !== "planner"}>
          <CreativePlanner
            creative={creative}
            projectName={displayName}
            onEditCreative={() => setPage("studio")}
            onChange={setCreative}
            onOpenStudio={(plan) => {
              const p = plan.placement;
              const { width, height } = (plan.chosenSize ?? p.accepts[0])
                .recommended;
              const identity = {
                id: `planned-${p.id}`,
                name: `${plan.format.name} · ${p.name}`.slice(0, 100),
                width,
                height,
                category: "Creative planning",
                source: p.source || undefined,
              };
              // Composed placements carry their own constraints; platform placements
              // open as a composed concept of the native image.
              setSurface(
                p.surface
                  ? ({ ...p.surface, ...identity, note: p.note } as Surface)
                  : {
                      ...identity,
                      safeArea: insets(
                        Math.max(8, Math.round(Math.min(width, height) * 0.04)),
                      ),
                      minTextSize: width >= 1000 ? 24 : 12,
                      minContrast: 4.5,
                      viewingDistance: "near",
                      input: "none",
                      note: "Composed concept. The network receives the image and copy separately; this canvas is not a submission-ready native ad.",
                    },
              );
              setPage("studio");
            }}
          />
        </div>
        {page === "planner" ? null : page === "studio" ? (
          <div className="designer">
            <section className="designer-toolbar" aria-label="Project">
              <div>
                <h1>Ad Designer</h1>
                <p>
                  {displayName} · {surface.name}{" "}
                  · <span role="status">{draftStatus}</span>
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="button"
                  onClick={() => {
                    setSaveCloud(false);
                    setSaveError("");
                    setName(displayName);
                    setSaveOpen(true);
                  }}
                >
                  <Save size={16} /> Save version
                </button>
                <button
                  className="button primary"
                  disabled={!valid}
                  title={
                    valid
                      ? undefined
                      : "Export is disabled until the layout checks pass."
                  }
                  onClick={() => void exportPng()}
                >
                  <ArrowDownToLine size={16} /> Export PNG
                </button>
              </div>
            </section>
            <div
              className="mobile-tabs"
              role="tablist"
              aria-label="Designer panels"
            >
              {(["edit", "preview", "inspect"] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  id={`tab-${tab}`}
                  aria-controls={`panel-${tab}`}
                  aria-selected={mobileTab === tab}
                  tabIndex={mobileTab === tab ? 0 : -1}
                  onClick={() => setMobileTab(tab)}
                  onKeyDown={(event) => {
                    const tabs = ["edit", "preview", "inspect"];
                    const current = tabs.indexOf(tab);
                    const next =
                      event.key === "ArrowRight"
                        ? (current + 1) % 3
                        : event.key === "ArrowLeft"
                          ? (current + 2) % 3
                          : event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? 2
                              : -1;
                    if (next < 0) return;
                    event.preventDefault();
                    setMobileTab(tabs[next]);
                    (
                      event.currentTarget.parentElement?.children[
                        next
                      ] as HTMLButtonElement
                    )?.focus();
                  }}
                >
                  {tab === "edit" ? (
                    <SlidersHorizontal size={16} />
                  ) : tab === "preview" ? (
                    <Layers size={16} />
                  ) : (
                    <Settings2 size={16} />
                  )}
                  {tab === "edit" ? "Edit" : tab === "preview" ? "Preview" : "Settings"}
                </button>
              ))}
            </div>
            <div className={`workspace tab-${mobileTab}`}>
              <aside
                className="panel editor-panel"
                id="panel-edit"
                aria-label="Your creative"
              >
                <h2 className="designer-title">Your creative</h2>
                <label className="field">
                  <span>Goal</span>
                  <select
                    value={creative.goal}
                    onChange={(e) => {
                      const goal = e.target.value as Goal;
                      setCreative((c) => {
                        // Swap the CTA only if it was one of the old goal's suggestions.
                        const suggested = intentCopy[c.goal].ctas.some(
                          (x) => x.toLowerCase() === c.cta.trim().toLowerCase(),
                        );
                        return {
                          ...c,
                          goal,
                          useGoalPriorities: true,
                          cta: suggested ? intentCopy[goal].ctas[0] : c.cta,
                        };
                      });
                    }}
                  >
                    {goalMenu.map((g) => (
                      <option key={g} value={g}>
                        {intentCopy[g].label}
                      </option>
                    ))}
                  </select>
                </label>
                {(["brand", "headline", "offer"] as const).map((key) => {
                  const limit = key === "headline" ? 160 : 60;
                  const label =
                    key === "offer"
                      ? intentCopy[creative.goal].offerLabel
                      : key === "brand"
                        ? "Brand"
                        : "Headline";
                  const missing =
                    creative.required[key] && !creative[key].trim();
                  return (
                    <label className="field" key={key}>
                      <span>
                        <span>
                          {label}
                          {!creative.required[key] && <em> (optional)</em>}
                        </span>
                        {(focused === key ||
                          creative[key].length >= limit * 0.9) && (
                          <small>
                            {creative[key].length}/{limit}
                          </small>
                        )}
                      </span>
                      {key === "headline" ? (
                        <textarea
                          value={creative[key]}
                          maxLength={limit}
                          rows={3}
                          aria-invalid={missing || undefined}
                          onFocus={() => setFocused(key)}
                          onBlur={() => setFocused(null)}
                          onChange={(e) => update(key, e.target.value)}
                        />
                      ) : (
                        <input
                          value={creative[key]}
                          maxLength={limit}
                          aria-invalid={missing || undefined}
                          placeholder={
                            key === "offer"
                              ? intentCopy[creative.goal].offerHint
                              : undefined
                          }
                          onFocus={() => setFocused(key)}
                          onBlur={() => setFocused(null)}
                          onChange={(e) => update(key, e.target.value)}
                        />
                      )}
                      {missing && (
                        <small className="field-error" role="alert">
                          {label} is required. Add it or untick it under More
                          options.
                        </small>
                      )}
                      {key === "offer" &&
                        Array.from(creative.offer).length > offerLimit && (
                          <small className="field-error" role="alert">
                            Shorten to {offerLimit} characters or fewer.
                          </small>
                        )}
                    </label>
                  );
                })}
                {(() => {
                  const match = ctaOptions.find(
                    (o) => o.toLowerCase() === creative.cta.trim().toLowerCase(),
                  );
                  const custom = ctaCustom || !match;
                  const suggested = intentCopy[creative.goal].ctas;
                  const missing = creative.required.cta && !creative.cta.trim();
                  return (
                    <label className="field">
                      <span>
                        <span>Button text</span>
                        {focused === "cta" && (
                          <small>{creative.cta.length}/60</small>
                        )}
                      </span>
                      <select
                        value={custom ? "__custom" : match}
                        onChange={(e) => {
                          if (e.target.value === "__custom") {
                            setCtaCustom(true);
                            return;
                          }
                          setCtaCustom(false);
                          update("cta", e.target.value);
                        }}
                      >
                        <optgroup
                          label={`Suggested for ${intentCopy[creative.goal].label}`}
                        >
                          {suggested.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </optgroup>
                        <optgroup label="All buttons">
                          {ctaOptions
                            .filter((o) => !suggested.includes(o))
                            .map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                        </optgroup>
                        <option value="__custom">Custom…</option>
                      </select>
                      {custom && (
                        <input
                          className="custom-cta"
                          aria-label="Custom button text"
                          value={creative.cta}
                          maxLength={60}
                          aria-invalid={missing || undefined}
                          onFocus={() => setFocused("cta")}
                          onBlur={() => setFocused(null)}
                          onChange={(e) => update("cta", e.target.value)}
                        />
                      )}
                      {missing && (
                        <small className="field-error" role="alert">
                          Button text is required.
                        </small>
                      )}
                    </label>
                  );
                })()}
                <div className="field">
                  <span>
                    <span>
                      Image
                      {!creative.required.image && <em> (optional)</em>}
                    </span>
                  </span>
                  <div className="image-row">
                    {creative.image ? (
                      <img
                        className="image-thumb"
                        src={creative.image}
                        alt="Current ad image"
                      />
                    ) : (
                      <div className="image-thumb empty" aria-hidden="true">
                        <ImagePlus size={20} />
                      </div>
                    )}
                    <button
                      className="button small"
                      onClick={() => uploadRef.current?.click()}
                    >
                      <Upload size={14} /> {creative.image ? "Replace" : "Upload"}
                    </button>
                    <details className="menu">
                      <summary
                        className="button small"
                        aria-label="More image options"
                      >
                        <MoreHorizontal size={16} />
                      </summary>
                      <div className="menu-body">
                        <button onClick={() => setAssetOpen(true)}>
                          <Folder size={14} /> Choose from image library
                        </button>
                        {creative.image ? (
                          <button
                            onClick={() => {
                              lastImage.current = creative.image;
                              update("image", "");
                            }}
                          >
                            <Trash2 size={14} /> Remove image
                          </button>
                        ) : lastImage.current ? (
                          <button
                            onClick={() => update("image", lastImage.current!)}
                          >
                            <RotateCcw size={14} /> Undo remove image
                          </button>
                        ) : null}
                      </div>
                    </details>
                  </div>
                  {creative.required.image && !creative.image && (
                    <small className="field-error" role="alert">
                      An image is required. Upload one or untick it under More
                      options.
                    </small>
                  )}
                </div>
                <input
                  ref={uploadRef}
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0];
                      if (file) update("image", await imageData(file));
                    } catch (err) {
                      setMessage(errorText(err));
                    }
                    e.target.value = "";
                  }}
                />
                {creative.image && (
                  <details className="accordion">
                    <summary>
                      <span>Image focus</span>
                      <ChevronDown size={16} className="chev" />
                    </summary>
                    <div className="accordion-body">
                      {(["focalX", "focalY"] as const).map((key) => (
                        <label className="range-field" key={key}>
                          <span>
                            {key === "focalX" ? "Horizontal" : "Vertical"}{" "}
                            <b>{creative[key]}%</b>
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={creative[key]}
                            onChange={(e) => update(key, +e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </details>
                )}
                {(() => {
                  // Automatic button text resolves to whichever of white / near-black reads better.
                  const buttonLabel = creative.buttonText || textOn(creative.accent);
                  const buttonContrast = contrast(creative.accent, buttonLabel);
                  const textContrast = contrast(creative.background, creative.foreground);
                  return (
                    <details className="accordion">
                      <summary>
                        <span>Appearance</span>
                        <span className="swatches" aria-hidden="true">
                          {[
                            creative.background,
                            creative.foreground,
                            creative.accent,
                            buttonLabel,
                          ].map((color, i) => (
                            <i key={i} style={{ background: color }} />
                          ))}
                        </span>
                        <ChevronDown size={16} className="chev" />
                      </summary>
                      <div className="accordion-body">
                        <div className="color-rows">
                          {(
                            [
                              ["background", "Background"],
                              ["foreground", "Text"],
                              ["accent", "Button fill"],
                            ] as const
                          ).map(([key, label]) => (
                            <label className="color-row" key={key}>
                              <span>{label}</span>
                              <code>{creative[key]}</code>
                              <input
                                type="color"
                                aria-label={`${label} color`}
                                value={creative[key]}
                                onChange={(e) => update(key, e.target.value)}
                              />
                            </label>
                          ))}
                          <div className="color-row">
                            <span>Button text</span>
                            <label className="auto-toggle">
                              <input
                                type="checkbox"
                                checked={!creative.buttonText}
                                onChange={(e) =>
                                  update(
                                    "buttonText",
                                    e.target.checked ? "" : buttonLabel,
                                  )
                                }
                              />
                              Auto
                            </label>
                            <input
                              type="color"
                              aria-label="Button text color"
                              value={buttonLabel}
                              disabled={!creative.buttonText}
                              onChange={(e) => update("buttonText", e.target.value)}
                            />
                          </div>
                        </div>
                        <p
                          className={`contrast-line ${textContrast < surface.minContrast || buttonContrast < surface.minContrast ? "failed" : ""}`}
                        >
                          Contrast: text {textContrast.toFixed(2)}:1 · button{" "}
                          {buttonContrast.toFixed(2)}:1 (target{" "}
                          {surface.minContrast}:1)
                        </p>
                        <div className="field">
                          <span id="button-size-label">Button size</span>
                          <div
                            className="segmented size-presets"
                            role="group"
                            aria-labelledby="button-size-label"
                          >
                            {buttonSizes.map((size) => (
                              <button
                                key={size}
                                aria-pressed={creative.buttonSize === size}
                                className={
                                  creative.buttonSize === size ? "selected" : ""
                                }
                                onClick={() => update("buttonSize", size)}
                              >
                                {size[0].toUpperCase() + size.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="range-field">
                          <span>
                            Corner rounding <b>{creative.buttonRadius} px</b>
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="40"
                            value={creative.buttonRadius}
                            onChange={(e) =>
                              update("buttonRadius", +e.target.value)
                            }
                          />
                        </label>
                        <p className="help-text">
                          Each surface's minimum text size and tap target still
                          apply, so a Small button can be enlarged on touch
                          screens. Rounding is capped at a pill shape.
                        </p>
                      </div>
                    </details>
                  );
                })()}
                <details className="accordion">
                  <summary>
                    <span>More options</span>
                    <ChevronDown size={16} className="chev" />
                  </summary>
                  <div className="accordion-body">
                    {(
                      [
                        ["longHeadline", "Long headline", 160, 2],
                        ["description", "Description", 300, 2],
                        ["body", "Primary text", 2000, 3],
                      ] as const
                    ).map(([key, label, limit, rows]) => (
                      <label className="field" key={key}>
                        <span>
                          <span>
                            {label} <em>(optional)</em>
                          </span>
                          {focused === key && (
                            <small>
                              {Array.from(creative[key]).length}/{limit}
                            </small>
                          )}
                        </span>
                        <textarea
                          rows={rows}
                          maxLength={limit}
                          value={creative[key]}
                          onFocus={() => setFocused(key)}
                          onBlur={() => setFocused(null)}
                          onChange={(e) => update(key, e.target.value)}
                        />
                      </label>
                    ))}
                    <label className="field">
                      <span>
                        <span>
                          Landing page URL <em>(optional)</em>
                        </span>
                      </span>
                      <input
                        type="url"
                        placeholder="https://yourbrand.com/product"
                        value={creative.destination}
                        onChange={(e) => update("destination", e.target.value)}
                      />
                      {creative.destination.trim() &&
                        !validDestination(creative.destination.trim()) && (
                          <small className="field-error" role="alert">
                            Enter a full http(s) address.
                          </small>
                        )}
                    </label>
                    <fieldset className="required-set">
                      <legend>Required elements</legend>
                      {(Object.keys(requiredLabels) as CreativeKey[]).map(
                        (k) => (
                          <label key={k}>
                            <input
                              type="checkbox"
                              checked={creative.required[k]}
                              disabled={
                                creative.required[k] &&
                                Object.values(creative.required).filter(Boolean)
                                  .length === 1
                              }
                              onChange={(e) =>
                                update("required", {
                                  ...creative.required,
                                  [k]: e.target.checked,
                                })
                              }
                            />
                            {requiredLabels[k]}
                          </label>
                        ),
                      )}
                      <small>
                        Required elements are never dropped by the layout
                        engine. At least one must stay required.
                      </small>
                    </fieldset>
                  </div>
                </details>
                <details className="accordion">
                  <summary>
                    <span className="summary-icon">
                      <Settings2 size={15} /> Project options
                    </span>
                    <ChevronDown size={16} className="chev" />
                  </summary>
                  <div className="accordion-body project-actions">
                    <button
                      className="button small"
                      onClick={() => importRef.current?.click()}
                    >
                      <Upload size={14} /> Import JSON
                    </button>
                    <button
                      className="button small"
                      onClick={() => void exportJson()}
                    >
                      <ArrowDownToLine size={14} /> Export JSON
                    </button>
                    <button
                      className="button small"
                      onClick={() => {
                        setCreative(sample);
                        setMessage(
                          "Sample restored. Saved versions are unchanged.",
                        );
                      }}
                    >
                      <RotateCcw size={14} /> Reset to sample
                    </button>
                  </div>
                </details>
                <input
                  hidden
                  type="file"
                  accept="application/json,.json"
                  ref={importRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    // Same protection as Home: keep an unsaved draft before replacing it.
                    if (file) void importPreserving(file);
                  }}
                />
              </aside>
              <section
                className="canvas-panel"
                id="panel-preview"
                aria-label="Live preview"
              >
                <div className="canvas-toolbar">
                  <div className="canvas-label">
                    <span
                      className={`live-dot ${valid ? "" : "warning"}`}
                      aria-hidden="true"
                    />
                    <strong>Live preview</strong>
                  </div>
                  <div className="segmented" role="group" aria-label="Renderer">
                    <button
                      className={renderer === "dom" ? "selected" : ""}
                      aria-pressed={renderer === "dom"}
                      onClick={() => setRenderer("dom")}
                    >
                      DOM
                    </button>
                    <button
                      className={renderer === "canvas" ? "selected" : ""}
                      aria-pressed={renderer === "canvas"}
                      onClick={() => setRenderer("canvas")}
                    >
                      Canvas
                    </button>
                  </div>
                </div>
                <div className="canvas-stage">
                  <Preview
                    surface={surface}
                    result={result}
                    renderer={renderer}
                    guides={guides}
                    maxHeight={460}
                  />
                  <div className="stage-caption">
                    <span>
                      {surface.width} × {surface.height}
                    </span>
                    <span
                      className={`status-pill ${valid ? "" : "warning"}`}
                      role="status"
                    >
                      <span />
                      {result.status === "ready"
                        ? "Layout fits"
                        : result.status === "adapted"
                          ? "Adapted to fit"
                          : "Layout needs attention"}
                    </span>
                    <span>Fit to view</span>
                  </div>
                </div>
                <div className="surfaces-section">
                  <div className="surface-heading">
                    <h2>Assignment surfaces</h2>
                    <p>The same spec, resolved for each surface.</p>
                  </div>
                  <div className="surface-grid">
                    {surfaces.slice(0, 4).map((s, i) => (
                      <button
                        key={s.id}
                        className={`surface-card ${surface.id === s.id ? "selected" : ""}`}
                        aria-pressed={surface.id === s.id}
                        onClick={() => setSurface(s)}
                      >
                        <div className="surface-mini">
                          <Preview
                            surface={s}
                            result={coreResults[i]}
                            maxHeight={112}
                          />
                        </div>
                        <strong>{s.name}</strong>
                        <small>
                          {s.width} × {s.height}
                          <span>{coreResults[i].arrangement || "No fit"}</span>
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="surface-footer">
                    <button
                      className="text-link"
                      onClick={() => setPage("planner")}
                    >
                      View ad platforms <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </section>
              <aside
                className="panel inspector-panel"
                id="panel-inspect"
                aria-label="Layout settings"
              >
                <h2 className="designer-title">Layout settings</h2>
                <label className="field">
                  <span>Surface / Placement</span>
                  <select
                    value={surface.id}
                    onChange={(e) =>
                      setSurface(surfaces.find((s) => s.id === e.target.value)!)
                    }
                  >
                    {!surfaces.some((s) => s.id === surface.id) && (
                      <option value={surface.id}>{surface.name}</option>
                    )}
                    {Array.from(new Set(surfaces.map((s) => s.category))).map(
                      (category) => (
                        <optgroup key={category} label={category}>
                          {surfaces
                            .filter((s) => s.category === category)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </optgroup>
                      ),
                    )}
                  </select>
                </label>
                <div className="two-fields">
                  {(["width", "height"] as const).map((key) => (
                    <NumberField
                      key={key}
                      label={key === "width" ? "Width" : "Height"}
                      unit="px"
                      min={32}
                      max={2400}
                      value={surface[key]}
                      onCommit={(v) => updateSurface({ [key]: v })}
                    />
                  ))}
                </div>
                <div className="switch-row">
                  <span id="guides-label">Safe-area guides</span>
                  <button
                    role="switch"
                    aria-checked={guides}
                    aria-labelledby="guides-label"
                    className={`switch ${guides ? "on" : ""}`}
                    onClick={() => setGuides(!guides)}
                  >
                    <span />
                  </button>
                </div>
                <div className="checks">
                  <h3>Layout checks</h3>
                  <div
                    className={`check-card ${valid ? "passed" : "failed"}`}
                    role="status"
                  >
                    {valid ? <Check size={18} /> : <Info size={18} />}
                    <div>
                      <strong>
                        {result.status === "ready"
                          ? "All checks passed"
                          : result.status === "adapted"
                            ? "Checks passed · adapted to fit"
                            : result.status === "invalid"
                              ? "Inputs need fixing"
                              : "Layout does not fit"}
                      </strong>
                      {!valid && (
                        <ul>
                          {result.errors.map((error, i) => (
                            <li key={i}>{error}</li>
                          ))}
                        </ul>
                      )}
                      <small>
                        {valid
                          ? "Bounds, overlap, minimum text, tap target and contrast. Not network approval."
                          : "Export is disabled. Shorten copy, enlarge the surface or relax a constraint below."}
                      </small>
                    </div>
                  </div>
                </div>
                <details className="accordion">
                  <summary>
                    <span>Accessibility</span>
                    <ChevronDown size={16} className="chev" />
                  </summary>
                  <div className="accordion-body">
                    <div className="two-fields">
                      <NumberField
                        label="Min. text"
                        unit="px"
                        min={distanceTextFloor[surface.viewingDistance]}
                        max={120}
                        value={surface.minTextSize}
                        onCommit={(v) => updateSurface({ minTextSize: v })}
                      />
                      {surface.input !== "none" ? (
                        <NumberField
                          label="Min. tap target"
                          unit="px"
                          min={24}
                          max={200}
                          value={surface.minTapTarget}
                          onCommit={(v) => updateSurface({ minTapTarget: v })}
                        />
                      ) : (
                        <p className="help-text">
                          Display-only surface: no tap target applies.
                        </p>
                      )}
                    </div>
                    <div className="two-fields">
                      <label className="field">
                        <span>Viewing distance</span>
                        <select
                          value={surface.viewingDistance}
                          onChange={(e) => {
                            const d = e.target.value as ViewingDistance;
                            updateSurface({
                              viewingDistance: d,
                              minTextSize: Math.max(
                                surface.minTextSize,
                                distanceTextFloor[d],
                              ),
                            });
                          }}
                        >
                          <option value="near">Near</option>
                          <option value="medium">Medium</option>
                          <option value="far">Far</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Input</span>
                        <select
                          value={surface.input}
                          onChange={(e) => setInput(e.target.value as InputMode)}
                        >
                          <option value="touch">Touch</option>
                          <option value="pointer">Pointer</option>
                          <option value="none">None</option>
                        </select>
                      </label>
                    </div>
                    <label className="field">
                      <span>Required contrast</span>
                      <select
                        value={surface.minContrast}
                        onChange={(e) =>
                          updateSurface({ minContrast: +e.target.value })
                        }
                      >
                        <option value={4.5}>4.5:1 · Standard text</option>
                        <option value={7}>7:1 · Enhanced contrast</option>
                        <option value={3}>3:1 · Large text exploration</option>
                      </select>
                    </label>
                    <div
                      className={`contrast-card ${result.contrast < surface.minContrast ? "failed" : ""}`}
                    >
                      <ShieldCheck size={20} />
                      <div>
                        <strong>
                          {result.contrast.toFixed(2)}:1 text contrast
                        </strong>
                        <small>
                          {result.contrast >= surface.minContrast
                            ? "Text / background meets your target"
                            : "Adjust your palette to meet the target"}
                        </small>
                      </div>
                    </div>
                  </div>
                </details>
                <details className="accordion">
                  <summary>
                    <span>Element priorities</span>
                    <ChevronDown size={16} className="chev" />
                  </summary>
                  <div className="accordion-body">
                    <div className="switch-row">
                      <span id="intent-priorities-label">
                        Set by goal ({intentCopy[creative.goal].label})
                      </span>
                      <button
                        role="switch"
                        aria-checked={creative.useGoalPriorities}
                        aria-labelledby="intent-priorities-label"
                        className={`switch ${creative.useGoalPriorities ? "on" : ""}`}
                        onClick={() =>
                          update("useGoalPriorities", !creative.useGoalPriorities)
                        }
                      >
                        <span />
                      </button>
                    </div>
                    <p className="help-text">
                      1 is most important. Higher numbers shrink first, then
                      drop. Headline (priority{" "}
                      {effectivePriorities(creative).priorities.headline}) and
                      button (priority{" "}
                      {effectivePriorities(creative).priorities.cta}) are
                      required by default.
                      {creative.useGoalPriorities &&
                        " Turn off “Set by goal” to edit priorities by hand."}
                    </p>
                    {(["brand", "image", "offer"] as const).map((id) => (
                      <label className="range-field" key={id}>
                        <span>
                          {id === "offer"
                            ? intentCopy[creative.goal].offerLabel
                            : priorityLabels[id]}{" "}
                          <b>
                            Priority{" "}
                            {effectivePriorities(creative).priorities[id]}
                          </b>
                        </span>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          step="1"
                          disabled={creative.useGoalPriorities}
                          value={effectivePriorities(creative).priorities[id]}
                          onChange={(e) =>
                            update("priorities", {
                              ...creative.priorities,
                              [id]: +e.target.value as Priority,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </details>
                <details className="accordion">
                  <summary>
                    <span>Layout details</span>
                    <ChevronDown size={16} className="chev" />
                  </summary>
                  <div className="accordion-body">
                    <label className="range-field">
                      <span>
                        Safe area (all sides){" "}
                        <b>
                          {surface.safeArea.top}/{surface.safeArea.right}/
                          {surface.safeArea.bottom}/{surface.safeArea.left}px
                        </b>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        value={Math.max(...Object.values(surface.safeArea))}
                        onChange={(e) =>
                          updateSurface({ safeArea: insets(+e.target.value) })
                        }
                      />
                    </label>
                    <div className="field-label">Layout decisions</div>
                    <ol className="decisions">
                      {[...result.errors, ...result.decisions].map(
                        (decision, i) => (
                          <li key={i}>
                            <span>
                              {result.errors.length ? (
                                <Info size={13} />
                              ) : (
                                <Check size={13} />
                              )}
                            </span>
                            {decision}
                          </li>
                        ),
                      )}
                    </ol>
                    <div className="field-label">Why each element is here</div>
                    <div className="geometry-list">
                      {result.elements.map((e) => (
                        <div key={e.id} className="explain-item">
                          <div>
                            <strong>{e.id}</strong>
                            <span className="role-tag">
                              {e.role} · priority {e.priority}
                            </span>
                            <code>
                              {Math.round(e.x)}, {Math.round(e.y)} ·{" "}
                              {Math.round(e.width)} × {Math.round(e.height)}
                            </code>
                          </div>
                          <ul>
                            {e.explanation.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      {result.omitted.map((o) => (
                        <div key={o.id} className="explain-item omitted">
                          <div>
                            <strong>{o.id}</strong>
                            <span className="role-tag">
                              {o.role} · priority {o.priority}
                            </span>
                            <code>omitted</code>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
                <details className="accordion">
                  <summary>
                    <span>Test smaller sizes</span>
                    <ChevronDown size={16} className="chev" />
                  </summary>
                  <div className="accordion-body kiosk-demo">
                    <p className="help-text">
                      Shrink the retail kiosk's height. Lower-priority elements
                      shrink, then drop, before the headline and button are
                      touched.
                    </p>
                    <label className="range-field">
                      <span>
                        Kiosk height{" "}
                        <b>
                          {surface.id === "kiosk"
                            ? surface.height
                            : kioskPreset.height}
                          px
                        </b>
                      </span>
                      <input
                        type="range"
                        min="140"
                        max={kioskPreset.height}
                        step="10"
                        value={
                          surface.id === "kiosk"
                            ? surface.height
                            : kioskPreset.height
                        }
                        onChange={(e) =>
                          setSurface({ ...kioskPreset, height: +e.target.value })
                        }
                      />
                    </label>
                    {surface.id === "kiosk" && (
                      <p className="help-text" role="status">
                        {result.status === "impossible" ||
                        result.status === "invalid"
                          ? "Required content no longer fits: reported as impossible."
                          : result.omitted.length
                            ? `Dropped: ${result.omitted.map((o) => `${o.id} (priority ${o.priority})`).join(", ")}. Headline and button intact.`
                            : result.status === "adapted"
                              ? "All elements kept; lower-priority text reduced."
                              : "All elements at preferred size."}
                      </p>
                    )}
                    <button
                      className="button small"
                      onClick={() => setSurface(surfaces[4])}
                    >
                      <SlidersHorizontal size={14} /> Try the constrained banner
                    </button>
                  </div>
                </details>
                {surface.note && (
                  <p className="placement-note">
                    {surface.note}{" "}
                    {surface.source && (
                      <a href={surface.source} target="_blank" rel="noreferrer">
                        Size reference ↗
                      </a>
                    )}
                  </p>
                )}
              </aside>
            </div>
          </div>
        ) : (
          <>
            {page === "library" && (
              <section className="creatives" aria-labelledby="creatives-title">
                <div className="page-head">
                  <h1 id="creatives-title">My creatives</h1>
                  <button
                    className="button primary"
                    onClick={() => setPage("create")}
                  >
                    <Plus size={16} /> Create an ad
                  </button>
                </div>
                <div className="scope-row">
                  <div className="segmented" role="group" aria-label="Where to look">
                    <button
                      className={libraryMode === "local" ? "selected" : ""}
                      aria-pressed={libraryMode === "local"}
                      onClick={() => setLibraryMode("local")}
                    >
                      This device
                    </button>
                    <button
                      className={libraryMode === "cloud" ? "selected" : ""}
                      aria-pressed={libraryMode === "cloud"}
                      onClick={() =>
                        user ? setLibraryMode("cloud") : setAuthOpen(true)
                      }
                    >
                      <Cloud size={14} /> Cloud
                      {!user && <Lock size={12} aria-label="sign in required" />}
                    </button>
                  </div>
                  {libraryMode === "local" ? (
                    <details className="storage-info">
                      <summary>
                        <Info size={14} /> Saved on this device
                      </summary>
                      <p>
                        Versions are stored in this browser only. Clearing
                        browser data removes them; use Export project from a
                        card's menu to keep a backup.
                      </p>
                    </details>
                  ) : (
                    <span className="storage-info">
                      Signed in as {user?.email}. Cloud versions are private to
                      your account.
                    </span>
                  )}
                </div>
                {libraryMode === "cloud" && cloudError && (
                  <div className="notice error" role="alert">
                    {cloudError}
                    <button
                      className="text-button"
                      onClick={() => void loadCloud()}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {selectedLibrary.length > 0 && (
                  <div className="creatives-toolbar">
                    <label className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Search creatives"
                        placeholder="Search creatives"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filter collection"
                      value={collectionFilter}
                      onChange={(e) => setCollectionFilter(e.target.value)}
                    >
                      <option>All collections</option>
                      {Array.from(
                        new Set(selectedLibrary.map((v) => v.collection)),
                      ).map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Sort"
                      value={sortBy}
                      onChange={(e) =>
                        setSortBy(e.target.value as "recent" | "name")
                      }
                    >
                      <option value="recent">Recently edited</option>
                      <option value="name">Name A–Z</option>
                    </select>
                    <button
                      className={`button ${favoritesOnly ? "active" : ""}`}
                      aria-pressed={favoritesOnly}
                      onClick={() => setFavoritesOnly(!favoritesOnly)}
                    >
                      <Star
                        size={16}
                        fill={favoritesOnly ? "currentColor" : "none"}
                      />{" "}
                      Favorites
                    </button>
                  </div>
                )}
                {cloudLoading && libraryMode === "cloud" ? (
                  <p className="library-note" role="status">
                    Loading your creatives…
                  </p>
                ) : filtered.length ? (
                  <div className="creatives-grid">
                    {filtered.map((item) => (
                      <article className="creative-card" key={item.id}>
                        <button
                          className="creative-thumb"
                          aria-label={`Open ${item.name}`}
                          onClick={() => openSaved(item)}
                        >
                          <Preview
                            surface={item.surface}
                            result={savedResults.get(item.id)!}
                            maxHeight={196}
                          />
                        </button>
                        <div className="creative-meta">
                          <div>
                            <h3>{item.name}</h3>
                            <p>
                              {editedAgo(item.updated_at)} · {item.collection} ·{" "}
                              {item.surface.name}
                            </p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Favorite ${item.name}`}
                            aria-pressed={item.favorite}
                            onClick={() => void changeSaved(item, "favorite")}
                          >
                            <Star
                              size={17}
                              fill={item.favorite ? "currentColor" : "none"}
                            />
                          </button>
                          <details className="card-menu">
                            <summary
                              className="icon-button"
                              aria-label={`More actions for ${item.name}`}
                            >
                              <MoreHorizontal size={17} />
                            </summary>
                            <div className="menu-body">
                              {(
                                [
                                  ["Open", ArrowRight, () => openSaved(item)],
                                  ["Rename", Pencil, () => void changeSaved(item, "rename")],
                                  ["Duplicate", Copy, () => void changeSaved(item, "duplicate")],
                                  ["Export project", ArrowDownToLine, () => exportSaved(item)],
                                  ["Delete", Trash2, () => setDeleteId(item.id)],
                                ] as const
                              ).map(([label, Icon, action]) => (
                                <button
                                  key={label}
                                  onClick={(e) => {
                                    e.currentTarget
                                      .closest("details")
                                      ?.removeAttribute("open");
                                    action();
                                  }}
                                >
                                  <Icon size={14} /> {label}
                                </button>
                              ))}
                            </div>
                          </details>
                        </div>
                        {deleteId === item.id && (
                          <div className="delete-confirm" role="alert">
                            Delete this saved version?
                            <button
                              onClick={() => void changeSaved(item, "delete")}
                            >
                              Delete
                            </button>
                            <button onClick={() => setDeleteId(null)}>
                              Cancel
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : selectedLibrary.length ? (
                  <div className="empty-state">
                    <h2>No matching creatives</h2>
                    <p>Try another search or clear your filters.</p>
                    <button
                      className="button"
                      onClick={() => {
                        setQuery("");
                        setFavoritesOnly(false);
                        setCollectionFilter("All collections");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="empty-state">
                    <Folder size={36} />
                    <h2>No saved creatives yet</h2>
                    <p>Save a version from the Ad Designer and it will appear here.</p>
                    <button
                      className="button primary"
                      onClick={() => setPage("create")}
                    >
                      <Plus size={16} /> Create an ad
                    </button>
                  </div>
                )}
              </section>
            )}
            {page === "home" && (
              <HomePage
                draft={
                  isUserWork
                    ? {
                        name: displayName,
                        editedAt: draftSavedAt
                          ? editedAgo(draftSavedAt)
                          : "Edited just now",
                        surface,
                        result,
                      }
                    : null
                }
                recent={recentCards}
                storageLabel={
                  user
                    ? `Signed in as ${user.email}. Drafts save on this device; Save version can also save to the cloud.`
                    : "Your work saves on this device."
                }
                onContinue={() => setPage("studio")}
                onCreate={() => setPage("create")}
                onExample={() =>
                  loadWork({ creative: sample, surface: surfaces[3] }, "")
                }
                onImport={(file) => void importPreserving(file)}
                onOpen={openSaved}
                onViewAll={() => setPage("library")}
              />
            )}
            {page === "create" && (
              <CreatePage
                returning={isUserWork || recentCards.length > 0}
                form={createForm}
                onFormChange={setCreateForm}
                onBack={() => setPage("home")}
                onExample={() =>
                  loadWork({ creative: sample, surface: surfaces[3] }, "")
                }
                onCreate={createAd}
              />
            )}
          </>
        )}
        <footer className="site-footer">
          <span>
            <span className="footer-mark">o</span> omniframe · Create once.
            Adapt with intention.
          </span>
          <a
            href="https://github.com/deepak-rajpatel/adaptive-ad-layout-engine"
            target="_blank"
            rel="noreferrer"
          >
            Explore the engine ↗
          </a>
        </footer>
      </main>
      {message && (
        <div className="toast" role="status">
          {message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {authOpen && (
        <Modal
          title={
            authMode === "login" ? "Welcome back." : "Make room for your ideas."
          }
          close={() => setAuthOpen(false)}
        >
          <p className="modal-description">
            Save your creatives across devices. The studio is always open to
            guests.
          </p>
          <form onSubmit={auth}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {authMessage && (
              <p className="notice" role="status">
                {authMessage}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Please wait…"
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}{" "}
              <ArrowRight size={16} />
            </button>
          </form>
          {authMode === "login" && (
            <button
              className="text-button full"
              disabled={busy}
              onClick={() => void resetPassword()}
            >
              Forgot password?
            </button>
          )}
          <button
            className="text-button full"
            onClick={() => {
              setAuthMode(authMode === "login" ? "signup" : "login");
              setAuthMessage("");
            }}
          >
            {authMode === "login"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
          <button
            className="text-button full muted"
            onClick={() => setAuthOpen(false)}
          >
            Continue as a guest
          </button>
        </Modal>
      )}
      {recoveryOpen && (
        <Modal
          title="Choose a new password"
          close={() => setRecoveryOpen(false)}
        >
          <form onSubmit={finishRecovery}>
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {authMessage && <p role="status">{authMessage}</p>}
            <button className="button primary full" disabled={busy}>
              Update password
            </button>
          </form>
        </Modal>
      )}
      {assetOpen && (
        <Modal title="Your image library" close={() => setAssetOpen(false)}>
          <AssetLibrary
            userId={user?.id}
            currentImage={creative.image}
            localImages={library.map((item) => item.creative.image)}
            select={(image) => {
              update("image", image);
              setAssetOpen(false);
            }}
          />
        </Modal>
      )}
      {saveOpen && (
        <Modal
          title="Save a little inspiration."
          close={() => setSaveOpen(false)}
        >
          <p className="modal-description">
            Capture this creative and its surface settings as a new version.
          </p>
          <form onSubmit={save}>
            <label className="field">
              <span>Creative name</span>
              <input
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Collection</span>
              <input
                value={collection}
                maxLength={80}
                onChange={(e) => setCollection(e.target.value)}
                placeholder="e.g. Summer campaign"
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={saveCloud}
                disabled={!user || cloudSetup !== "ready"}
                onChange={(e) => setSaveCloud(e.target.checked)}
              />
              Save to cloud{" "}
              {!user
                ? "(sign in to enable)"
                : cloudSetup === "missing"
                  ? "(not set up on this deployment)"
                  : cloudSetup === "unknown"
                    ? "(checking cloud library…)"
                    : ""}
            </label>
            {saveError && (
              <p className="notice error" role="alert">
                {saveError}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? "Saving…" : "Save version"} <Save size={16} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
