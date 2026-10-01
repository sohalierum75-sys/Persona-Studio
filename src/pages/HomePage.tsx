import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Copy, Download, Film, Layers, LockKeyhole, MapPin, Menu, Monitor, Puzzle, Shirt, UserRound, X } from "lucide-react";
import Brand from "../components/ui/Brand";
import { Surface } from "../components/ui/Surface";
import { ENGINES, formatEnginePrompt, type EngineId } from "../utils/promptFormatter";
import type { Scene } from "../types";
import "./HomePage.css";

// Public samples remain in component memory and never touch the user's workspace.
const SAMPLE_CHARACTER = { name: "Maya Chen", identityFields: [
  { key: "hair", label: "Hair", value: "long black wavy hair", locked: true },
  { key: "skin", label: "Skin tone", value: "warm medium skin tone", locked: true },
  { key: "eyes", label: "Eyes", value: "expressive dark eyes", locked: true },
] };
const SCENES = ["Flower shop", "Rooftop garden", "Night market"];
const ACTIONS = ["Maya selects fresh flowers in a small flower shop, lit by soft morning light.", "Maya walks through a rooftop garden at golden hour.", "Maya browses a night market filled with warm lantern light."];
const TABS = ["Overview", "Characters", "Scene prompts", "Continuity", "Extension"];
// The production image always packages this versioned path. `latest.json` below
// replaces it when a newer extension version is deployed.
const EXTENSION_FALLBACK_URL = "/download/persona-studio-extension-v1.1.0.zip";
const FAQ = [
  ["Does Persona Studio generate images or videos?", "Persona Studio organizes references and prepares prompts. Copy your prompt into the image or video generation tool you already use."],
  ["Will my character look exactly the same every time?", "Saved identity details and references help keep your instructions consistent. The final result depends on your generation model, settings, and reference handling."],
  ["Can I add multiple scenes at once?", "Yes. Paste scene descriptions into the Bulk Scene Builder, review the parsed details, then add them to an episode."],
  ["Does the extension share my Studio projects?", "Sign in with the same Google account in Studio and the Chrome extension to access your synced characters, episodes, and scenes."],
];

