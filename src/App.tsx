import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  Expand,
  Folder,
  Grid2X2,
  Heart,
  ImagePlus,
  Info,
  Layers,
  LogOut,
  Maximize2,
  Moon,
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
import type { Creative, Surface } from "./engine/types";
import { ids, resolve } from "./engine/resolve";
import { sample, surfaces } from "./lib/data";
import { measure } from "./lib/measure";
import { supabase } from "./lib/supabase";
import {
  download,
  draftKey,
  imageData,
  libraryKey,
  parseProject,
  readLibrary,
  readLocal,
  writeLocal,
  type SavedCreative,
} from "./lib/persistence";
import { paint, Preview } from "./components/Preview";
import { AssetLibrary } from "./components/AssetLibrary";

function initialDraft() {
  try {
    return parseProject(
      readLocal(draftKey, { creative: sample, surface: surfaces[3] }),
    );
  } catch {
    return { creative: sample, surface: surfaces[3] };
  }
}
const draft = initialDraft();
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "Something went wrong. Please try again.";

export default function App() {
  const [creative, setCreative] = useState<Creative>(draft.creative);
  const [surface, setSurface] = useState<Surface>(draft.surface);
  const [page, setPage] = useState<"studio" | "library">("studio");
  const [mobileTab, setMobileTab] = useState("preview");
  const [renderer, setRenderer] = useState<"dom" | "canvas">("dom");
  const [guides, setGuides] = useState(false);
  const [compare, setCompare] = useState(false);
  const [dark, setDark] = useState(() => readLocal("forma:dark", false));
  const [message, setMessage] = useState("");
  const [draftStatus, setDraftStatus] = useState("Draft restored");
  const [library, setLibrary] = useState<SavedCreative[]>(readLibrary);
  const [cloudItems, setCloudItems] = useState<SavedCreative[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [cloudError, setCloudError] = useState("");
  const [cloudLoading, setCloudLoading] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [name, setName] = useState("Voxora · Sound without limits");
  const [collection, setCollection] = useState("Summer campaign");
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
  const result = useMemo(
    () => resolve(creative, surface, measure),
    [creative, surface],
  );
  const coreResults = useMemo(
    () => surfaces.slice(0, 4).map((s) => resolve(creative, s, measure)),
    [creative],
  );
  const valid = result.status === "ready" || result.status === "adapted";
  const update = <K extends keyof Creative>(key: K, value: Creative[K]) =>
    setCreative((c) => ({ ...c, [key]: value }));
  const updateSurface = (key: keyof Surface, value: number) =>
    setSurface((s) => ({ ...s, [key]: value }));
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      writeLocal("forma:dark", dark);
    } catch {
      /* Theme remains usable without persistence. */
    }
  }, [dark]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        writeLocal(draftKey, { creative, surface });
        setDraftStatus("Draft saved locally");
      } catch {
        setDraftStatus("Storage full — export JSON to keep your work");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [creative, surface]);
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
    if (error)
      setCloudError(
        `Cloud library unavailable: ${error.message}. Local saving is available.`,
      );
    else
      setCloudItems(
        (data || []).filter((item) => {
          try {
            parseProject(item);
            return true;
          } catch {
            return false;
          }
        }) as SavedCreative[],
      );
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
    writeLocal(libraryKey, items);
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
      await paint(canvas, creative, surface, result);
      const blob = await new Promise<Blob | null>((done) =>
        canvas.toBlob(done),
      );
      if (!blob) throw new Error("Export failed.");
      download(blob, `forma-${surface.id}.png`);
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
      if (!image.startsWith("data:")) {
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
              { version: 1, creative: { ...creative, image }, surface },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        "forma-creative.json",
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
  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Project file must be under 4 MB.");
      const parsed = parseProject(JSON.parse(await file.text()));
      setCreative(parsed.creative);
      setSurface(parsed.surface);
      setMessage("Project imported.");
    } catch (e) {
      setMessage(errorText(e));
    }
  }
  const selectedLibrary = libraryMode === "cloud" ? cloudItems : library;
  const filtered = selectedLibrary.filter(
    (item) =>
      (!favoritesOnly || item.favorite) &&
      (collectionFilter === "All collections" ||
        item.collection === collectionFilter) &&
      `${item.name} ${item.collection}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <header className="topbar">
        <button
          className="wordmark"
          onClick={() => setPage("studio")}
          aria-label="Forma studio"
        >
          <span className="brand-mark">f</span>forma
          <span className="wordmark-dot">.</span>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={page === "studio" ? "nav-active" : ""}
            onClick={() => setPage("studio")}
          >
            Studio
          </button>
          <button
            className={page === "library" ? "nav-active" : ""}
            onClick={() => setPage("library")}
          >
            My creatives{" "}
            <span className="count">{library.length + cloudItems.length}</span>
          </button>
        </nav>
        <div className="top-actions">
          <span className="workspace-label">Your creative workspace</span>
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
        <section className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="status-dot" />{" "}
              {page === "studio"
                ? "THE ADAPTIVE CREATIVE STUDIO"
                : "YOUR CREATIVE LIBRARY"}
            </div>
            <h1>
              {page === "studio" ? (
                <>
                  One creative. <span>Every surface.</span>
                </>
              ) : (
                <>
                  Good ideas, <span>saved.</span>
                </>
              )}
            </h1>
            <p>
              {page === "studio"
                ? "Shape your message once. Watch the layout find its fit."
                : "Your campaigns, favorites, and saved versions. Ready for the next idea."}
            </p>
          </div>
          <div className="heading-actions">
            {page === "studio" ? (
              <>
                <button
                  className="button"
                  onClick={() => {
                    setSaveCloud(false);
                    setSaveError("");
                    setSaveOpen(true);
                  }}
                >
                  <Save size={16} /> Save version
                </button>
                <button
                  className="button primary"
                  disabled={!valid}
                  onClick={() => void exportPng()}
                >
                  <ArrowDownToLine size={16} /> Export PNG
                </button>
              </>
            ) : (
              <button
                className="button primary"
                onClick={() => setPage("studio")}
              >
                <Plus size={16} /> Open studio
              </button>
            )}
          </div>
        </section>
        {page === "studio" ? (
          <>
            <div
              className="mobile-tabs"
              role="tablist"
              aria-label="Workspace panels"
            >
              {["edit", "preview", "inspect"].map((tab) => (
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
                  {tab}
                </button>
              ))}
            </div>
            <div className={`workspace tab-${mobileTab}`}>
              <aside
                className="panel editor-panel"
                id="panel-edit"
                aria-label="Edit creative"
              >
                <div className="panel-title">
                  <div>
                    <span className="section-number">01</span>
                    <h2>Your creative</h2>
                  </div>
                  <button
                    className="icon-button"
                    title="Reset to sample"
                    aria-label="Reset to sample"
                    onClick={() => {
                      setCreative(sample);
                      setMessage(
                        "Sample restored. Saved versions are unchanged.",
                      );
                    }}
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
                <p className="panel-description">
                  A single source for every placement.
                </p>
                <div className="editor-fields">
                  {(["brand", "headline", "price", "cta"] as const).map(
                    (key) => (
                      <label className="field" key={key}>
                        <span>
                          {key === "price"
                            ? "Offer / price"
                            : key === "cta"
                              ? "Call to action"
                              : key}
                          <small>
                            {creative[key].length}/
                            {key === "headline" ? 160 : 60}
                          </small>
                        </span>
                        {key === "headline" ? (
                          <textarea
                            value={creative[key]}
                            maxLength={160}
                            onChange={(e) => update(key, e.target.value)}
                            rows={3}
                          />
                        ) : (
                          <input
                            value={creative[key]}
                            maxLength={60}
                            onChange={(e) => update(key, e.target.value)}
                          />
                        )}
                      </label>
                    ),
                  )}
                </div>
                <div className="field-label">
                  Product image <span>PNG, JPG, WebP</span>
                </div>
                <button
                  className="image-upload"
                  onClick={() => uploadRef.current?.click()}
                >
                  <img src={creative.image} alt="Current product" />
                  <span>
                    <strong>Make it yours</strong>
                    <small>Upload a product image</small>
                  </span>
                  <ImagePlus size={19} />
                </button>
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
                <button
                  className="text-button full"
                  onClick={() => setAssetOpen(true)}
                >
                  <Folder size={14} /> Open image library
                </button>
                <details className="details">
                  <summary>
                    Image focal point <ChevronDown size={14} />
                  </summary>
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
                </details>
                <div className="divider" />
                <div className="field-label">
                  Brand palette <span>Live contrast check</span>
                </div>
                <div className="color-fields">
                  {(["accent", "foreground", "background"] as const).map(
                    (key) => (
                      <label key={key}>
                        <input
                          type="color"
                          aria-label={`${key} color`}
                          value={creative[key]}
                          onChange={(e) => update(key, e.target.value)}
                        />
                        <span>
                          {key === "foreground"
                            ? "Text"
                            : key === "background"
                              ? "Canvas"
                              : "Accent"}
                        </span>
                      </label>
                    ),
                  )}
                </div>
                <details className="details">
                  <summary>
                    Element priorities <ChevronDown size={14} />
                  </summary>
                  <p className="help-text">
                    Lower priority elements yield first. Headline and CTA always
                    stay mandatory.
                  </p>
                  {ids
                    .filter((id) => id !== "headline" && id !== "cta")
                    .map((id) => (
                      <label className="range-field" key={id}>
                        <span>
                          {id} <b>{creative.priorities[id]}</b>
                        </span>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={creative.priorities[id]}
                          onChange={(e) =>
                            update("priorities", {
                              ...creative.priorities,
                              [id]: +e.target.value,
                            })
                          }
                        />
                      </label>
                    ))}
                </details>
                <div className="editor-bottom">
                  <button onClick={() => importRef.current?.click()}>
                    <Upload size={14} /> Import JSON
                  </button>
                  <button onClick={() => void exportJson()}>
                    <ArrowDownToLine size={14} /> Export JSON
                  </button>
                </div>
                <input
                  hidden
                  type="file"
                  accept="application/json,.json"
                  ref={importRef}
                  onChange={(e) => {
                    void importProject(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </aside>
              <section
                className="canvas-panel"
                id="panel-preview"
                aria-label="Preview creative"
              >
                <div className="canvas-toolbar">
                  <div className="canvas-label">
                    <Layers size={16} />
                    <strong>Live canvas</strong>
                    <span className="live-badge">LIVE</span>
                  </div>
                  <div className="segmented">
                    <button
                      className={renderer === "dom" ? "selected" : ""}
                      onClick={() => setRenderer("dom")}
                    >
                      DOM
                    </button>
                    <button
                      className={renderer === "canvas" ? "selected" : ""}
                      onClick={() => setRenderer("canvas")}
                    >
                      Canvas
                    </button>
                  </div>
                </div>
                <div className="canvas-stage">
                  <div className="stage-top">
                    <span>{surface.name}</span>
                    <button
                      className={`icon-button ${guides ? "active" : ""}`}
                      aria-label="Toggle safe-area guides"
                      aria-pressed={guides}
                      onClick={() => setGuides(!guides)}
                    >
                      <Expand size={16} />
                    </button>
                  </div>
                  <Preview
                    creative={creative}
                    surface={surface}
                    result={result}
                    renderer={renderer}
                    guides={guides}
                    maxHeight={440}
                  />
                  <div className="stage-caption">
                    <span>
                      {surface.width} × {surface.height} px
                    </span>
                    <span className={`status-pill ${valid ? "" : "warning"}`}>
                      <span />
                      {result.status === "ready"
                        ? "All elements fit"
                        : result.status === "adapted"
                          ? "Adapted to fit"
                          : "Needs attention"}
                    </span>
                    <span>Fit to view</span>
                  </div>
                </div>
                <div className="surfaces-section">
                  <div className="surface-heading">
                    <div>
                      <h2>One message. Four perspectives.</h2>
                      <p>Every preview uses the same creative.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setCompare(!compare)}
                    >
                      {compare ? "Collapse" : "Compare all"}{" "}
                      <Grid2X2 size={14} />
                    </button>
                  </div>
                  <div className={`surface-grid ${compare ? "expanded" : ""}`}>
                    {surfaces.slice(0, 4).map((s, i) => (
                      <button
                        key={s.id}
                        className={`surface-card ${surface.id === s.id ? "selected" : ""}`}
                        onClick={() => setSurface(s)}
                      >
                        <div className="surface-mini">
                          <Preview
                            creative={creative}
                            surface={s}
                            result={coreResults[i]}
                            maxHeight={compare ? 210 : 105}
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
                </div>
                <div className="canvas-footer">
                  <span>
                    <Check size={13} />
                    {draftStatus}
                  </span>
                  <span>Built around constraints, not breakpoints.</span>
                </div>
              </section>
              <aside
                className="panel inspector-panel"
                id="panel-inspect"
                aria-label="Inspect constraints"
              >
                <div className="panel-title">
                  <div>
                    <span className="section-number">02</span>
                    <h2>Fine-tune the fit</h2>
                  </div>
                  <Settings2 size={16} />
                </div>
                <p className="panel-description">
                  Different spaces. Intentional decisions.
                </p>
                <label className="field">
                  <span>Surface / placement</span>
                  <select
                    value={surface.id}
                    onChange={(e) =>
                      setSurface(surfaces.find((s) => s.id === e.target.value)!)
                    }
                  >
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
                    <label className="field" key={key}>
                      <span>
                        {key} <small>px</small>
                      </span>
                      <input
                        type="number"
                        min="32"
                        max="2400"
                        value={surface[key]}
                        onChange={(e) => updateSurface(key, +e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <label className="range-field">
                  <span>
                    Safe area <b>{surface.safe}px</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="120"
                    value={surface.safe}
                    onChange={(e) => updateSurface("safe", +e.target.value)}
                  />
                </label>
                <button
                  className={`guide-toggle ${guides ? "active" : ""}`}
                  onClick={() => setGuides(!guides)}
                >
                  <Maximize2 size={15} /> Show safe-area guides{" "}
                  <span>{guides ? "On" : "Off"}</span>
                </button>
                <div className="divider" />
                <div className="field-label">
                  <span className="label-icon">
                    <ShieldCheck size={16} /> Accessibility constraints
                  </span>
                </div>
                <div className="two-fields">
                  {(["minFont", "minTarget"] as const).map((key) => (
                    <label className="field" key={key}>
                      <span>
                        {key === "minFont" ? "Min. text" : "Min. target"}
                        <small>px</small>
                      </span>
                      <input
                        type="number"
                        min={key === "minFont" ? 10 : 24}
                        max={key === "minFont" ? 96 : 120}
                        value={surface[key]}
                        onChange={(e) => updateSurface(key, +e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <label className="field">
                  <span>Required contrast</span>
                  <select
                    value={surface.minContrast}
                    onChange={(e) =>
                      updateSurface("minContrast", +e.target.value)
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
                <div className="divider" />
                <div className="field-label">
                  Layout decisions <span className="live-badge">EXPLAINED</span>
                </div>
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
                <details className="details">
                  <summary>
                    Resolved geometry <ChevronDown size={14} />
                  </summary>
                  <div className="geometry-list">
                    {result.elements.map((e) => (
                      <div key={e.id}>
                        <strong>{e.id}</strong>
                        <code>
                          {Math.round(e.x)}, {Math.round(e.y)} ·{" "}
                          {Math.round(e.width)} × {Math.round(e.height)}
                        </code>
                      </div>
                    ))}
                  </div>
                </details>
                {surface.note && (
                  <p className="placement-note">
                    {surface.note}{" "}
                    <a href={surface.source} target="_blank" rel="noreferrer">
                      Size reference ↗
                    </a>
                  </p>
                )}
                <button
                  className="stress-button"
                  onClick={() => setSurface(surfaces[4])}
                >
                  <SlidersHorizontal size={16} />
                  <span>
                    Push the limits<small>Try a constrained surface</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              </aside>
            </div>
          </>
        ) : (
          <section className="library">
            <div className="library-toolbar">
              <div className="segmented">
                <button
                  className={libraryMode === "local" ? "selected" : ""}
                  onClick={() => setLibraryMode("local")}
                >
                  This browser
                </button>
                <button
                  className={libraryMode === "cloud" ? "selected" : ""}
                  onClick={() =>
                    user ? setLibraryMode("cloud") : setAuthOpen(true)
                  }
                >
                  <Cloud size={14} /> Cloud library
                </button>
              </div>
              <label className="search-field">
                <Search size={16} />
                <input
                  placeholder="Find a creative…"
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
              <button
                className={`button ${favoritesOnly ? "active" : ""}`}
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly(!favoritesOnly)}
              >
                <Heart
                  size={16}
                  fill={favoritesOnly ? "currentColor" : "none"}
                />{" "}
                Favorites
              </button>
            </div>
            <p className="library-note">
              {libraryMode === "local"
                ? "Saved on this device. Clearing browser data removes local versions. Export JSON to keep a backup."
                : `Signed in as ${user?.email}. Your saved versions are private to your account.`}
            </p>
            {libraryMode === "cloud" && cloudError && (
              <div className="notice error">
                {cloudError}
                <button
                  className="text-button"
                  onClick={() => void loadCloud()}
                >
                  Retry
                </button>
              </div>
            )}
            {cloudLoading && libraryMode === "cloud" ? (
              <p>Loading your creatives…</p>
            ) : filtered.length ? (
              <div className="library-grid">
                {filtered.map((item) => (
                  <article className="saved-card" key={item.id}>
                    <button
                      className="saved-preview"
                      onClick={() => {
                        try {
                          const parsed = parseProject(item);
                          setCreative(parsed.creative);
                          setSurface(parsed.surface);
                          setName(item.name);
                          setCollection(item.collection);
                          setPage("studio");
                        } catch (e) {
                          setMessage(errorText(e));
                        }
                      }}
                    >
                      <Preview
                        creative={item.creative}
                        surface={item.surface}
                        result={resolve(item.creative, item.surface, measure)}
                        maxHeight={210}
                      />
                    </button>
                    <div className="saved-card-body">
                      <span className="collection-tag">
                        <Folder size={12} />
                        {item.collection}
                      </span>
                      <h3>{item.name}</h3>
                      <p>
                        {new Date(item.updated_at).toLocaleDateString()} ·{" "}
                        {item.surface.name}
                      </p>
                      <div className="saved-actions">
                        <button
                          className="text-button"
                          onClick={() => void changeSaved(item, "rename")}
                        >
                          Rename
                        </button>
                        <div>
                          <button
                            className="icon-button"
                            aria-label={`Favorite ${item.name}`}
                            onClick={() => void changeSaved(item, "favorite")}
                          >
                            <Heart
                              size={16}
                              fill={item.favorite ? "currentColor" : "none"}
                            />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Duplicate ${item.name}`}
                            onClick={() => void changeSaved(item, "duplicate")}
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Delete ${item.name}`}
                            onClick={() => setDeleteId(item.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {deleteId === item.id && (
                        <div className="delete-confirm">
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
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Folder size={36} />
                <h2>
                  {favoritesOnly || query
                    ? "No matching creatives"
                    : "A home for your next great idea."}
                </h2>
                <p>
                  {favoritesOnly || query
                    ? "Try another search or clear your filters."
                    : "Save a version from the studio to start your collection."}
                </p>
                <button
                  className="button primary"
                  onClick={() => setPage("studio")}
                >
                  Back to the studio <ArrowRight size={16} />
                </button>
              </div>
            )}
          </section>
        )}
        <footer className="site-footer">
          <span>
            <span className="footer-mark">f</span> forma · Create once. Adapt
            with intention.
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
                disabled={!user}
                onChange={(e) => setSaveCloud(e.target.checked)}
              />
              Save to cloud {user ? "" : "(sign in to enable)"}
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

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-content">
        <button
          className="modal-close icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
        <span className="brand-mark">f</span>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
