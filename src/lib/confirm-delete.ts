import { create } from "zustand";

interface DeleteRequest {
  name: string;
  detail?: string;
  resolve: (confirmed: boolean) => void;
}

export const useDeleteConfirmation = create<{ request: DeleteRequest | null }>(() => ({ request: null }));

export function finishDeleteConfirmation(confirmed: boolean): void {
  const { request } = useDeleteConfirmation.getState();
  useDeleteConfirmation.setState({ request: null });
  request?.resolve(confirmed);
}

export function confirmDelete(name: string, detail?: string): Promise<boolean> {
  // A second request never implicitly approves the first one.
  finishDeleteConfirmation(false);
  return new Promise(resolve => {
    useDeleteConfirmation.setState({ request: { name, detail, resolve } });
  });
}
