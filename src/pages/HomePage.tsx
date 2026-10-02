import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Check, Copy, Download, Film, Layers, LockKeyhole, MapPin,
  Menu, Monitor, Puzzle, RefreshCw, Shirt, Smartphone, UserRound, X,
} from "lucide-react";
import Brand from "../components/ui/Brand";
import PricingSection from "../components/home/PricingSection";
import { CharacterPortrait, OutfitGlyph, SceneVignette, type VignetteId } from "../components/home/graphics";
import { ENGINES, formatEnginePrompt, type EngineId } from "../utils/promptFormatter";
import type { Location, Outfit, Scene } from "../types";
import "./HomePage.css";

// Public samples remain in component memory and never touch the user's workspace.
const SAMPLE_CHARACTER = {
  name: "Maya Chen",
  identityFields: [
    { key: "hair", label: "Hair", value: "long black wavy hair", locked: true },
    { key: "skin", label: "Skin tone", value: "warm medium skin tone", locked: true },
    { key: "eyes", label: "Eyes", value: "expressive dark eyes", locked: true },
  ],
};

const OUTFITS: Outfit[] = [
  { id: "outfit-1", characterId: "sample", name: "Cream linen set", description: "A cream linen shirt and relaxed trousers", garmentType: "top", primaryColor: "cream", colorFamily: "white", accessories: "Small gold earrings", referenceAssetId: undefined, notes: "", createdAt: "", updatedAt: "" },
  { id: "outfit-2", characterId: "sample", name: "Lavender wrap dress", description: "A lavender wrap dress with soft pleats", garmentType: "dress", primaryColor: "lavender", colorFamily: "purple", accessories: "Silver bracelet", referenceAssetId: undefined, notes: "", createdAt: "", updatedAt: "" },
  { id: "outfit-3", characterId: "sample", name: "Deep blue casual outfit", description: "A deep blue tee and light-wash jeans", garmentType: "top", primaryColor: "deep blue", colorFamily: "blue", accessories: "", referenceAssetId: undefined, notes: "", createdAt: "", updatedAt: "" },
];

const LOCATIONS: Location[] = [
  { id: "loc-1", name: "Flower shop", category: "indoor-public", setting: "A small flower shop with fresh bouquets", lighting: "Soft morning light", mood: "Calm and fresh", referenceAssetId: undefined, notes: "", createdAt: "", updatedAt: "" },
  { id: "loc-2", name: "Rooftop garden", category: "rooftop", setting: "A rooftop garden above the city", lighting: "Golden hour light", mood: "Warm and easy", referenceAssetId: undefined, notes: "", createdAt: "", updatedAt: "" },
  { id: "loc-3", name: "Night market", category: "urban", setting: "A busy night market street", lighting: "Warm lantern light", mood: "Lively and bright", referenceAssetId: undefined, notes: "", createdAt: "", updatedAt: "" },
];

const SCENES: Array<{ title: string; action: string; vignette: VignetteId }> = [
  { title: "Flower shop", action: "Maya selects fresh flowers in a small flower shop, lit by soft morning light.", vignette: "flower-shop" },
  { title: "Rooftop garden", action: "Maya walks through a rooftop garden at golden hour.", vignette: "rooftop" },
  { title: "Night market", action: "Maya browses a night market filled with warm lantern light.", vignette: "night-market" },
];

function sampleScene(index: number): Scene {
  const s = SCENES[index];
  return {
    id: "sample-scene", episodeId: "sample-episode", order: index, title: s.title, status: "draft",
    sceneDescription: s.action, action: s.action, dialogue: "", cameraAngle: "medium-shot",
    duration: "", props: "", notes: "", outfitId: OUTFITS[index].id, locationId: LOCATIONS[index].id,
    outfitOverride: "", createdAt: "", updatedAt: "",
  };
}

const heroPrompt = formatEnginePrompt("midjourney", {
  scene: sampleScene(0), character: SAMPLE_CHARACTER, outfit: OUTFITS[0], location: LOCATIONS[0],
});

