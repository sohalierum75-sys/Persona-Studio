import React from "react";
import { resolveOption } from "../../utils/generators";
import type {
  GeneratorDef, GeneratorOptions, OptionFieldDef, OptionValue,
} from "../../utils/generators";

interface Props {
  generator: GeneratorDef;
  options: GeneratorOptions;
  onChange: (patch: GeneratorOptions) => void;
}

// Reuses the exact visual language of the existing engine options panel.
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
  letterSpacing: "0.06em", textTransform: "uppercase",
};
const ROW: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  fontSize: 11, color: "var(--text-secondary)",
};
const FIELD_LABEL: React.CSSProperties = { minWidth: 96, flexShrink: 0 };
const INPUT: React.CSSProperties = { flex: 1, minWidth: 0, width: 0, height: 26, fontSize: 11, padding: "0 6px" };

function SegmentedField({ def, value, onChange }: {
  def: OptionFieldDef; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ ...SECTION_LABEL, textTransform: "none", fontSize: 11, marginBottom: 4 }}>
        {def.label}
      </div>
      <div style={{
        display: "flex", gap: 3, background: "var(--bg-input)",
        border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 3,
      }}>
        {(def.choices ?? []).map((c) => (
          <button key={c.value} type="button" title={def.tooltip}
            aria-pressed={value === c.value}
            onClick={() => onChange(c.value)}
            style={{
              flex: 1, fontSize: 10, fontWeight: 700, padding: "3px 4px",
              border: "none", cursor: "pointer", letterSpacing: "0.02em",
              borderRadius: "calc(var(--radius-sm) - 2px)",
              background: value === c.value ? "var(--accent)" : "transparent",
              color: value === c.value ? "#fff" : "var(--text-muted)",
              transition: "background 120ms ease, color 120ms ease",
            }}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ def, options, onChange }: {
  def: OptionFieldDef; options: GeneratorOptions; onChange: (patch: GeneratorOptions) => void;
}) {
  const value = resolveOption(def, options);
  const set = (v: OptionValue) => onChange({ [def.id]: v });

  switch (def.type) {
    case "segmented":
      return <SegmentedField def={def} value={String(value ?? "")} onChange={set}/>;

    case "select":
      return (
        <label style={ROW}>
          <span style={FIELD_LABEL} title={def.tooltip}>{def.label}</span>
          <select className="input" style={INPUT} title={def.tooltip}
            value={String(value ?? "")}
            onChange={(e) => set(e.target.value)}>
            {(def.choices ?? []).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
      );

    case "text":
      return (
        <label style={ROW}>
          <span style={FIELD_LABEL} title={def.tooltip}>{def.label}</span>
          <input className="input" style={INPUT} title={def.tooltip}
            placeholder={def.placeholder} value={typeof value === "string" ? value : ""}
            onChange={(e) => set(e.target.value)}/>
        </label>
      );

    case "number":
      return (
        <label style={ROW}>
          <span style={FIELD_LABEL} title={def.tooltip}>{def.label}</span>
          <input className="input" style={INPUT} type="number" title={def.tooltip}
            min={def.min} max={def.max} step={def.step} placeholder={def.placeholder}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => set(e.target.value === "" ? undefined : +e.target.value)}/>
        </label>
      );

    case "textarea":
      return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          <span style={{ ...FIELD_LABEL, minWidth: 0 }} title={def.tooltip}>{def.label}</span>
          <textarea className="textarea" rows={2} title={def.tooltip}
            placeholder={def.placeholder}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => set(e.target.value)}/>
        </label>
      );

    case "toggle":
      return (
        <label style={ROW}>
          <input type="checkbox" style={{ accentColor: "var(--accent)", width: 13, height: 13 }}
            checked={value === true}
            onChange={(e) => set(e.target.checked)}/>
          <span title={def.tooltip}>{def.label}</span>
        </label>
      );

    case "note":
      return <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{def.note}</div>;

    default:
      return null;
  }
}

/**
 * Renders the option fields for any generator straight from its
 * GeneratorDef — no per-generator components anywhere.
 */
export default function GeneratorOptions({ generator, options, onChange }: Props) {
  const fields = generator.options.filter((f) => !f.showIf || f.showIf(options));
  const hasInteractive = fields.some((f) => f.type !== "note");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "40vh", overflowY: "auto" }}>
      <div style={SECTION_LABEL}>{generator.label} options</div>
      {fields.map((f) => (
        <Field key={f.id} def={f} options={options} onChange={onChange}/>
      ))}
      {!hasInteractive && (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          This generator has no extra options.
        </div>
      )}
    </div>
  );
}
