import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { GENERATORS, PRIMARY_GENERATORS, getGenerator } from "../../utils/generators";
import type { GeneratorDef, GeneratorId } from "../../utils/generators";

interface Props {
  value: GeneratorId;
  onChange: (id: GeneratorId) => void;
  /** Slightly tighter paddings for the narrow extension side panel. */
  compact?: boolean;
}

/**
 * The unified "Target Generator" selector: primary generators as compact
 * pill tabs, everything else under a "More ▾" dropdown. Both image and
 * video generators live in this ONE list — no sections, no mode switch.
 * Rendered entirely from the registry, so new generators need no UI work.
 *
 * When the active generator comes from "More", the More pill shows its
 * name with the same highlighted state as a primary tab.
 */
export default function GeneratorTabs({ value, onChange, compact }: Props) {
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const activePillRef = useRef<HTMLButtonElement>(null);

  const active: GeneratorDef = getGenerator(value);
  const activeIsPrimary = PRIMARY_GENERATORS.some((g) => g.id === value);
  const moreList = GENERATORS.filter((g) => !g.primary);

  // Keep the active pill visible when the strip overflows horizontally.
  useEffect(() => {
    activePillRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [value]);

  // Close the More menu on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pillStyle = (isActive: boolean): React.CSSProperties => ({
    flex: "1 1 auto", minWidth: "max-content", whiteSpace: "nowrap",
    fontSize: 10, fontWeight: 700,
    padding: compact ? "3px 6px" : "4px 8px",
    border: "none", cursor: "pointer", letterSpacing: "0.02em",
    borderRadius: "calc(var(--radius-sm) - 2px)",
    background: isActive ? "var(--accent)" : "transparent",
    color: isActive ? "#fff" : "var(--text-muted)",
    transition: "background 120ms ease, color 120ms ease",
  });

  return (
    <div style={{
      flex: 1, minWidth: 0, display: "flex", alignItems: "stretch", gap: 3,
      background: "var(--bg-input)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)", padding: 3,
    }}>
      {/* Primary tabs — scroll horizontally when the panel is too narrow. */}
      <div className="gen-tabs-scroll" style={{
        flex: 1, display: "flex", alignItems: "stretch", gap: 3,
        overflowX: "auto", scrollbarWidth: "none", minWidth: 0,
      }}>
        {PRIMARY_GENERATORS.map((g) => (
          <button key={g.id} type="button" title={`Format prompt for ${g.label}`}
            ref={value === g.id ? activePillRef : undefined}
            aria-pressed={value === g.id}
            onClick={() => onChange(g.id)}
            style={pillStyle(value === g.id)}>
            {g.label}
          </button>
        ))}
      </div>

      {/* More ▾ — anchored outside the scroll area so the menu is never clipped. */}
      <div ref={moreRef} style={{ position: "relative", display: "flex", flexShrink: 0 }}>
        <button type="button" aria-expanded={open} aria-haspopup="menu"
          aria-pressed={!activeIsPrimary}
          title={activeIsPrimary ? "More generators" : `${active.label} — more generators`}
          onClick={() => setOpen(v => !v)}
          style={{ ...pillStyle(!activeIsPrimary), flex: "0 0 auto", display: "flex", alignItems: "center", gap: 3 }}>
          {activeIsPrimary ? "More" : active.label}
          <ChevronDown size={10} style={{ opacity: 0.8, flexShrink: 0 }}/>
        </button>

        {open && (
          <div role="menu" style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40,
            minWidth: 230, maxHeight: 320, overflowY: "auto", padding: 4,
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-md)",
          }}>
            {moreList.map((g) => (
              <button key={g.id} type="button" role="menuitemradio" aria-checked={value === g.id}
                title={g.hint}
                onClick={() => { onChange(g.id); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  textAlign: "left", padding: "7px 9px", border: "none", cursor: "pointer",
                  borderRadius: "var(--radius-xs)",
                  background: value === g.id ? "var(--accent-dim)" : "transparent",
                  color: value === g.id ? "var(--accent)" : "var(--text-secondary)",
                }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}>{g.label}</span>
                <span style={{
                  fontSize: 10, color: "var(--text-muted)", flex: 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{g.hint}</span>
                {value === g.id && <Check size={12} style={{ flexShrink: 0 }}/>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