// The production image always packages this versioned path. `latest.json` below
// replaces it when a newer extension version is deployed.
const EXTENSION_FALLBACK_URL = "/download/persona-studio-extension-v1.1.0.zip";
const NAV_LINKS = [
  { label: "How it works", target: "workflow" },
  { label: "Features", target: "features" },
  { label: "Pricing", target: "pricing" },
  { label: "Extension", target: "extension" },
];
const FAQ = [
  ["Does Persona Studio generate images or videos?", "Persona Studio organizes references and prepares prompts. Copy your prompt into the image or video generation tool you already use."],
  ["Will my character look exactly the same every time?", "Saved identity details and references help keep your instructions consistent. The final result depends on your generation model, settings, and reference handling."],
  ["Can I add multiple scenes at once?", "Yes. Paste scene descriptions into the Bulk Scene Builder, review the parsed details, then add them to an episode."],
  ["Does the extension share my Studio projects?", "Sign in with the same Google account in Studio and the Chrome extension to access your synced characters, episodes, and scenes."],
];

export default function HomePage() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [engine, setEngine] = useState<EngineId>("midjourney");
  const [copied, setCopied] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string>(EXTENSION_FALLBACK_URL);
  const [menuOpen, setMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [showFaq, setShowFaq] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/download/latest.json").then(r => r.ok ? r.json() : null).then(meta => {
      if (!cancelled && typeof meta?.file === "string" && meta.file.endsWith(".zip")) {
        setDownloadUrl(`/download/${meta.file}`);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const prompt = formatEnginePrompt(engine, {
    scene: sampleScene(sceneIndex), character: SAMPLE_CHARACTER,
    outfit: OUTFITS[sceneIndex], location: LOCATIONS[sceneIndex],
  });

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); }
    catch { setCopied("Copy unavailable. Select and copy the text manually."); }
  }
  function scrollTo(target: string) {
    setMenuOpen(false);
    document.getElementById(target)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return <div className="hp-root" data-theme="light">
    <a className="skip-link" href="#home-main" onClick={e => { e.preventDefault(); document.getElementById("home-main")?.focus(); }}>Skip to content</a>

    <header className="hp-header">
      <Link to="/" className="hp-logo" aria-label="Persona Studio home"><Brand /></Link>
      <nav className="hp-nav" aria-label="Page navigation">
        {NAV_LINKS.map(l => <button key={l.target} onClick={() => scrollTo(l.target)}>{l.label}</button>)}
      </nav>
      <div className="hp-header-actions">
        <a href={downloadUrl} download className="btn btn-ghost" id="header-download-extension"><Download size={14} /> Download extension</a>
        <Link to="/characters" className="btn btn-ghost">Sign in</Link>
        <Link to="/characters" className="btn btn-secondary">Open Studio <ArrowRight size={14} /></Link>
      </div>
      <button className="btn btn-icon hp-menu" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Toggle navigation">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
    </header>
    {menuOpen && <nav className="hp-mobile-nav" aria-label="Mobile navigation">
      {NAV_LINKS.map(l => <button className="btn btn-ghost" key={l.target} onClick={() => scrollTo(l.target)}>{l.label}</button>)}
      <Link className="btn btn-primary" to="/characters">Open Studio</Link>
    </nav>}

    <main id="home-main" tabIndex={-1}>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="hp-hero">
        <div className="hp-hero-copy">
          <span className="hp-announcement"><Layers size={13} /> Your characters. A connected workflow.</span>
          <h1>One character. Every scene.<br /><span>A little more continuity.</span></h1>
          <p>Persona Studio keeps your cast, wardrobe, locations, and scene prompts in one workspace — so every prompt you copy still looks like the same person.</p>
          <div className="hp-hero-actions">
            <Link to="/characters" className="btn btn-primary" id="hero-open-studio">Open Studio <ArrowRight size={15} /></Link>
            <a href={downloadUrl} download className="btn btn-secondary" id="hero-download-extension"><Download size={15} /> Download extension</a>
          </div>
          <span className="hp-hero-note"><Monitor size={13} /> A full studio workspace. A companion Chrome extension.</span>
        </div>

        <div className="hp-hero-visual">
          <div className="hp-hero-canvas" aria-label="Sample character surrounded by scenes, outfit, location, and a prompt preview">
            <div className="hp-canvas-deco" aria-hidden="true" />

            <div className="hp-float hp-portrait-card">
              <div className="hp-portrait"><CharacterPortrait /></div>
              <div className="hp-portrait-info">
                <div className="hp-portrait-name"><UserRound size={14} /> Maya Chen</div>
                {SAMPLE_CHARACTER.identityFields.slice(0, 2).map(f =>
                  <div className="hp-portrait-field" key={f.key}><span>{f.label}</span><strong>{f.value}</strong><LockKeyhole size={11} /></div>,
                )}
              </div>
            </div>

            <div className="hp-float hp-chip hp-chip-outfit">
              <span className="hp-chip-icon hp-chip-cream"><Shirt size={13} /></span>
              Cream linen set
            </div>

            <div className="hp-float hp-scene-card hp-scene-1 is-active">
              <div className="hp-scene-thumb"><SceneVignette id="flower-shop" /></div>
              <div className="hp-scene-meta"><span className="hp-scene-num">01</span> Flower shop</div>
            </div>

            <div className="hp-float hp-scene-card hp-scene-2">
              <div className="hp-scene-thumb"><SceneVignette id="rooftop" /></div>
              <div className="hp-scene-meta"><span className="hp-scene-num">02</span> Rooftop garden</div>
            </div>

            <div className="hp-float hp-chip hp-chip-location">
              <MapPin size={13} /> Flower shop · Soft morning light
            </div>

            <div className="hp-float hp-scene-card hp-scene-3">
              <div className="hp-scene-thumb"><SceneVignette id="night-market" /></div>
              <div className="hp-scene-meta"><span className="hp-scene-num">03</span> Night market</div>
            </div>

            <div className="hp-float hp-prompt-mini">
              <div className="hp-prompt-mini-head"><span className="hp-mini-engine">Midjourney</span><span className="hp-live"><span /> Ready</span></div>
              <p>{heroPrompt}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Workflow ─────────────────────────────────────────────────── */}
      <section className="hp-section" id="workflow" aria-label="How it works">
        <div className="hp-section-head">
          <span className="hp-eyebrow">The workflow</span>
          <h2>From character to prompt in three steps</h2>
          <p>The same loop every episode: pick who you are drawing, place her in a scene, copy a prompt that carries her identity with it.</p>
        </div>
        <ol className="hp-steps">
          <li className="hp-step">
            <span className="hp-step-num" aria-hidden="true">1</span>
            <h3>Choose a character</h3>
            <p>Create your cast once — hair, skin, eyes — and lock the details that make her recognizable.</p>
            <div className="hp-step-art" aria-hidden="true">
              <div className="hp-art-avatar"><CharacterPortrait /></div>
              <div className="hp-art-profile">
                <strong>Maya Chen</strong>
                {SAMPLE_CHARACTER.identityFields.slice(0, 2).map(f =>
                  <div className="hp-art-field" key={f.key}><span>{f.value}</span><LockKeyhole size={10} /></div>,
                )}
              </div>
            </div>
          </li>
          <li className="hp-step">
            <span className="hp-step-num" aria-hidden="true">2</span>
            <h3>Add scenes</h3>
            <p>Write episodes scene by scene, or paste a list into the Bulk Scene Builder and add them all at once.</p>
            <div className="hp-step-art hp-art-scenes" aria-hidden="true">
              {SCENES.map((s, i) =>
                <div className={`hp-art-scene-row${i === 0 ? " is-active" : ""}`} key={s.title}>
                  <span className="hp-art-scene-num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="hp-art-scene-title">{s.title}</span>
                  <span className="hp-art-scene-status">Draft</span>
                </div>,
              )}
              <div className="hp-art-paste"><Layers size={11} /> Paste 3 descriptions in bulk</div>
            </div>
          </li>
          <li className="hp-step">
            <span className="hp-step-num" aria-hidden="true">3</span>
            <h3>Copy the prompt</h3>
            <p>Character, outfit, location, and camera angle become a ready prompt for your engine. Copy and paste it anywhere.</p>
            <div className="hp-step-art hp-art-prompt" aria-hidden="true">
              <div className="hp-art-engines"><span className="is-on">Midjourney</span><span>Stable Diffusion</span><span>Flux</span></div>
              <p>{heroPrompt}</p>
              <div className="hp-art-copy"><Copy size={11} /> Copy prompt</div>
            </div>
          </li>
        </ol>
      </section>

      {/* ── Feature bento ────────────────────────────────────────────── */}
      <section className="hp-section" id="features" aria-label="Features">
        <div className="hp-section-head">
          <span className="hp-eyebrow">What is inside</span>
          <h2>Everything the workflow needs</h2>
          <p>A workspace for the recurring details, and a live sample below — the prompt preview uses the very same formatter as the Studio.</p>
        </div>

        <div className="hp-bento">
          <section className="hp-bento-card hp-b-prompt" aria-label="Prompt preview demo">
            <div className="hp-card-head">
              <h3><Film size={15} /> Ready Prompt</h3>
              <span className="hp-live"><span /> Interactive</span>
            </div>
            <div className="hp-engine-tabs" role="group" aria-label="Prompt engine">
              {ENGINES.map(e =>
                <button key={e.id} aria-pressed={engine === e.id} onClick={() => { setEngine(e.id); setCopied(""); }}>{e.label}</button>,
              )}
            </div>
            <div className="hp-scene-tabs" role="group" aria-label="Sample scene">
              {SCENES.map((s, i) =>
                <button key={s.title} aria-pressed={sceneIndex === i} onClick={() => { setSceneIndex(i); setCopied(""); }}>
                  <span>{String(i + 1).padStart(2, "0")}</span>{s.title}
                </button>,
              )}
            </div>
            <pre className="hp-prompt-text">{prompt}</pre>
            <button className="btn btn-primary hp-copy-btn" onClick={() => copy(prompt, "Prompt copied")}>
              <Copy size={14} />{copied === "Prompt copied" ? "Copied" : "Copy prompt"}
            </button>
            <p className="hp-card-caption">Sample character and scenes — switch engine or scene, then copy. Images and videos are generated in your external tool.</p>
          </section>

          <section className="hp-bento-card hp-b-wardrobe" aria-label="Wardrobe and locations">
            <div className="hp-card-head"><h3><Shirt size={15} /> Wardrobe &amp; locations</h3></div>
            <div className="hp-swatch-row">
              {OUTFITS.map(o =>
                <div className="hp-swatch" key={o.id}>
                  <div className={`hp-swatch-art hp-swatch-${o.colorFamily}`}><OutfitGlyph kind={o.garmentType === "dress" ? "dress" : o.colorFamily === "blue" ? "casual" : "shirt"} /></div>
                  <strong>{o.name}</strong>
                </div>,
              )}
            </div>
            <div className="hp-loc-list">
              {LOCATIONS.map((l, i) =>
                <div className="hp-loc-row" key={l.id}>
                  <div className="hp-loc-thumb"><SceneVignette id={SCENES[i].vignette} /></div>
                  <div><strong>{l.name}</strong><span>{l.lighting}</span></div>
                </div>,
              )}
            </div>
            <p className="hp-card-caption">Reusable outfits and saved locations — lighting and mood included.</p>
          </section>

          <section className="hp-bento-card hp-b-continuity" aria-label="Continuity checks">
            <div className="hp-card-head"><h3><RefreshCw size={15} /> Continuity checks</h3></div>
            <p>Studio flags repeated outfits and location categories across episodes — before you generate.</p>
            <div className="hp-warning-sample">Example: this outfit appeared in an earlier episode.</div>
            <p className="hp-card-caption">Review the warning, keep the choice, or try another look.</p>
          </section>

          <section className="hp-bento-card hp-b-bulk" aria-label="Bulk scene builder">
            <div className="hp-card-head"><h3><Layers size={15} /> Bulk scene builder</h3></div>
            <div className="hp-bulk-demo" aria-hidden="true">
              <div className="hp-bulk-paste">
                <span />
                <span />
                <span />
              </div>
              <ArrowRight size={14} className="hp-bulk-arrow" />
              <div className="hp-bulk-parsed">
                <div><span>01</span> Flower shop</div>
                <div><span>02</span> Rooftop garden</div>
                <div><span>03</span> Night market</div>
              </div>
            </div>
            <p className="hp-card-caption">Paste scene descriptions, review the parsed details, add the episode.</p>
          </section>

          <section className="hp-bento-card hp-b-sync" aria-label="Sync between Studio and extension">
            <div className="hp-card-head"><h3><Monitor size={15} /> Studio &amp; side panel, in sync</h3></div>
            <p>Sign in with the same Google account and your cast follows you — full workspace on the left, prompts on the right.</p>
            <div className="hp-sync-demo" aria-hidden="true">
              <span className="hp-sync-device"><Monitor size={18} /></span>
              <span className="hp-sync-arrows"><RefreshCw size={13} /></span>
              <span className="hp-sync-device"><Smartphone size={18} /></span>
            </div>
          </section>

          <section className="hp-bento-card hp-b-extension" id="extension" aria-label="Chrome extension">
            <div className="hp-card-head">
              <h3><Puzzle size={15} /> Chrome extension</h3>
              <span className="hp-chip-badge">Side panel</span>
            </div>
            <p>Your Studio, alongside your generator: choose a character, episode, and scene — copy the same prompt without leaving your tab.</p>

            <div className="hp-ext-preview" role="img" aria-label="Preview of the Persona Studio Chrome side panel: character, episode, and scene selectors above a prompt preview and copy button">
              <div className="hp-ext-header">
                <span className="hp-ext-brand"><Brand /></span>
                <span className="hp-ext-sync"><Check size={11} /> Synced</span>
                <span className="hp-ext-avatar" />
              </div>
              <div className="hp-ext-body">
                <span className="hp-ext-label">1 — Character</span>
                <div className="hp-ext-select">Maya Chen</div>
                <span className="hp-ext-label">2 — Episode</span>
                <div className="hp-ext-select">A day in the city</div>
                <span className="hp-ext-label">3 — Scene</span>
                <div className="hp-ext-scene is-active"><span>1</span> Flower shop <em>draft</em></div>
                <div className="hp-ext-details">
                  <strong>Scene details</strong>
                  <span>👗 Cream linen set</span>
                  <span>📍 Flower shop</span>
                  <span>🎬 {SCENES[0].action}</span>
                </div>
                <span className="hp-ext-label">Prompt preview</span>
                <div className="hp-ext-chip"><span className="hp-ext-chip-thumb"><CharacterPortrait /></span> Maya Chen</div>
                <div className="hp-ext-prompt">{heroPrompt}</div>
              </div>
              <div className="hp-ext-footer">
                <span className="hp-ext-copy"><Copy size={13} /> Copy Prompt</span>
                <small>Attach your reference image next to the prompt when generating.</small>
              </div>
            </div>

            <a className="btn btn-primary hp-ext-download" href={downloadUrl} download><Download size={14} /> Download extension</a>
            <button className="hp-text-button hp-install-toggle" onClick={() => setInstallOpen(!installOpen)} aria-expanded={installOpen}>
              How to install <ArrowRight size={12} />
            </button>
            {installOpen && <div className="hp-install">
              <ol>
                <li>Download and extract the extension ZIP.</li>
                <li>Open <code>chrome://extensions</code>.</li>
                <li>Enable Developer mode and choose Load unpacked.</li>
                <li>Select the extracted folder, open Persona Studio, and sign in.</li>
              </ol>
              <button className="btn btn-secondary btn-sm" onClick={() => copy("chrome://extensions", "Address copied")}>
                {copied === "Address copied" ? "Copied" : "Copy extensions address"}
              </button>
            </div>}
          </section>
        </div>
        <span className="sr-only" role="status">{copied}</span>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <PricingSection />

      {/* ── Final call to action ─────────────────────────────────────── */}
      <section className="hp-cta" aria-label="Get started">
        <div className="hp-cta-card">
          <h2>Keep your cast together.</h2>
          <p>Set up your first character, add a scene, and copy a prompt that still looks like her.</p>
          <div className="hp-cta-actions">
            <Link to="/characters" className="btn btn-primary">Open Studio <ArrowRight size={15} /></Link>
            <a href={downloadUrl} download className="btn btn-secondary"><Download size={15} /> Download extension</a>
          </div>
          <span className="hp-cta-note"><Check size={13} /> Sign in with Google to sync Studio and the extension.</span>
        </div>
      </section>

      {showFaq && <section className="hp-faq" id="faq">
        <h2>A few useful details.</h2>
        {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </section>}
    </main>

    <footer className="hp-footer">
      <span>© {new Date().getFullYear()} Persona Studio</span>
      <button className="hp-text-button" onClick={() => setShowFaq(!showFaq)} aria-expanded={showFaq}>Questions &amp; answers</button>
      <button className="hp-text-button" onClick={() => scrollTo("pricing")}>Pricing</button>
      <button className="hp-text-button" onClick={() => scrollTo("extension")}>Chrome extension</button>
      <Link to="/characters">Open Studio <ArrowRight size={13} /></Link>
    </footer>
  </div>;
}
