import { useState, useRef, useEffect, useId } from "react";
import { ArrowUpRight, Cloud, LogOut, User } from "lucide-react";
import { useAuth, signOut } from "../../lib/auth";
import { useSyncDisplay } from "../../lib/sync";
import { API_CONFIGURED } from "../../lib/config";
import { fetchEntitlements, UPGRADE_URL, type Entitlements } from "../../lib/billing";

export default function AccountMenu() {
  const auth = useAuth();
  const { shown, sync } = useSyncDisplay();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setEntitlements(null);
    if (open && auth.status === "signed-in") {
      setLoading(true);
      void fetchEntitlements().then(value => { if (!cancelled) setEntitlements(value); })
        .catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [open, auth.user?.id, auth.status, sync.lastSynced, sync.pendingCount]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!API_CONFIGURED || auth.status !== "signed-in" || !auth.user) return null;
  const user = auth.user;
  const name = user.name || user.email?.split("@")[0] || "User";
  const email = user.email ?? "";
  const avatarUrl = user.avatarUrl ?? undefined;
  const syncLabel = shown === "saving" ? "Saving…"
    : shown === "saved" ? "Saved"
    : shown === "offline" ? "Offline"
    : shown === "error" ? "Sync failed"
    : shown === "conflict" ? `${sync.conflicts.length} conflict${sync.conflicts.length !== 1 ? "s" : ""}`
    : shown === "session-expired" ? "Session expired" : "";

  return <div ref={ref} className="account-menu" onBlur={e => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} className="account-avatar-btn" onClick={() => setOpen(v => !v)}
      title={name} aria-label="Account" aria-expanded={open} aria-controls={panelId}>
      {avatarUrl ? <img src={avatarUrl} alt="" /> : <User size={16} />}
    </button>
    {open && <div id={panelId} className="account-menu-dropdown" role="region" aria-label="Your account">
      <div className="account-menu-profile">
        {avatarUrl ? <img className="account-menu-avatar" src={avatarUrl} alt="" />
          : <div className="account-menu-avatar-placeholder"><User size={18} /></div>}
        <div className="account-menu-identity">
          <div className="account-menu-name" title={name}>{name}</div>
          <div className="account-menu-email" title={email}>{email}</div>
        </div>
      </div>
      <div className="account-menu-plan" aria-busy={loading}>
        {entitlements ? <>
          <div className="account-menu-plan-heading">
            <strong>{entitlements.plan === "free" ? "Free plan" : entitlements.plan === "lifetime" ? "Lifetime plan" : "Monthly plan"}</strong>
            <span className="account-menu-badge">{entitlements.plan === "free" ? "Usage" : "Unlimited"}</span>
          </div>
          <dl className="account-menu-usage">
            {(["characters", "episodes", "prompts"] as const).map(key => <div key={key}>
              <dt>{key}</dt><dd>{entitlements.usage[key]} <span>/ {entitlements.limits[key] ?? "Unlimited"}</span></dd>
            </div>)}
          </dl>
          <p className="account-menu-caption">{entitlements.limits.bulkScenes ?? "Unlimited"} scenes per bulk import</p>
          {entitlements.plan === "free" && <a className="account-menu-upgrade" href={UPGRADE_URL} target="_blank" rel="noreferrer">
            Upgrade to unlimited <ArrowUpRight size={14} />
          </a>}
        </> : <p className="account-menu-caption" role="status">{loading ? "Loading plan usage…" : <>Plan usage unavailable. <a href={UPGRADE_URL} target="_blank" rel="noreferrer">View plans</a></>}</p>}
      </div>
      {shown && <div className="account-menu-sync">
        <div className="account-menu-sync-heading"><span><Cloud size={14} /> Cloud sync</span>
          <span className={`account-menu-sync-status is-${shown === "saving" ? "syncing" : shown === "saved" ? "synced" : shown}`} role="status">{syncLabel}</span>
        </div>
        {sync.lastSynced && <p className="account-menu-caption">Last synced {new Date(sync.lastSynced).toLocaleTimeString()}</p>}
        {sync.pendingCount > 0 && <p className="account-menu-pending">{sync.pendingCount} change{sync.pendingCount !== 1 ? "s" : ""} waiting to sync</p>}
        {sync.error && <p className="account-menu-error" role="alert">{sync.error} Your pending changes remain on this device. <a href={UPGRADE_URL} target="_blank" rel="noreferrer">View plans</a></p>}
      </div>}
      <div className="account-menu-divider" />
      <button className="account-menu-item account-menu-item--danger" onClick={() => { setOpen(false); void signOut(); }}>
        <LogOut size={14} /> Sign out
      </button>
    </div>}
  </div>;
}
