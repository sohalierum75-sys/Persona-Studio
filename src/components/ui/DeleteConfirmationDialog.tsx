import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { finishDeleteConfirmation, useDeleteConfirmation } from "../../lib/confirm-delete";

export default function DeleteConfirmationDialog() {
  const { request } = useDeleteConfirmation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [request]);

  useEffect(() => () => finishDeleteConfirmation(false), []);

  return <dialog ref={dialogRef} className="delete-confirmation" aria-labelledby="delete-confirmation-title"
    aria-describedby="delete-confirmation-description" onKeyDown={event => event.stopPropagation()}
    onCancel={event => { event.preventDefault(); finishDeleteConfirmation(false); }}>
    <div className="delete-confirmation-icon"><Trash2 size={22} aria-hidden="true" /></div>
    <h2 id="delete-confirmation-title">Delete this item?</h2>
    <div id="delete-confirmation-description">
      <p>Are you sure you want to delete <strong className="delete-confirmation-name">{request?.name}</strong>?</p>
      {request?.detail && <p>{request.detail}</p>}
      <p className="delete-confirmation-warning">This cannot be undone.</p>
    </div>
    <div className="delete-confirmation-actions">
      <button ref={cancelRef} className="btn btn-secondary" autoFocus onClick={() => finishDeleteConfirmation(false)}>Cancel</button>
      <button className="btn btn-danger" onClick={() => finishDeleteConfirmation(true)}>Delete</button>
    </div>
  </dialog>;
}
