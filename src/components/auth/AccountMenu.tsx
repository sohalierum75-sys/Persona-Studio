/**
 * AccountMenu — avatar, display name, email, sync status, sign-out.
 * Appears as a dropdown from the header avatar button.
 */
import React, { useState, useRef, useEffect } from "react";
import { LogOut, User } from "lucide-react";
import { useAuth, signOut } from "../../lib/auth";
import { useSyncState } from "../../lib/sync";
import { API_CONFIGURED } from "../../lib/config";
import { fetchEntitlements, UPGRADE_URL, type Entitlements } from "../../lib/billing";

export default function AccountMenu() {
  const auth = useAuth();
  const sync = useSyncState();
  const [open, setOpen] = useState(false);
  const ref  = useRef<HTMLDivElement>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  useEffect(() => {
    let cancelled = false;
    setEntitlements(null);
    if (open && auth.status === "signed-in") {
      void fetchEntitlements().then(value => { if (!cancelled) setEntitlements(value); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [open, auth.user?.id, auth.status, sync.lastSynced, sync.pendingCount]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!API_CONFIGURED || auth.status !== "signed-in" || !auth.user) return null;

  const user      = auth.user;
  const name      = user.name || user.email?.split("@")[0] || "User";
  const email     = user.email ?? "";
  const avatarUrl = user.avatarUrl ?? undefined;

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button
        className="account-avatar-btn"
        onClick={() => setOpen(v => !v)}
        title={name}
      >
        {avatarUrl
          ? <img src={avatarUrl} alt={name} style={{ width:28, height:28, borderRadius:"50%", objectFit:"cover" }}/>
          : <User size={16}/>
        }
      </button>

      {open && (
        <div className="account-menu-dropdown">
          {/* Profile row */}
          <div className="account-menu-profile">
            {avatarUrl
              ? <img src={avatarUrl} alt={name} style={{ width:40, height:40, borderRadius:"50%", objectFit:"cover", flexShrink:0 }}/>
              : <div className="account-menu-avatar-placeholder"><User size={20}/></div>
            }
            <div style={{ minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:13, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
              <div style={{ fontSize:11, color:"var(--text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{email}</div>
            </div>
          </div>

          {/* Sync status row */}
          <div style={{ padding:14, fontSize:12 }}>
            {entitlements ? <>
              <strong>{entitlements.plan === "free" ? "Free plan" : `${entitlements.plan === "lifetime" ? "Lifetime" : "Monthly"} plan — unlimited`}</strong>
              {(["characters", "episodes", "prompts"] as const).map(key => (
                <div key={key}>{entitlements.usage[key]} / {entitlements.limits[key] ?? "Unlimited"} {key}</div>
              ))}
              <div>{entitlements.limits.bulkScenes ?? "Unlimited"} scenes per bulk import</div>
              {entitlements.plan === "free" && <a href={UPGRADE_URL} target="_blank" rel="noreferrer">Upgrade for unlimited access</a>}
            </> : <span>Plan usage unavailable. <a href={UPGRADE_URL} target="_blank" rel="noreferrer">View plans</a></span>}
          </div>
          {sync.error && <div role="alert" style={{ padding:14, fontSize:12 }}>{sync.error} Your pending changes remain on this device. <a href={UPGRADE_URL} target="_blank" rel="noreferrer">View plans</a></div>}
          <div className="account-menu-divider"/>
          <div className="account-menu-row" style={{ fontSize:11, color:"var(--text-muted)" }}>
            <span>Sync status:</span>
            <span style={{
              color: sync.status === "synced" ? "var(--success)"
                   : sync.status === "error" || sync.status === "conflict" ? "var(--warning)"
                   : "var(--text-muted)"
            }}>
              {sync.status === "syncing" ? "Saving…"
               : sync.status === "synced" ? "Synced ✓"
               : sync.status === "offline" ? `Offline (${sync.pendingCount} pending)`
               : sync.status === "error" ? "Failed"
               : sync.status === "conflict" ? `${sync.conflicts.length} conflict${sync.conflicts.length!==1?"s":""}`
               : sync.status === "session-expired" ? "Session expired"
               : "—"}
            </span>
          </div>
          {sync.lastSynced && (
            <div style={{ fontSize:10, color:"var(--text-muted)", padding:"0 14px 4px" }}>
              Last synced: {new Date(sync.lastSynced).toLocaleTimeString()}
            </div>
          )}
          {sync.pendingCount > 0 && (
            <div style={{ fontSize:10, color:"var(--warning)", padding:"0 14px 4px" }}>
              {sync.pendingCount} change{sync.pendingCount!==1?"s":""} waiting to sync
            </div>
          )}

          <div className="account-menu-divider"/>

          {/* Sign out */}
          <button className="account-menu-item account-menu-item--danger" onClick={() => { setOpen(false); signOut(); }}>
            <LogOut size={13}/> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
