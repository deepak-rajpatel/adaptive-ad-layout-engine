import { useEffect, useState } from "react";

// Keeps the typed text locally so clearing or half-typing a value never
// pushes 0 or out-of-range numbers into the layout engine.
export function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const parsed = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(parsed) && parsed >= min && parsed <= max;
  return (
    <label className="field">
      <span>
        {label} {unit && <small>{unit}</small>}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        aria-invalid={!valid}
        onChange={(e) => {
          setText(e.target.value);
          const next = Number(e.target.value);
          if (e.target.value.trim() && next >= min && next <= max)
            onCommit(next);
        }}
        onBlur={() => {
          if (!valid) setText(String(value));
        }}
      />
      {!valid && (
        <small className="field-error">
          Enter {min}–{max}
        </small>
      )}
    </label>
  );
}
