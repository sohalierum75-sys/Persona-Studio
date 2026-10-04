import styles from "./overlay.css?inline";

interface Geometry { x: number; y: number; width: number; height: number }
interface OverlayHandle { host: HTMLElement; restore: () => void; dispose: () => void }

// This handle lives in Chrome's isolated world, not the website's globals.
(() => {
  const scope = globalThis as typeof globalThis & { personaFloatingPanel?: OverlayHandle };
  const existing = scope.personaFloatingPanel;
  if (existing?.host.isConnected) { existing.restore(); return; }
  existing?.dispose();

  const host = document.createElement("div");
  host.id = "persona-studio-overlay";
  host.setAttribute("popover", "manual");
  // Protect the host from global CSS; the non-modal top layer avoids stacking
  // contexts and transformed or clipped containers on the underlying page.
  for (const [property,value] of Object.entries({all:"initial",position:"fixed",display:"block",margin:"0",padding:"0",border:"0",background:"transparent",overflow:"visible",zIndex:"2147483647",colorScheme:"light",inset:"auto",boxSizing:"border-box",maxWidth:"none",maxHeight:"none",minWidth:"0",minHeight:"0"})) {
    host.style.setProperty(property.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`),value,"important");
  }
  const shadow = host.attachShadow({mode:"open"});
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  shadow.adoptedStyleSheets = [sheet];
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("role","region");
  panel.setAttribute("aria-label","Persona Studio floating panel");
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  toolbar.tabIndex = 0;
  toolbar.setAttribute("aria-label","Move Persona Studio panel. Drag or use arrow keys.");
  toolbar.title = "Drag to move; arrow keys move when focused";
  const grip = document.createElement("span");
  grip.className = "grip";
  grip.textContent = "⠿";
  grip.setAttribute("aria-hidden","true");
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = "Persona Studio";
  function control(label: string, text: string) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control";
    button.setAttribute("aria-label",label);
    button.title = label;
    button.textContent = text;
    return button;
  }
  const minimize = control("Minimize panel","−");
  const close = control("Close panel","×");
  toolbar.append(grip,title,minimize,close);
  const content = document.createElement("div");
  content.className = "content";
  const iframe = document.createElement("iframe");
  iframe.title = "Persona Studio workspace";
  iframe.src = chrome.runtime.getURL("floating-panel.html");
  iframe.allow = "clipboard-write";
  const notice = document.createElement("div");
  notice.className = "notice";
  notice.hidden = true;
  const noticeText = document.createElement("p");
  noticeText.textContent = "The floating panel could not load on this page. You can still open your Studio.";
  const openStudio = document.createElement("button");
  openStudio.textContent = "Open Studio";
  openStudio.onclick = () => { void chrome.runtime.sendMessage({type:"persona:open-studio"}); };
  notice.append(noticeText,openStudio);
  content.append(iframe,notice);
  const resize = control("Resize panel. Drag or use arrow keys.","◢");
  resize.className = "resize";
  panel.append(toolbar,content,resize);
  shadow.append(panel);

  const initialFocus = document.activeElement as HTMLElement | null;
  const events = new AbortController();
  const options = {signal:events.signal};
  let minimized = false;
  let touched = false;
  let disposed = false;
  let geometry: Geometry = {x:innerWidth-444,y:24,width:420,height:Math.min(680,innerHeight-48)};
  let saveTimer: ReturnType<typeof setTimeout>;
  const loadTimer = setTimeout(() => { notice.hidden = false; },12000);
  function layout() {
    const widthLimit = Math.max(1,innerWidth), heightLimit = Math.max(1,innerHeight);
    const margin = Math.min(8,widthLimit/4,heightLimit/4);
    geometry.width = Math.max(Math.min(340,widthLimit-2*margin),Math.min(geometry.width,widthLimit-2*margin));
    geometry.height = Math.max(Math.min(360,heightLimit-2*margin),Math.min(geometry.height,heightLimit-2*margin));
    const width = minimized ? Math.min(260,geometry.width) : geometry.width;
    const height = minimized ? Math.min(48,heightLimit-2*margin) : geometry.height;
    geometry.x = Math.max(margin,Math.min(geometry.x,widthLimit-width-margin));
    geometry.y = Math.max(margin,Math.min(geometry.y,heightLimit-height-margin));
    for (const [property,value] of Object.entries({left:geometry.x,top:geometry.y,width,height})) host.style.setProperty(property,`${value}px`,"important");
  }
  function save() {
    touched = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void chrome.storage.local.set({personaPanelGeometry:geometry}).catch(() => {}); },150);
  }
  function restore() {
    minimized = false;
    panel.classList.remove("minimized");
    minimize.setAttribute("aria-label","Minimize panel");
    minimize.title = "Minimize panel";
    minimize.textContent = "−";
    layout();
    if (!host.matches(":popover-open")) host.showPopover();
    toolbar.focus({preventScroll:true});
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    events.abort();
    clearTimeout(loadTimer);
    clearTimeout(saveTimer);
    if (touched) void chrome.storage.local.set({personaPanelGeometry:geometry}).catch(() => {});
    host.remove();
    if (scope.personaFloatingPanel?.host === host) delete scope.personaFloatingPanel;
    if (initialFocus?.isConnected) initialFocus.focus({preventScroll:true});
  }
  close.addEventListener("click",dispose,options);
  minimize.addEventListener("click",() => {
    if (minimized) { restore(); return; }
    minimized = true;
    panel.classList.add("minimized");
    minimize.setAttribute("aria-label","Restore panel");
    minimize.title = "Restore panel";
    minimize.textContent = "□";
    layout();
  },options);

  function manipulation(element: HTMLElement, resizing: boolean) {
    let drag: {x:number;y:number;original:Geometry;pointerId:number} | null = null;
    element.addEventListener("pointerdown",event => {
      if (event.button !== 0 || (!resizing && (event.target as HTMLElement).closest("button"))) return;
      event.preventDefault();
      element.focus({preventScroll:true});
      element.setPointerCapture(event.pointerId);
      drag = {x:event.clientX,y:event.clientY,original:{...geometry},pointerId:event.pointerId};
      panel.classList.add("moving");
    },options);
    element.addEventListener("pointermove",event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX-drag.x, dy = event.clientY-drag.y;
      geometry = resizing ? {...drag.original,width:drag.original.width+dx,height:drag.original.height+dy}
        : {...drag.original,x:drag.original.x+dx,y:drag.original.y+dy};
      layout();
    },options);
    const finish = () => { if (drag) { drag = null; panel.classList.remove("moving"); save(); } };
    element.addEventListener("pointerup",finish,options);
    element.addEventListener("pointercancel",finish,options);
    element.addEventListener("lostpointercapture",finish,options);
    element.addEventListener("keydown",event => {
      if (event.target !== element || !["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const amount = event.shiftKey ? 32 : 16;
      const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
      const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
      if (resizing) { geometry.width += dx; geometry.height += dy; }
      else { geometry.x += dx; geometry.y += dy; }
      layout(); save();
    },options);
  }
  manipulation(toolbar,false);
  manipulation(resize,true);
  window.addEventListener("resize",layout,options);
  window.visualViewport?.addEventListener("resize",layout,options);
  window.addEventListener("message",event => {
    if (event.source !== iframe.contentWindow || event.origin !== chrome.runtime.getURL("").slice(0,-1) || event.data?.type !== "persona:panel-ready") return;
    clearTimeout(loadTimer);
    notice.hidden = true;
    panel.dataset.theme = event.data.theme === "dark" ? "dark" : "light";
  },options);
  document.documentElement.append(host);
  scope.personaFloatingPanel = {host,restore,dispose};
  restore();
  void chrome.storage.local.get("personaPanelGeometry").then(value => {
    const saved = value.personaPanelGeometry as Geometry | undefined;
    if (disposed || touched || !saved || ![saved.x,saved.y,saved.width,saved.height].every(Number.isFinite)) return;
    geometry = {x:saved.x,y:saved.y,width:saved.width,height:saved.height};
    layout();
  }).catch(() => {});
})();
