import {
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ImagePlus,
  Megaphone,
  MousePointerClick,
  ShoppingCart,
  Trash2,
  Users,
} from "lucide-react";
import type { Goal } from "../engine/placements";
import { ctaOptions, goalOrder, intentCopy } from "../engine/creativeModel";
import { sample } from "../lib/creative";
import { imageData } from "../lib/persistence";

export interface NewAd {
  goal: Goal;
  name: string;
  headline: string;
  offer: string;
  cta: string;
  brand: string;
  image: string;
}

/** Unfinished setup values, held by the app so they survive leaving this page. */
export interface CreateForm {
  goal: Goal | null;
  name: string;
  headline: string;
  offer: string;
  cta: string;
  brand: string;
  image: string;
  /** Id of the image still being processed, or null. Only this request may set the image. */
  imageRequest: number | null;
  imageError: string;
}
export const emptyCreateForm: CreateForm = {
  goal: null,
  name: "",
  headline: "",
  offer: "",
  cta: "",
  brand: "",
  image: "",
  imageRequest: null,
  imageError: "",
};
// Module-level so ids stay unique across Create-page visits (the form outlives the page).
let lastImageRequest = 0;

const tile: Record<Goal, { label: string; icon: typeof ShoppingCart }> = {
  Sales: { label: "Sales", icon: ShoppingCart },
  Leads: { label: "Leads", icon: Users },
  Consideration: { label: "Traffic", icon: MousePointerClick },
  Awareness: { label: "Awareness", icon: Megaphone },
};

