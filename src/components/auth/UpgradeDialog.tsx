import { useEffect, useRef } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useUpgradeDialog } from "../../lib/plan-guard";
import { UPGRADE_URL } from "../../lib/billing";

export default function UpgradeDialog() {
  const {message,dismiss} = useUpgradeDialog();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!message) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => { ref.current?.close(); previous?.focus(); };
  }, [message]);
  return <dialog ref={ref} className="upgrade-dialog" aria-labelledby="upgrade-title" aria-describedby="upgrade-description"
    onCancel={e => { e.preventDefault(); e.stopPropagation(); dismiss(); }}
    onKeyDown={e => e.stopPropagation()}>
    <div className="upgrade-dialog-icon"><Sparkles size={25} /></div>
    <span className="upgrade-dialog-eyebrow">MORE ROOM TO CREATE</span>
    <h2 id="upgrade-title">Continue with an upgraded plan</h2>
    <p id="upgrade-description">{message}</p>
    <p className="upgrade-dialog-note">Your existing work and draft are safe.</p>
    <div className="upgrade-dialog-actions">
      <button className="btn btn-secondary" onClick={dismiss} autoFocus>Not now</button>
      <a className="btn btn-primary" href={UPGRADE_URL} target="_blank" rel="noreferrer" onClick={dismiss}>Upgrade plan <ArrowUpRight size={16} /></a>
    </div>
  </dialog>;
}