export default function HomePage() {
  const [tab, setTab] = useState("Overview");
  const [sceneIndex, setSceneIndex] = useState(0);
  const [outfit, setOutfit] = useState("Cream linen set");
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
  const scene: Scene = { id: "sample", episodeId: "sample", order: sceneIndex, title: SCENES[sceneIndex], status: "draft", action: ACTIONS[sceneIndex], dialogue: "", cameraAngle: "medium-shot", duration: "", props: "", notes: "", outfitOverride: outfit, createdAt: "", updatedAt: "" };
  const prompt = formatEnginePrompt(engine, { scene, character: SAMPLE_CHARACTER });
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); }
    catch { setCopied("Copy unavailable. Select and copy the text manually."); }
  }
  function showcase(next = "Overview") {
    setTab(next); setMenuOpen(false);
    document.getElementById("interactive-demo")?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? "auto" : "smooth" });
  }
  const visible = (name: string) => tab === "Overview" || tab === name;

  return <div className="hp-root" data-theme="light">
    <a className="skip-link" href="#home-main" onClick={e => { e.preventDefault(); document.getElementById('home-main')?.focus(); }}>Skip to content</a>
    <header className="hp-header">
      <Link to="/" className="hp-logo" aria-label="Persona Studio home"><Brand /></Link>
      <nav className="hp-nav" aria-label="Page navigation">
        <button onClick={() => showcase("Characters")}>Characters</button>
        <button onClick={() => showcase("Scene prompts")}>Scene prompts</button>
        <button onClick={() => showcase("Continuity")}>Continuity</button>
        <button onClick={() => showcase("Extension")}>Extension <ArrowRight size={12} /></button>
      </nav>
      <div className="hp-header-actions"><a href={downloadUrl} download className="btn btn-ghost" id="header-download-extension"><Download size={14} /> Download extension</a><Link to="/characters" className="btn btn-ghost">Sign in</Link><Link to="/characters" className="btn btn-secondary">Open Studio <ArrowRight size={14} /></Link></div>
      <button className="btn btn-icon hp-menu" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Toggle navigation">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
    </header>
    {menuOpen && <nav className="hp-mobile-nav" aria-label="Mobile navigation">{TABS.slice(1).map(t => <button className="btn btn-ghost" key={t} onClick={() => showcase(t)}>{t}</button>)}<Link className="btn btn-primary" to="/characters">Open Studio</Link></nav>}
    <main id="home-main" tabIndex={-1}>
      <section className="hp-hero">
        <span className="hp-announcement"><Layers size={13} /> Your characters. A connected workflow.</span>
        <h1>One character. Every scene.<br /><span>A little more continuity.</span></h1>
        <p>Keep your cast, scene prompts, and creative details together.<br className="hp-desktop-break" /> Move from your Studio to your favorite AI tool, without losing the thread.</p>
        <div className="hp-hero-actions"><Link to="/characters" className="btn btn-primary" id="hero-start-creating">Start creating <ArrowRight size={15} /></Link><a href={downloadUrl} download className="btn btn-secondary" id="hero-download-extension"><Download size={15} /> Download extension</a><button className="btn btn-secondary" onClick={() => showcase()} id="hero-try-demo">Explore the Studio</button></div>
        <span className="hp-hero-note"><Monitor size={13} /> A full workspace. A companion Chrome extension.</span>
      </section>
      <section className="hp-showcase" id="interactive-demo" aria-label="Interactive product preview">
        <div className="hp-showcase-toolbar"><div className="hp-segments" role="group" aria-label="Preview category">{TABS.map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</div><span className="hp-sample-label"><span /> Interactive sample · no account needed</span></div>
        <div className={`hp-showcase-grid ${tab !== "Overview" ? "hp-showcase-focused" : ""}`}>
          {visible("Characters") && <div className="hp-preview-column">
            <Surface><div className="hp-card-heading"><span className="hp-icon"><UserRound size={18} /></span><span className="chip">Character profile</span></div><h2>Maya Chen</h2><p className="hp-small">Your recurring cast starts here.</p><div className="hp-identity">{SAMPLE_CHARACTER.identityFields.map(f => <div key={f.key}><span>{f.label}</span><strong>{f.value}<LockKeyhole size={12} /></strong></div>)}</div><div className="hp-card-footer"><span className="hp-small">Identity details, kept together</span><Link to="/characters" aria-label="Create your character" className="btn btn-icon"><ArrowRight size={17} /></Link></div></Surface>
            <Surface><div className="hp-card-heading"><h3><Shirt size={16} /> Wardrobe</h3><span className="hp-small">Sample outfits</span></div><label className="form-label" htmlFor="sample-outfit">Choose a look</label><select id="sample-outfit" className="select" value={outfit} onChange={e => { setOutfit(e.target.value); setCopied(""); }}><option>Cream linen set</option><option>Lavender wrap dress</option><option>Deep blue casual outfit</option></select><p className="hp-small hp-card-caption">Reusable outfits. Fewer repeated details.</p></Surface>
            <div className="hp-inline-note"><MapPin size={18} /><div><strong>A place for every story</strong><p>Save settings, lighting, and mood in your location library.</p></div></div>
          </div>}
          {visible("Scene prompts") && <div className="hp-preview-column hp-prompt-column">
            <Surface><div className="hp-card-heading"><h3><Film size={16} /> A day in the city</h3><span className="chip">3 scenes</span></div><div className="hp-scene-list">{SCENES.map((s, i) => <button className={sceneIndex === i ? "selected" : ""} key={s} onClick={() => { setSceneIndex(i); setCopied(""); }} aria-pressed={sceneIndex === i}><span className="hp-scene-number">0{i + 1}</span><span>{s}</span><span className="hp-small">Draft</span></button>)}</div></Surface>
            <Surface className="hp-prompt-card"><div className="hp-card-heading"><h3>Prompt preview</h3><span className="hp-live"><span /> Live</span></div><label className="sr-only" htmlFor="sample-engine">Prompt engine</label><select className="select" id="sample-engine" value={engine} onChange={e => { setEngine(e.target.value as EngineId); setCopied(""); }}>{ENGINES.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select><pre className="hp-prompt-text">{prompt}</pre><button className="btn btn-primary" onClick={() => copy(prompt, "Prompt copied")}><Copy size={14} />{copied === "Prompt copied" ? "Copied" : "Copy prompt"}</button></Surface>
            <div className="hp-inline-note"><Layers size={18} /><div><strong>More scenes. Less setup.</strong><p>Paste descriptions, review the details, and build an episode in bulk.</p></div></div>
          </div>}
          {(visible("Extension") || visible("Continuity")) && <div className="hp-preview-column">
            {visible("Extension") && <Surface className="hp-extension-card"><div className="hp-card-heading"><span className="hp-icon"><Puzzle size={18} /></span><span className="chip">Chrome extension</span></div><h2>Your Studio, alongside you.</h2><p>Choose a character, episode, and scene. Copy the same prompt into the tool you already use.</p><div className="hp-extension-preview"><div><Brand /><span className="hp-small">Sample</span></div><span className="hp-small">Character / Episode</span><strong>Maya Chen <span>·</span> A day in the city</strong><span className="hp-small">Selected scene</span><div className="hp-extension-scene"><Film size={14} />{SCENES[sceneIndex]}<Check size={14} /></div></div><a className="btn btn-primary" href={downloadUrl} download><Download size={14} /> Download extension</a><button className="hp-text-button" onClick={() => setInstallOpen(!installOpen)} aria-expanded={installOpen}>How to install <ArrowRight size={12} /></button>{installOpen && <div className="hp-install"><ol><li>Download and extract the extension ZIP.</li><li>Open <code>chrome://extensions</code>.</li><li>Enable Developer mode and choose Load unpacked.</li><li>Select the extracted folder, open Persona Studio, and sign in.</li></ol><button className="btn btn-secondary btn-sm" onClick={() => copy("chrome://extensions", "Address copied")}>{copied === "Address copied" ? "Copied" : "Copy extensions address"}</button></div>}</Surface>}
            {visible("Continuity") && <Surface><div className="hp-card-heading"><span className="hp-icon hp-icon-warm"><Shirt size={18} /></span><span className="hp-small">Continuity preview</span></div><h3>Catch the details before you create.</h3><p className="hp-card-caption">Studio flags repeated outfits and location categories across episodes. Review a warning, keep the choice, or try another look.</p><div className="hp-warning-sample">Example: this outfit appeared in an earlier episode.</div><Link to="/characters" className="btn btn-secondary">Plan your first episode <ArrowRight size={14} /></Link></Surface>}
          </div>}
        </div>
        <p className="hp-preview-caption">Sample character and scenes. Prompt previews use the same formatter as Studio; images and videos are generated in your external tool.</p>
        <span className="sr-only" role="status">{copied}</span>
      </section>
      {showFaq && <section className="hp-faq" id="faq"><h2>A few useful details.</h2>{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>}
    </main>
    <footer className="hp-footer"><span>© {new Date().getFullYear()} Persona Studio</span><button className="hp-text-button" onClick={() => setShowFaq(!showFaq)} aria-expanded={showFaq}>Questions & answers</button><button className="hp-text-button" onClick={() => showcase("Extension")}>Chrome extension</button><Link to="/characters">Open Studio <ArrowRight size={13} /></Link></footer>
  </div>;
}
