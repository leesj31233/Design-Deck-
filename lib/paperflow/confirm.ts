import { create } from "zustand";

/** A question the app asks before something it cannot undo. */
export interface ConfirmRequest { title: string; body?: string; confirm: string; tone?: "danger" | "default" }
interface ConfirmState { request: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null; answer: (ok: boolean) => void }

export const useConfirm = create<ConfirmState>((set, get) => ({
  request: null,
  answer: ok => { const current = get().request; set({ request: null }); current?.resolve(ok); }
}));

/** Ask, and wait for the answer (false when dismissed). A newer question replaces an open one, which reads as cancelled. */
export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  return new Promise(resolve => {
    useConfirm.getState().request?.resolve(false);
    useConfirm.setState({ request: { ...request, resolve } });
  });
}