/** Short setup: only the headline is needed to begin (the button text gets a goal default). */
export function CreatePage({
  returning,
  form,
  onFormChange,
  onCreate,
  onExample,
  onBack,
}: {
  returning: boolean;
  form: CreateForm;
  onFormChange: Dispatch<SetStateAction<CreateForm>>;
  onCreate: (ad: NewAd) => void;
  onExample: () => void;
  onBack: () => void;
}) {
  const { goal, name, headline, offer, cta, brand, image, imageError } = form;
  const set = (patch: Partial<CreateForm>) =>
    onFormChange((f) => ({ ...f, ...patch }));
  const reading = form.imageRequest !== null;
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const headlineRef = useRef<HTMLTextAreaElement>(null);
  // Skipping the goal uses the product default (Sales), which the Ad Designer then shows.
  const effectiveGoal = goal ?? sample.goal;
  const suggested = intentCopy[effectiveGoal].ctas;
  const button = cta || suggested[0];
  const missingHeadline = !headline.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    // Wait for a chosen image to finish processing, so it is never silently dropped.
    if (reading) return;
    if (missingHeadline) {
      setTried(true);
      headlineRef.current?.focus();
      return;
    }
    onCreate({
      goal: effectiveGoal,
      name: name.trim(),
      headline: headline.trim(),
      offer: offer.trim(),
      cta: button,
      brand: brand.trim(),
      image,
    });
  }

  return (
    <section className="create" aria-labelledby="create-title">
      <button className="text-link back-link" onClick={onBack}>
        <ArrowLeft size={15} /> Back to Home
      </button>
      <h1 id="create-title">{returning ? "Create a new ad" : "Create your first ad"}</h1>
      <p className="create-lede">A few details to get started. You can change everything later.</p>
      <form className="create-card" onSubmit={submit} noValidate>
        <fieldset className="goal-tiles">
          <legend>What is your goal?</legend>
          <div className="goal-grid">
            {goalOrder.map((g) => {
              const Icon = tile[g].icon;
              return (
                <label key={g} className={`goal-tile ${goal === g ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="goal"
                    value={g}
                    checked={goal === g}
                    onChange={() => {
                      // Keep an explicitly chosen button text; otherwise follow the new goal.
                      const keepCta = !!cta && !intentCopy[effectiveGoal].ctas.includes(cta);
                      set(keepCta ? { goal: g } : { goal: g, cta: "" });
                    }}
                  />
                  <Icon size={22} aria-hidden="true" />
                  <span>{tile[g].label}</span>
                </label>
              );
            })}
          </div>
          <small className="create-hint">
            Optional. If you skip it, Sales is used; you can change it in the Ad Designer.
          </small>
        </fieldset>
        <div className="create-columns">
          <div>
            <label className="field">
              <span>Creative name</span>
              <input
                value={name}
                maxLength={120}
                placeholder="e.g. Summer launch"
                onChange={(e) => set({ name: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Headline</span>
              <textarea
                ref={headlineRef}
                rows={3}
                maxLength={160}
                value={headline}
                placeholder="What do you want to say?"
                aria-invalid={(tried && missingHeadline) || undefined}
                aria-describedby="headline-hint"
                onChange={(e) => set({ headline: e.target.value })}
              />
              <small
                id="headline-hint"
                className={tried && missingHeadline ? "field-error" : "create-hint"}
                role={tried && missingHeadline ? "alert" : undefined}
              >
                {tried && missingHeadline
                  ? "Add a headline to continue. It is required in every layout."
                  : "Required. Everything else can be added later."}
              </small>
            </label>
            <details className="create-more">
              <summary>
                <span>Add offer and button text</span>
                <ChevronDown size={16} className="chev" />
              </summary>
              <label className="field">
                <span>
                  {intentCopy[effectiveGoal].offerLabel} <em>(optional)</em>
                </span>
                <input
                  value={offer}
                  maxLength={60}
                  placeholder={intentCopy[effectiveGoal].offerHint}
                  onChange={(e) => set({ offer: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Button text</span>
                <select value={button} onChange={(e) => set({ cta: e.target.value })}>
                  <optgroup label={`Suggested for ${intentCopy[effectiveGoal].label}`}>
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
                </select>
              </label>
            </details>
          </div>
          <div>
            <div className="field">
              <span>
                Image <em>(optional)</em>
              </span>
              {image ? (
                <div className="create-image">
                  <img src={image} alt="Selected ad image" />
                  <div>
                    <button type="button" className="button small" onClick={() => fileRef.current?.click()}>
                      Replace
                    </button>
                    <button type="button" className="button small" onClick={() => set({ image: "", imageRequest: null, imageError: "" })}>
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="create-drop"
                  disabled={reading}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus size={28} aria-hidden="true" />
                  <strong>{reading ? "Reading image…" : "Upload image"}</strong>
                  <small>PNG, JPG or WebP · or start with text only</small>
                </button>
              )}
              {imageError && (
                <small className="field-error" role="alert">
                  {imageError}
                </small>
              )}
              <input
                ref={fileRef}
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Upload an image"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const request = ++lastImageRequest;
                  set({ imageRequest: request, imageError: "" });
                  // Applies only if this is still the pending request: a newer selection,
                  // Remove, or a cleared form makes the result stale, and it is dropped.
                  const settle = (patch: Partial<CreateForm>) =>
                    onFormChange((f) =>
                      f.imageRequest === request ? { ...f, ...patch, imageRequest: null } : f,
                    );
                  try {
                    settle({ image: await imageData(file) });
                  } catch (err) {
                    settle({
                      imageError: err instanceof Error ? err.message : "The image could not be read.",
                    });
                  }
                }}
              />
            </div>
            <details className="create-more">
              <summary>
                <span>More options</span>
                <ChevronDown size={16} className="chev" />
              </summary>
              <label className="field">
                <span>
                  Brand <em>(optional)</em>
                </span>
                <input value={brand} maxLength={60} onChange={(e) => set({ brand: e.target.value })} />
              </label>
              <small className="create-hint">
                More copy, colours and layout settings are in the Ad Designer.
              </small>
            </details>
          </div>
        </div>
        <div className="create-footer">
          <button type="button" className="text-link" onClick={onExample}>
            Use an example instead
          </button>
          <button type="submit" className="button primary" disabled={reading}>
            Open Ad Designer <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </section>
  );
}
