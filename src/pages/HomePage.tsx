/**
 * Persona Studio — Public Homepage
 *
 * Completely isolated from real application state.
 * - No IndexedDB reads/writes
 * - No chrome.storage access
 * - No API calls
 * - No auth state mutations
 * - All demo data is local component state only
 *
 * Routing:
 *  Unauthenticated → shown at #/
 *  Authenticated   → App.tsx redirects to #/characters
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import "./HomePage.css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DemoCharacter {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  tags: string[];
}

interface DemoScene {
  id: string;
  title: string;
  env: string;
  emoji: string;
  action: string;
}

interface DemoOutfit {
  id: string;
  label: string;
}

interface DemoCamera {
  id: string;
  label: string;
}

// ─── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_CHARACTERS: DemoCharacter[] = [
  {
    id: "maya",
    name: "Maya Chen",
    emoji: "👩‍🦱",
    desc: "Long black wavy hair, warm medium skin tone, soft oval face, expressive dark eyes.",
    tags: ["Long dark wavy hair", "Warm medium skin tone", "Soft oval face"],
  },
  {
    id: "elena",
    name: "Elena Brooks",
    emoji: "👩‍🦰",
    desc: "Shoulder-length auburn curls, fair skin, light freckles, green eyes.",
    tags: ["Auburn curls", "Fair skin, freckles", "Green eyes"],
  },
];

const DEMO_SCENES: DemoScene[] = [
  {
    id: "flower",
    title: "Flower Shop",
    env: "Small indoor flower shop",
    emoji: "🌸",
    action: "exploring fresh bouquets in a small flower shop",
  },
  {
    id: "rooftop",
    title: "Rooftop Garden",
    env: "Rooftop at sunset",
    emoji: "🌿",
    action: "walking through a rooftop garden at golden hour",
  },
  {
    id: "market",
    title: "Night Market",
    env: "Crowded outdoor market",
    emoji: "🏮",
    action: "browsing a vibrant night market full of warm lights",
  },
];

const DEMO_OUTFITS: DemoOutfit[] = [
  { id: "lavender", label: "Lavender wrap dress" },
  { id: "cream",    label: "Cream linen set" },
  { id: "blue",     label: "Deep blue casual outfit" },
];

const DEMO_CAMERAS: DemoCamera[] = [
  { id: "selfie",    label: "Arm's-length selfie" },
  { id: "cinematic", label: "Cinematic medium shot" },
  { id: "lifestyle", label: "Lifestyle close-up" },
];

// ─── Hero preview cycling state ───────────────────────────────────────────────

const HERO_CYCLE_STATES = ["character", "scene", "prompt"] as const;
type HeroCycleState = typeof HERO_CYCLE_STATES[number];

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildDemoPrompt(
  char: DemoCharacter,
  scene: DemoScene,
  outfit: DemoOutfit,
  camera: DemoCamera,
): string {
  const parts = [
    `Character: ${char.name} — ${char.desc}`,
    `Wearing: ${outfit.label}.`,
    `Setting: ${scene.title} — ${scene.env}.`,
    `Action: She is ${scene.action}.`,
    `Camera: ${camera.label}.`,
    `Preserve her established facial features, hair, skin tone, and overall identity from the reference image.`,
  ];
  return parts.join("\n");
}

// ─── FAQ data ─────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    id: "generate",
    q: "Does Persona Studio generate images or videos?",
    a: "No. Persona Studio helps you prepare, organize, and reuse character and scene prompts. You can copy those prompts into the image or video generation tool you already use.",
  },
  {
    id: "consistency",
    q: "Will my character look exactly the same every time?",
    a: "Persona Studio helps keep your references and character instructions consistent, but the final output still depends on the external generation model, settings, and reference handling.",
  },
  {
    id: "bulk",
    q: "Can I add multiple scenes at once?",
    a: "Yes. The Bulk Scene Builder lets you paste multiple scene descriptions, review the details for each, and add them to your episode in one pass instead of building them one by one.",
  },
  {
    id: "character",
    q: "Can I use my existing character?",
    a: "Yes. You can upload a reference image and add identity details like hair, skin tone, and key features directly to your character profile in Studio. Those details stay attached to every scene you plan.",
  },
  {
    id: "extension",
    q: "Does the extension share my Studio projects?",
    a: "The Chrome extension and Studio share the same signed-in account. When you sign in with the same Google account in both, your characters, episodes, and saved scenes are accessible from either place.",
  },
  {
    id: "account",
    q: "Do I need an account?",
    a: "You can use the interactive sample on this page without any account. Saving your own characters, episodes, and prompts requires signing in with an existing Google account through the Studio.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomePage() {
  // ── Header / nav
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // ── Hero cycling state
  const [heroCycle, setHeroCycle] = useState<HeroCycleState>("character");
  const heroCycleRef = useRef(0);
  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // ── Demo state (completely isolated from real app)
  const [demoChar,   setDemoChar]   = useState(DEMO_CHARACTERS[0]);
  const [demoScene,  setDemoScene]  = useState(DEMO_SCENES[0]);
  const [demoOutfit, setDemoOutfit] = useState(DEMO_OUTFITS[0]);
  const [demoCamera, setDemoCamera] = useState(DEMO_CAMERAS[0]);
  const [copyState,  setCopyState]  = useState<"idle" | "copied" | "error">("idle");

  // ── Bulk demo tab
  const [bulkTab, setBulkTab] = useState<"pasted" | "organized">("pasted");

  // ── Continuity demo state
  const [warnState, setWarnState] = useState<"warning" | "changed">("warning");

  // ── FAQ open/close
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  // ── Extension download / install guide
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [chromeUrlState, setChromeUrlState] = useState<"idle" | "copied" | "error">("idle");

  // Hero cycling effect
  useEffect(() => {
    if (reducedMotion.current) return;
    const STATES = HERO_CYCLE_STATES;
    const tick = () => {
      heroCycleRef.current = (heroCycleRef.current + 1) % STATES.length;
      setHeroCycle(STATES[heroCycleRef.current]);
    };
    const id = setInterval(tick, 3500);
    return () => clearInterval(id);
  }, []);

  // Copy prompt
  const handleCopyPrompt = useCallback(async () => {
    const prompt = buildDemoPrompt(demoChar, demoScene, demoOutfit, demoCamera);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 4000);
    }
  }, [demoChar, demoScene, demoOutfit, demoCamera]);

  // Scroll to demo
  const scrollToDemo = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById("interactive-demo")?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll to anchor
  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileNavOpen(false);
  };

  // Locate the packaged extension ZIP served alongside the site
  // (written by scripts/package-extension.mjs → dist/download/latest.json)
  useEffect(() => {
    let cancelled = false;
    fetch("/download/latest.json")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("not found"))))
      .then((meta: { file: string }) => {
        if (!cancelled) setDownloadUrl(`/download/${meta.file}`);
      })
      .catch(() => {
        if (!cancelled) setDownloadUrl(null);
      });
    return () => { cancelled = true; };
  }, []);

  // Copy chrome://extensions (clipboard API with textarea fallback)
  const handleCopyChromeUrl = useCallback(async () => {
    const text = "chrome://extensions";
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      document.body.removeChild(ta);
    }
    setChromeUrlState(ok ? "copied" : "error");
    setTimeout(() => setChromeUrlState("idle"), ok ? 2200 : 4000);
  }, []);

  const livePrompt = buildDemoPrompt(demoChar, demoScene, demoOutfit, demoCamera);

  return (
    <div className="hp-root">
      <div className="hp-content">

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <header className="hp-header" role="banner">
          <div className="hp-header-inner">
            {/* Logo */}
            <a href="#/" className="hp-logo" aria-label="Persona Studio home">
              <img src="/logo.png" alt="" className="hp-logo-icon" aria-hidden="true" />
              <span className="hp-logo-name">Persona Studio</span>
            </a>

            {/* Desktop nav */}
            <nav className="hp-nav" aria-label="Page navigation">
              <button className="hp-nav-link" onClick={scrollTo("how-it-works")}>
                How it works
              </button>
              <button className="hp-nav-link" onClick={scrollTo("features")}>
                Features
              </button>
              <button className="hp-nav-link" onClick={scrollTo("faq")}>
                FAQ
              </button>
            </nav>

            {/* Actions */}
            <div className="hp-header-actions">
              {downloadUrl ? (
                <a href={downloadUrl} download className="hp-btn-ghost" id="header-download-extension">
                  <DownloadIcon size={14} />
                  Download Extension
                </a>
              ) : (
                <button
                  className="hp-btn-ghost"
                  disabled
                  id="header-download-extension"
                  title="Extension package not built — run npm run package:extension"
                >
                  <DownloadIcon size={14} />
                  Download Extension
                </button>
              )}
              <a href="#/characters" className="hp-btn-ghost">
                Sign in
              </a>
              <a href="#/characters" className="hp-btn-primary">
                Open Studio
              </a>
            </div>

            {/* Mobile menu button */}
            <button
              className="hp-menu-btn"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
            >
              ☰
            </button>
          </div>
        </header>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <div
            className="hp-mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            onClick={(e) => { if (e.target === e.currentTarget) setMobileNavOpen(false); }}
          >
            <div className="hp-mobile-nav-panel">
              <button
                className="hp-mobile-nav-close"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
              >
                ✕
              </button>
              <button className="hp-mobile-nav-link" onClick={scrollTo("how-it-works")}>
                How it works
              </button>
              <button className="hp-mobile-nav-link" onClick={scrollTo("features")}>
                Features
              </button>
              <button className="hp-mobile-nav-link" onClick={scrollTo("faq")}>
                FAQ
              </button>
              <div className="hp-mobile-nav-divider" />
              <a href="#/characters" className="hp-mobile-nav-link">Sign in</a>
              {downloadUrl && (
                <a href={downloadUrl} download className="hp-mobile-nav-link">
                  Download Extension ↓
                </a>
              )}
              <a href="#/characters" className="hp-mobile-nav-link" style={{ color: "#A99BFF" }}>
                Open Studio →
              </a>
            </div>
          </div>
        )}

        {/* ── HERO ───────────────────────────────────────────────────── */}
        <section className="hp-hero" id="hero" aria-label="Hero">
          <div className="hp-hero-inner">
            {/* Left: text */}
            <div className="hp-hero-text">
              <span className="hp-hero-eyebrow">
                Character continuity for AI creators
              </span>

              <h1 className="hp-hero-headline">
                One character.<br />
                <em>Every scene.</em>
              </h1>

              <p className="hp-hero-desc">
                Keep character details, outfits, locations, and prompts
                together—from your first scene to your next episode.
              </p>

              <div className="hp-hero-ctas">
                <a
                  href="#/characters"
                  className="hp-btn-hero-primary"
                  id="hero-start-creating"
                >
                  Start Creating
                </a>
                {downloadUrl ? (
                  <a
                    href={downloadUrl}
                    download
                    className="hp-btn-hero-secondary"
                    id="hero-download-extension"
                  >
                    <DownloadIcon size={16} />
                    Download Extension
                  </a>
                ) : (
                  <button
                    className="hp-btn-hero-secondary"
                    disabled
                    id="hero-download-extension"
                    title="Extension package not built — run npm run package:extension"
                  >
                    <DownloadIcon size={16} />
                    Download Extension
                  </button>
                )}
                <button
                  className="hp-btn-hero-secondary"
                  onClick={scrollToDemo}
                  id="hero-try-demo"
                >
                  Try the Demo
                </button>
              </div>

              {/* How to install — compact expandable */}
              <div className={`hp-install${installOpen ? " open" : ""}`}>
                <button
                  className="hp-install-trigger"
                  onClick={() => setInstallOpen(!installOpen)}
                  aria-expanded={installOpen}
                  aria-controls="install-steps"
                  id="install-toggle"
                >
                  How to install
                  <span className="hp-install-chevron" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </span>
                </button>
                <div
                  className="hp-install-body"
                  id="install-steps"
                  role="region"
                  aria-labelledby="install-toggle"
                  aria-hidden={!installOpen}
                >
                  <p className="hp-install-note">
                    This is a manual installation — downloading the ZIP does not
                    install the extension automatically. The steps below load it
                    into Chrome from the extracted folder.
                  </p>
                  <ol className="hp-install-steps">
                    <li>Download the ZIP above and extract it.</li>
                    <li>Open <code>chrome://extensions</code>.</li>
                    <li>Enable <strong>Developer mode</strong>.</li>
                    <li>Click <strong>Load unpacked</strong> and select the extracted folder.</li>
                    <li>Open Persona Studio from Chrome's Extensions menu (puzzle-piece icon) and sign in.</li>
                  </ol>
                  <div className="hp-install-url-row">
                    <code className="hp-install-url">chrome://extensions</code>
                    <button
                      className={`hp-install-copy-btn${chromeUrlState === "copied" ? " copied" : ""}`}
                      onClick={handleCopyChromeUrl}
                      aria-label="Copy chrome://extensions to clipboard"
                    >
                      {chromeUrlState === "copied" ? (
                        <>
                          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path d="M2 7L5.5 10.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                            <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  {chromeUrlState === "error" && (
                    <p className="hp-install-copy-error" role="alert">
                      Couldn't copy automatically — type the address manually.
                    </p>
                  )}
                </div>
              </div>

              <div className="hp-hero-value-props" aria-label="Key features">
                <span className="hp-vp-tag">Characters</span>
                <span className="hp-vp-dot" aria-hidden="true">·</span>
                <span className="hp-vp-tag">Scenes</span>
                <span className="hp-vp-dot" aria-hidden="true">·</span>
                <span className="hp-vp-tag">Continuity</span>
              </div>
            </div>

            {/* Right: Studio preview composition */}
            <div className="hp-hero-visual" aria-hidden="true">
              <HeroStudioPreview cycleState={heroCycle} />
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS — INTERACTIVE DEMO ────────────────────────── */}
        <section
          className="hp-demo-section hp-section"
          id="how-it-works"
          aria-label="Interactive demo"
        >
          <div className="hp-container">
            <div className="hp-demo-header">
              <div className="hp-demo-badge" aria-label="Live interactive example">
                Interactive example — sample data
              </div>
              <h2 className="hp-section-heading" style={{ textAlign: "center" }}>
                From an idea to a usable prompt.
              </h2>
              <p className="hp-section-sub" style={{ textAlign: "center", margin: "0 auto" }}>
                Try the workflow without creating an account.
              </p>
            </div>

            <div
              id="interactive-demo"
              className="hp-demo-layout"
            >
              {/* Controls */}
              <div className="hp-demo-steps">
                {/* Step 1 — Character */}
                <div className="hp-demo-step active" id="demo-step-character">
                  <div className="hp-demo-step-label">1. Choose a character</div>
                  <div className="hp-char-options" role="radiogroup" aria-label="Select character">
                    {DEMO_CHARACTERS.map((char) => (
                      <button
                        key={char.id}
                        className={`hp-char-option${demoChar.id === char.id ? " selected" : ""}`}
                        onClick={() => setDemoChar(char)}
                        role="radio"
                        aria-checked={demoChar.id === char.id}
                        id={`char-option-${char.id}`}
                      >
                        <div className="hp-char-avatar" aria-hidden="true">{char.emoji}</div>
                        <div>
                          <div className="hp-char-name">{char.name}</div>
                          <div className="hp-char-desc">{char.desc}</div>
                        </div>
                        <div className="hp-char-check" aria-hidden="true">
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                            <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2 — Scene */}
                <div className="hp-demo-step active" id="demo-step-scene">
                  <div className="hp-demo-step-label">2. Choose a scene</div>
                  <div className="hp-scene-options" role="radiogroup" aria-label="Select scene">
                    {DEMO_SCENES.map((scene) => (
                      <button
                        key={scene.id}
                        className={`hp-scene-option${demoScene.id === scene.id ? " selected" : ""}`}
                        onClick={() => setDemoScene(scene)}
                        role="radio"
                        aria-checked={demoScene.id === scene.id}
                        id={`scene-option-${scene.id}`}
                      >
                        <span className="hp-scene-icon" aria-hidden="true">{scene.emoji}</span>
                        <div>
                          <div className="hp-scene-title">{scene.title}</div>
                          <div className="hp-scene-env">{scene.env}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 3 — Style */}
                <div className="hp-demo-step active" id="demo-step-style">
                  <div className="hp-demo-step-label">3. Style the scene</div>
                  <div className="hp-style-grid">
                    <div>
                      <div className="hp-style-group-label">Outfit</div>
                      <div className="hp-chip-row" role="radiogroup" aria-label="Outfit">
                        {DEMO_OUTFITS.map((o) => (
                          <button
                            key={o.id}
                            className={`hp-chip${demoOutfit.id === o.id ? " selected" : ""}`}
                            onClick={() => setDemoOutfit(o)}
                            role="radio"
                            aria-checked={demoOutfit.id === o.id}
                            id={`outfit-${o.id}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="hp-style-group-label">Camera style</div>
                      <div className="hp-chip-row" role="radiogroup" aria-label="Camera style">
                        {DEMO_CAMERAS.map((c) => (
                          <button
                            key={c.id}
                            className={`hp-chip${demoCamera.id === c.id ? " selected" : ""}`}
                            onClick={() => setDemoCamera(c)}
                            role="radio"
                            aria-checked={demoCamera.id === c.id}
                            id={`camera-${c.id}`}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live prompt */}
              <div className="hp-demo-prompt-panel" id="demo-step-prompt">
                <div className="hp-demo-prompt-header">
                  <div>
                    <div className="hp-demo-prompt-title">Your prompt</div>
                    <div className="hp-demo-prompt-meta">
                      {demoChar.name} · {demoScene.title}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#3D4255" }}>
                    {livePrompt.length} chars
                  </div>
                </div>

                <div className="hp-demo-prompt-body">
                  <div
                    className="hp-prompt-text-area"
                    role="textbox"
                    aria-readonly="true"
                    aria-label="Generated prompt"
                    aria-multiline="true"
                  >
                    {livePrompt.split("\n").map((line, i) => {
                      const isFirst = i === 0;
                      if (isFirst) {
                        const [charPart, ...rest] = line.split(" — ");
                        return (
                          <React.Fragment key={i}>
                            <strong>{charPart}</strong>
                            {rest.length > 0 ? " — " + rest.join(" — ") : ""}
                            {"\n"}
                          </React.Fragment>
                        );
                      }
                      return <React.Fragment key={i}>{line}{"\n"}</React.Fragment>;
                    })}
                  </div>

                  <button
                    className={`hp-copy-btn${copyState === "copied" ? " copied" : ""}`}
                    onClick={handleCopyPrompt}
                    id="demo-copy-btn"
                    aria-label="Copy prompt to clipboard"
                  >
                    {copyState === "copied" ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <path d="M2 7L5.5 10.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        Copy Prompt
                      </>
                    )}
                  </button>

                  {/* Accessible live region for copy feedback */}
                  <div
                    aria-live="polite"
                    aria-atomic="true"
                    className="hp-copy-feedback"
                    role="status"
                  >
                    {copyState === "copied" ? "Prompt copied to clipboard." : ""}
                  </div>

                  {copyState === "error" && (
                    <p className="hp-copy-error" role="alert">
                      Couldn't copy automatically. Select the prompt text above and copy it manually.
                    </p>
                  )}
                </div>

                <div className="hp-demo-cta">
                  <a href="#/characters" className="hp-demo-cta-link" id="demo-create-own">
                    Create your own character →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── WORKFLOW ────────────────────────────────────────────────── */}
        <section
          className="hp-workflow-section hp-section"
          id="workflow"
          aria-label="How Persona Studio works"
        >
          <div className="hp-container">
            <div className="hp-section-label">Workflow</div>
            <h2 className="hp-section-heading">
              Build once. Reuse the details that matter.
            </h2>

            <div className="hp-workflow-steps" id="how-it-works">
              {/* Step 01 */}
              <div className="hp-workflow-step">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="hp-workflow-step-num">01</div>
                  <div className="hp-workflow-step-title">Save your character</div>
                </div>
                <div className="hp-workflow-card">
                  <div className="hp-mini-char-card">
                    <div className="hp-mini-char-avatar" aria-hidden="true">👩‍🦱</div>
                    <div className="hp-mini-char-info">
                      <div className="hp-mini-char-name">Maya Chen</div>
                      <div className="hp-mini-lock-badge">
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <rect x="2.5" y="5" width="7" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M4 5V3.5a2 2 0 1 1 4 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                        Identity details locked
                      </div>
                      <div className="hp-mini-tags">
                        <div className="hp-mini-tag">· Long dark wavy hair</div>
                        <div className="hp-mini-tag">· Warm medium skin tone</div>
                        <div className="hp-mini-tag">· Soft oval face</div>
                      </div>
                    </div>
                  </div>
                  <div className="hp-workflow-card-body">
                    <p className="hp-workflow-caption">
                      Keep the core character details beside the reference you already use.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 02 */}
              <div className="hp-workflow-step">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="hp-workflow-step-num">02</div>
                  <div className="hp-workflow-step-title">Plan your scenes</div>
                </div>
                <div className="hp-workflow-card">
                  <div style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "8px 0" }}>
                    {[
                      { label: "Location", value: "Flower Shop" },
                      { label: "Outfit",   value: "Lavender wrap dress" },
                      { label: "Action",   value: "Exploring fresh bouquets" },
                      { label: "Camera",   value: "Arm's-length selfie" },
                      { label: "Dialogue", value: "This place smells incredible." },
                    ].map((field) => (
                      <div key={field.label} className="hp-mini-scene-field">
                        <div className="hp-mini-field-label">{field.label}</div>
                        <div className="hp-mini-field-value">{field.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="hp-workflow-card-body">
                    <p className="hp-workflow-caption">
                      Turn an episode idea into structured scenes without losing the context.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 03 */}
              <div className="hp-workflow-step">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="hp-workflow-step-num">03</div>
                  <div className="hp-workflow-step-title">Copy ready-to-use prompts</div>
                </div>
                <div className="hp-workflow-card">
                  <div className="hp-mini-prompt-text">
                    <strong>Character: Maya Chen</strong> — Long dark wavy hair, warm medium skin tone, soft oval face.{"\n"}
                    Wearing: Lavender wrap dress.{"\n"}
                    Setting: Flower Shop — Small indoor flower shop.{"\n"}
                    Action: Exploring fresh bouquets.{"\n"}
                    Camera: Arm's-length selfie.
                  </div>
                  <div className="hp-mini-prompt-actions">
                    <div className="hp-mini-action-btn copy">
                      <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                      Copy prompt
                    </div>
                  </div>
                  <div className="hp-workflow-card-body">
                    <p className="hp-workflow-caption">
                      Review the assembled prompt, then copy it into the generation tool you use.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CONTINUITY VS VARIETY ───────────────────────────────────── */}
        <section
          className="hp-continuity-section hp-section"
          aria-label="Continuity and variety"
        >
          <div className="hp-container">
            <div className="hp-section-label">Continuity</div>
            <h2 className="hp-section-heading">
              Stay consistent when it matters.<br />
              Change things when it doesn't.
            </h2>
            <p className="hp-section-sub">
              Continuity for connected scenes. Fresh choices when you want them.
            </p>

            <div className="hp-continuity-cards">
              {/* Left — connected scenes */}
              <div className="hp-continuity-card" aria-label="Connected scenes example">
                <div className="hp-continuity-card-label connected">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <circle cx="5" cy="5" r="4" fill="currentColor" opacity="0.5"/>
                    <circle cx="5" cy="5" r="2" fill="currentColor"/>
                  </svg>
                  Connected scenes
                </div>

                <div className="hp-outfit-carry-badge">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Outfit carried forward
                </div>

                <div className="hp-connected-scenes">
                  {[
                    { n: "01", title: "Flower Shop",  loc: "Indoor" },
                    { n: "02", title: "Street Walk",  loc: "Urban" },
                    { n: "03", title: "Cafe Table",   loc: "Indoor" },
                  ].map((s) => (
                    <div key={s.n} className="hp-conn-scene">
                      <div className="hp-conn-scene-title">
                        <span style={{ color: "#3D4255", marginRight: 6, fontSize: 10 }}>Scene {s.n}</span>
                        {s.title}
                      </div>
                      <div className="hp-conn-outfit-badge">
                        <svg width="8" height="8" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M2 4c0 0 1-1 4-1s4 1 4 1v6H2V4z" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M4 4V3a2 2 0 1 1 4 0v1" stroke="currentColor" strokeWidth="1.2"/>
                        </svg>
                        Lavender wrap dress
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: "0 16px 16px" }}>
                  <p style={{ fontSize: 12, color: "#5E6473" }}>
                    Keep the look across connected scenes in the same episode.
                  </p>
                </div>
              </div>

              {/* Right — new episode with warning */}
              <div className="hp-continuity-card" aria-label="New episode example">
                <div className="hp-continuity-card-label new-ep">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M5 3v2.5L6.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  New episode
                </div>

                {warnState === "warning" ? (
                  <div className="hp-continuity-warning" role="alert">
                    <div className="hp-warning-header">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                        <path d="M6.5 1L12 11H1L6.5 1z" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M6.5 5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <circle cx="6.5" cy="9.5" r="0.7" fill="currentColor"/>
                      </svg>
                      This location category appeared in your previous episode.
                    </div>
                    <div className="hp-warning-actions">
                      <button
                        className="hp-warning-btn alt"
                        onClick={() => setWarnState("changed")}
                        id="continuity-choose-another"
                        aria-label="Choose a different location"
                      >
                        Choose Another
                      </button>
                      <button
                        className="hp-warning-btn keep"
                        onClick={() => setWarnState("warning")}
                        id="continuity-keep-anyway"
                        aria-label="Keep current location selection"
                      >
                        Keep Anyway
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="hp-continuity-warning"
                    style={{
                      background: "rgba(82,217,160,0.06)",
                      borderColor: "rgba(82,217,160,0.2)",
                    }}
                    role="status"
                  >
                    <div className="hp-warning-header" style={{ color: "#52D9A0" }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                        <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M3.5 6.5L5.5 8.5L9.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      New location selected — no overlap.
                    </div>
                    <button
                      className="hp-warning-btn keep"
                      onClick={() => setWarnState("warning")}
                      id="continuity-reset"
                      style={{ fontSize: 11, marginTop: 4 }}
                    >
                      ← Back
                    </button>
                  </div>
                )}

                <div className="hp-conn-scene" style={{ margin: "0 16px 16px" }}>
                  <div className="hp-conn-scene-title">
                    <span style={{ color: "#3D4255", marginRight: 6, fontSize: 10 }}>Ep. 2 · Scene 01</span>
                    {warnState === "changed" ? "Rooftop Garden" : "Flower Shop"}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span className="hp-preview-chip">Cream linen set</span>
                    <span className="hp-preview-chip">
                      {warnState === "changed" ? "Rooftop · Urban" : "Flower Shop · Indoor"}
                    </span>
                  </div>
                </div>

                <div style={{ padding: "0 16px 16px" }}>
                  <p style={{ fontSize: 12, color: "#5E6473" }}>
                    The continuity system flags outfit and location overlaps across recent episodes so you can decide intentionally.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── BULK WORKFLOW ───────────────────────────────────────────── */}
        <section
          className="hp-bulk-section hp-section"
          aria-label="Bulk scene workflow"
        >
          <div className="hp-container">
            <div className="hp-section-label">Bulk workflow</div>
            <h2 className="hp-section-heading">
              Plan a whole episode in one pass.
            </h2>
            <p className="hp-section-sub">
              Paste multiple scenes, review the details, and add them together.
            </p>

            <div className="hp-bulk-layout" style={{ marginTop: 64 }}>
              {/* Left panel — pasted text */}
              <div className="hp-bulk-panel" aria-label="Bulk scene input">
                <div className="hp-bulk-panel-header">
                  <div className="hp-bulk-panel-title">Bulk Scene Builder</div>
                </div>
                <div className="hp-tab-row" role="tablist" aria-label="View">
                  <button
                    className={`hp-tab${bulkTab === "pasted" ? " active" : ""}`}
                    role="tab"
                    aria-selected={bulkTab === "pasted"}
                    onClick={() => setBulkTab("pasted")}
                    id="bulk-tab-pasted"
                    aria-controls="bulk-panel"
                  >
                    Pasted scenes
                  </button>
                  <button
                    className={`hp-tab${bulkTab === "organized" ? " active" : ""}`}
                    role="tab"
                    aria-selected={bulkTab === "organized"}
                    onClick={() => setBulkTab("organized")}
                    id="bulk-tab-organized"
                    aria-controls="bulk-panel"
                  >
                    Organized prompts
                  </button>
                </div>

                <div
                  id="bulk-panel"
                  role="tabpanel"
                  aria-labelledby={`bulk-tab-${bulkTab}`}
                  className="hp-bulk-textarea"
                >
                  {bulkTab === "pasted" ? (
                    <>
                      <strong>Scene 1 — Flower Shop</strong>{"\n"}
                      {"Maya enters a small flower shop and looks through fresh bouquets.\n"}
                      <em>Dialogue: "Okay, this place smells incredible."{"\n"}</em>
                      {"\n"}
                      {"---\n\n"}
                      <strong>Scene 2 — Rooftop Garden</strong>{"\n"}
                      {"She walks through a rooftop garden at sunset.\n"}
                      <em>Dialogue: "This might be my favorite stop today."{"\n"}</em>
                      {"\n"}
                      {"---\n\n"}
                      <strong>Scene 3 — Night Market</strong>{"\n"}
                      {"She explores a crowded night market filled with warm lights.\n"}
                      <em>Dialogue: "There is absolutely no way I'm leaving without trying something."{"\n"}</em>
                    </>
                  ) : (
                    <>
                      {[
                        {
                          n: 1, title: "Flower Shop",
                          meta: ["Lavender wrap dress", "Indoor", "Selfie"],
                          dialogue: "Okay, this place smells incredible.",
                        },
                        {
                          n: 2, title: "Rooftop Garden",
                          meta: ["Lavender wrap dress", "Rooftop", "Cinematic"],
                          dialogue: "This might be my favorite stop today.",
                        },
                        {
                          n: 3, title: "Night Market",
                          meta: ["Cream linen set", "Urban outdoor", "Lifestyle"],
                          dialogue: "There is absolutely no way I'm leaving without trying something.",
                        },
                      ].map((sc) => (
                        <div key={sc.n} className="hp-bulk-scene-card" style={{ marginBottom: 0 }}>
                          <div className="hp-bulk-scene-title">
                            <div className="hp-bulk-scene-num-badge">{sc.n}</div>
                            {sc.title}
                          </div>
                          <div className="hp-bulk-scene-meta" style={{ marginBottom: 6 }}>
                            {sc.meta.map((m) => (
                              <span key={m} className="hp-preview-chip">{m}</span>
                            ))}
                          </div>
                          <div style={{ fontSize: 10, color: "#5E6473", fontStyle: "italic" }}>
                            "{sc.dialogue}"
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Arrow connector */}
              <div className="hp-bulk-arrow" aria-hidden="true">
                <div className="hp-bulk-arrow-line" />
                <div className="hp-bulk-arrow-icon">→</div>
                <div className="hp-bulk-arrow-label">Paste · Review · Add</div>
                <div className="hp-bulk-arrow-line" />
              </div>

              {/* Right panel — episode view */}
              <div className="hp-bulk-panel" aria-label="Episode result">
                <div className="hp-bulk-panel-header">
                  <div className="hp-bulk-panel-title">Episode scenes</div>
                  <div style={{ fontSize: 10, color: "#3D4255" }}>3 scenes added</div>
                </div>

                <div style={{ padding: "16px 0" }}>
                  {[
                    {
                      n: "01", title: "Flower Shop",
                      chips: ["Lavender wrap dress", "Flower shop", "Selfie", "Golden hour"],
                      status: "ready",
                    },
                    {
                      n: "02", title: "Rooftop Garden",
                      chips: ["Lavender wrap dress", "Rooftop", "Cinematic"],
                      status: "draft",
                    },
                    {
                      n: "03", title: "Night Market",
                      chips: ["Cream linen set", "Night market", "Lifestyle"],
                      status: "draft",
                    },
                  ].map((sc) => (
                    <div key={sc.n} className="hp-bulk-scene-card">
                      <div className="hp-bulk-scene-title">
                        <div className="hp-bulk-scene-num-badge">{sc.n}</div>
                        {sc.title}
                        <span style={{
                          marginLeft: "auto",
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: sc.status === "ready"
                            ? "rgba(82,217,160,0.08)"
                            : "rgba(255,255,255,0.04)",
                          color: sc.status === "ready" ? "#52D9A0" : "#3D4255",
                          border: `1px solid ${sc.status === "ready"
                            ? "rgba(82,217,160,0.2)"
                            : "rgba(255,255,255,0.05)"}`,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}>
                          {sc.status}
                        </span>
                      </div>
                      <div className="hp-bulk-scene-meta">
                        {sc.chips.map((c) => (
                          <span key={c} className="hp-preview-chip">{c}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── STUDIO + EXTENSION ──────────────────────────────────────── */}
        <section
          className="hp-sync-section hp-section"
          aria-label="Studio and extension access"
        >
          <div className="hp-container">
            <div className="hp-section-label">Access</div>
            <h2 className="hp-section-heading">
              Plan in Studio. Access your prompts from the extension.
            </h2>
            <p className="hp-section-sub">
              Designed for Studio and extension access — your characters and scenes stay with your account.
            </p>

            <div className="hp-sync-layout">
              {/* Studio mock */}
              <div className="hp-studio-mock" aria-label="Studio interface preview">
                <div className="hp-studio-mock-header">
                  <div className="hp-preview-dots" aria-hidden="true">
                    <div className="hp-preview-dot red" />
                    <div className="hp-preview-dot yellow" />
                    <div className="hp-preview-dot green" />
                  </div>
                  <div className="hp-preview-logo-row" style={{ flex: 1, justifyContent: "center" }}>
                    <img src="/logo.png" alt="" className="hp-preview-logo-icon" aria-hidden="true" />
                    <div className="hp-preview-logo-text">Persona Studio</div>
                  </div>
                </div>

                <div className="hp-studio-mock-body">
                  <div className="hp-studio-mock-sidebar">
                    <div className="hp-studio-mock-episode-label">Episode</div>
                    <div className="hp-studio-mock-ep-title">Sunday Escape</div>
                    <div style={{ fontSize: 9, color: "#3D4255", padding: "0 8px 6px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Scenes</div>
                    {[
                      { n: "01", title: "Flower Shop" },
                      { n: "02", title: "Rooftop Garden" },
                      { n: "03", title: "Night Market" },
                    ].map((s) => (
                      <div
                        key={s.n}
                        className={`hp-studio-mock-scene-item${s.n === "03" ? " active" : ""}`}
                      >
                        <div style={{
                          width: 14, height: 14, borderRadius: 3,
                          background: s.n === "03" ? "rgba(139,124,255,0.2)" : "rgba(255,255,255,0.04)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 7, color: s.n === "03" ? "#A99BFF" : "#3D4255",
                          flexShrink: 0,
                        }}>
                          {s.n}
                        </div>
                        {s.title}
                      </div>
                    ))}
                  </div>

                  <div className="hp-studio-mock-main">
                    <div className="hp-studio-prompt-label">
                      Prompt preview · Night Market
                    </div>
                    <div className="hp-studio-prompt-box">
                      <strong>Character: Maya Chen</strong> — Long dark wavy hair, warm medium skin tone.{"\n"}
                      Wearing: Cream linen set.{"\n"}
                      Setting: Night Market — Crowded outdoor market, warm lights.{"\n"}
                      Action: Browsing food stalls and exploring the market.{"\n"}
                      Camera: Lifestyle close-up.
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: 9, color: "#A99BFF",
                        background: "rgba(139,124,255,0.1)",
                        border: "1px solid rgba(139,124,255,0.2)",
                        borderRadius: 5, padding: "4px 8px",
                      }}>
                        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        Copy prompt
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Extension mock */}
              <div>
                <div className="hp-extension-mock" aria-label="Chrome extension preview">
                  <div className="hp-ext-header">
                    <div className="hp-ext-logo">
                      <img src="/logo.png" alt="" className="hp-ext-logo-icon" aria-hidden="true" />
                      <div className="hp-ext-logo-text">Persona Studio</div>
                    </div>
                    <div style={{ marginLeft: "auto", fontSize: 9, color: "#3D4255" }}>Extension</div>
                  </div>

                  <div className="hp-ext-body">
                    <div className="hp-ext-section-label">Episode · Character</div>
                    <div style={{ fontSize: 11, color: "#A99BFF", fontWeight: 700, marginBottom: 8 }}>
                      Sunday Escape · Maya Chen
                    </div>

                    <div className="hp-ext-section-label">Scenes</div>
                    {[
                      { n: "01", title: "Flower Shop",   active: false },
                      { n: "02", title: "Rooftop Garden", active: false },
                      { n: "03", title: "Night Market",   active: true  },
                    ].map((s) => (
                      <div key={s.n} className={`hp-ext-scene-item${s.active ? " active" : ""}`}>
                        <div style={{
                          width: 14, height: 14, borderRadius: 3,
                          background: s.active ? "rgba(139,124,255,0.2)" : "rgba(255,255,255,0.04)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 7, color: s.active ? "#A99BFF" : "#3D4255", flexShrink: 0,
                        }}>
                          {s.n}
                        </div>
                        {s.title}
                      </div>
                    ))}

                    <div style={{ margin: "12px 0 6px" }} className="hp-ext-section-label">
                      Prompt · Night Market
                    </div>
                    <div className="hp-ext-prompt-box">
                      Character: Maya Chen — Long dark wavy hair...{"\n"}
                      Wearing: Cream linen set.{"\n"}
                      Setting: Night Market.{"\n"}
                      Camera: Lifestyle close-up.
                    </div>

                    <button className="hp-ext-copy-btn" id="ext-copy-btn" aria-label="Copy prompt from extension">
                      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                      Copy Prompt
                    </button>
                  </div>
                </div>

                <div className="hp-sync-badge">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M3 5.5L4.5 7L7 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Same account workspace
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURE SUMMARY ─────────────────────────────────────────── */}
        <section
          className="hp-features-section hp-section"
          id="features"
          aria-label="Feature summary"
        >
          <div className="hp-container">
            <div className="hp-section-label">Features</div>
            <h2 className="hp-section-heading">
              Everything around the prompt stays organized.
            </h2>

            <div className="hp-features-list" role="list">
              {[
                {
                  title: "Saved character references",
                  desc: "Keep the reference image and identity notes attached to the character they belong to.",
                },
                {
                  title: "Outfit & location history",
                  desc: "See previous choices before planning the next scene so you can decide with context.",
                },
                {
                  title: "Connected-scene continuity",
                  desc: "Carry important details through scenes that belong together in the same episode.",
                },
                {
                  title: "Bulk scene preparation",
                  desc: "Prepare several scenes in sequence instead of rebuilding them one by one.",
                },
                {
                  title: "Prompt copy & export",
                  desc: "Review the assembled prompt and move it into your generation workflow with one click.",
                },
                {
                  title: "Private account storage",
                  desc: "Keep saved projects separated by signed-in account — nothing is shared between users.",
                },
                {
                  title: "Studio + extension access",
                  desc: "Work from the full Studio and reach saved scene information from the Chrome extension.",
                },
              ].map((f) => (
                <div key={f.title} className="hp-feature-row" role="listitem">
                  <div className="hp-feature-title">{f.title}</div>
                  <div className="hp-feature-desc">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <section
          className="hp-faq-section hp-section"
          id="faq"
          aria-label="Frequently asked questions"
        >
          <div className="hp-container">
            <div className="hp-section-label">FAQ</div>
            <h2 className="hp-section-heading">Common questions</h2>

            <div className="hp-faq-list" role="list">
              {FAQ_ITEMS.map((item) => {
                const isOpen = openFaqId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`hp-faq-item${isOpen ? " open" : ""}`}
                    role="listitem"
                  >
                    <button
                      className="hp-faq-trigger"
                      onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${item.id}`}
                      id={`faq-trigger-${item.id}`}
                    >
                      <span>{item.q}</span>
                      <span className="hp-faq-chevron" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </span>
                    </button>
                    <div
                      className="hp-faq-body"
                      id={`faq-answer-${item.id}`}
                      role="region"
                      aria-labelledby={`faq-trigger-${item.id}`}
                      aria-hidden={!isOpen}
                    >
                      <p className="hp-faq-answer">{item.a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ───────────────────────────────────────────────── */}
        <section
          className="hp-cta-section"
          aria-label="Call to action"
        >
          <div className="hp-container">
            <div className="hp-cta-panel">
              {/* Mini product cards in background feel */}
              <div className="hp-cta-mini-cards" aria-hidden="true">
                <div className="hp-cta-mini-card">
                  <div className="hp-cta-mini-card-title">Character</div>
                  Maya Chen · Identity locked
                </div>
                <div style={{ color: "rgba(139,124,255,0.3)", fontSize: 18 }}>→</div>
                <div className="hp-cta-mini-card">
                  <div className="hp-cta-mini-card-title">Scene</div>
                  Flower Shop · Lavender dress
                </div>
                <div style={{ color: "rgba(139,124,255,0.3)", fontSize: 18 }}>→</div>
                <div className="hp-cta-mini-card">
                  <div className="hp-cta-mini-card-title">Prompt</div>
                  Ready to copy
                </div>
              </div>

              <h2 className="hp-cta-heading">
                Give your next episode<br />a consistent starting point.
              </h2>
              <p className="hp-cta-desc">
                Keep the character, scene details, and prompt context together
                before you start generating.
              </p>

              <div className="hp-cta-actions">
                <a
                  href="#/characters"
                  className="hp-btn-hero-primary"
                  id="cta-start-creating"
                >
                  Start Creating
                </a>
                <a
                  href="#/characters"
                  className="hp-btn-hero-secondary"
                  id="cta-sign-in"
                >
                  Sign In
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOOTER ──────────────────────────────────────────────────── */}
        <footer className="hp-footer" role="contentinfo">
          <div className="hp-footer-inner">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src="/logo.png" alt="" className="hp-logo-icon" aria-hidden="true" style={{ width: 22, height: 22 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#5E6473" }}>Persona Studio</span>
            </div>

            <div className="hp-footer-copy">
              Character &amp; Prompt Workspace for AI Creators
            </div>

            <div className="hp-footer-links">
              <a href="#/characters" className="hp-footer-link">Sign in</a>
              <a href="#/characters" className="hp-footer-link">Studio</a>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}

// ─── Download icon (matches the 1.3px stroke icon style used across the page) ─

function DownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.5V9M7 9L4 6M7 9l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 10.5v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Hero Studio Preview Composition ────────────────────────────────────────

function HeroStudioPreview({ cycleState }: { cycleState: HeroCycleState }) {
  const isChar   = cycleState === "character";
  const isScene  = cycleState === "scene"  || cycleState === "character";
  const isPrompt = cycleState === "prompt";

  const SCENES = [
    { n: "01", title: "Flower Shop",    outfit: "Lavender dress", loc: "Flower shop", cam: "Selfie",    active: !isPrompt },
    { n: "02", title: "Rooftop Garden", outfit: "Lavender dress", loc: "Rooftop",     cam: "Cinematic", active: isPrompt  },
    { n: "03", title: "Night Market",   outfit: "Cream linen",    loc: "Night market",cam: "Lifestyle", active: false     },
  ];

  return (
    <div className="hp-studio-preview">
      {/* Window chrome */}
      <div className="hp-preview-chrome">
        <div className="hp-preview-dots" aria-hidden="true">
          <div className="hp-preview-dot red"    />
          <div className="hp-preview-dot yellow" />
          <div className="hp-preview-dot green"  />
        </div>
        <div className="hp-preview-url">persona-studio / episodes / sunday-escape</div>
      </div>

      {/* Body */}
      <div className="hp-preview-body">
        {/* Sidebar */}
        <div className="hp-preview-sidebar">
          <div className="hp-preview-logo-row">
            <img src="/logo.png" alt="" className="hp-preview-logo-icon" title="Persona Studio" />
          </div>

          {[
            { label: "Characters", active: isChar },
            { label: "Episodes",   active: false  },
            { label: "Scenes",     active: isScene && !isChar },
            { label: "History",    active: false  },
          ].map((item) => (
            <div
              key={item.label}
              className={`hp-preview-nav-item${item.active ? " active" : ""}`}
            >
              <div className="hp-preview-nav-dot" />
              {item.label}
            </div>
          ))}
        </div>

        {/* Main area */}
        <div className="hp-preview-main">
          {/* Left: character + scenes */}
          <div className="hp-preview-col">
            <div className="hp-preview-col-label">Character</div>

            {/* Character card */}
            <div
              className="hp-preview-char-card"
              style={{
                borderColor: isChar
                  ? "rgba(139,124,255,0.5)"
                  : "rgba(255,255,255,0.06)",
                transition: "border-color 600ms ease",
              }}
            >
              <div className="hp-preview-char-avatar">
                <span style={{ position: "relative", zIndex: 1, fontSize: 32 }}>👩‍🦱</span>
              </div>
              <div className="hp-preview-char-body">
                <div className="hp-preview-char-name">Maya Chen</div>
                <div className="hp-preview-lock-row">
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <rect x="2.5" y="5" width="7" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M4 5V3.5a2 2 0 1 1 4 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Identity details locked
                </div>
                <div>
                  {["Long dark wavy hair", "Warm medium skin tone", "Soft oval face"].map((tag) => (
                    <span key={tag} className="hp-preview-identity-tag">{tag}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Scene list */}
            <div className="hp-preview-col-label" style={{ marginTop: 8 }}>Scenes</div>
            {SCENES.map((sc) => (
              <div
                key={sc.n}
                className={`hp-preview-scene-card${sc.active ? " hp-active" : ""}`}
              >
                <div className="hp-preview-scene-num">{sc.n}</div>
                <div className="hp-preview-scene-title">{sc.title}</div>
                <div className="hp-preview-scene-chips">
                  <span className="hp-preview-chip">{sc.outfit}</span>
                  <span className="hp-preview-chip">{sc.loc}</span>
                  <span className="hp-preview-chip">{sc.cam}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Right: prompt preview */}
          <div className="hp-preview-col">
            <div className="hp-preview-col-label">Prompt</div>
            <div
              className="hp-preview-prompt-card"
              style={{
                opacity: isPrompt ? 1 : 0.55,
                borderColor: isPrompt
                  ? "rgba(139,124,255,0.35)"
                  : "rgba(255,255,255,0.06)",
                transition: "opacity 600ms ease, border-color 600ms ease",
              }}
            >
              <div className="hp-preview-prompt-header">
                <div className="hp-preview-prompt-label">Prompt preview</div>
                <div className="hp-preview-copy-btn">
                  <svg width="8" height="8" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Copy
                </div>
              </div>
              <div className="hp-preview-prompt-text">
                <span className="highlight">Character: Maya Chen</span>
                {" — Long dark wavy\nhair, warm medium skin\ntone, soft oval face.\n"}
                {"Wearing: Lavender wrap\ndress.\n"}
                {"Setting: Flower Shop.\n"}
                {"Camera: Selfie."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
