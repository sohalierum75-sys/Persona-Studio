/**
 * SyncStatus — compact indicator shown in both Studio header and extension.
 * Dark charcoal + purple visual language, matches existing design system.
 */
import React from "react";
import { Cloud, CloudOff, AlertTriangle, RefreshCw, CheckCircle2, Clock, LogIn } from "lucide-react";
import { useSyncState, reconcile } from "../../lib/sync";
import { API_CONFIGURED } from "../../lib/config";

export default function SyncStatus() {
  const sync = useSyncState();

  if (!API_CONFIGURED) return null;

  const { status, pendingCount, lastSynced, error } = sync;

  function label(): string {
    switch (status) {
      case "idle":           return "Ready";
      case "syncing":        return "Saving…";
      case "synced":         return "Synced";
      case "offline":        return pendingCount > 0 ? `Offline — ${pendingCount} pending` : "Offline";
      case "error":          return "Sync failed";
      case "conflict":       return "Conflict — review needed";
      case "session-expired": return "Sign in again";
      default:               return "";
    }
  }

  function icon() {
    switch (status) {
      case "syncing":        return <RefreshCw size={12} style={{ animation:"spin 1s linear infinite" }}/>;
      case "synced":         return <CheckCircle2 size={12} style={{ color:"var(--success)" }}/>;
      case "offline":        return <CloudOff size={12} style={{ color:"var(--text-muted)" }}/>;
      case "error":
      case "conflict":       return <AlertTriangle size={12} style={{ color:"var(--warning)" }}/>;
      case "session-expired": return <LogIn size={12} style={{ color:"var(--accent)" }}/>;
      default:               return <Cloud size={12} style={{ color:"var(--text-muted)" }}/>;
    }
  }

  const isClickable = status === "offline" || status === "error" || status === "conflict";

  return (
    <button
      className="sync-status-btn"
      aria-label={`${label()}${isClickable ? '. Retry sync' : ''}`}
      onClick={isClickable ? () => void reconcile({force:true}) : undefined}
      style={{ cursor: isClickable ? "pointer" : "default" }}
      title={error ?? (lastSynced ? `Last synced: ${new Date(lastSynced).toLocaleTimeString()}` : undefined)}
    >
      {icon()}
      <span className="sync-status-label">{label()}</span>
      {isClickable && <span style={{ fontSize:10, opacity:0.7, marginLeft:2 }}>Retry</span>}
    </button>
  );
}
