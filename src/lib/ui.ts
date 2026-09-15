import { useSyncExternalStore } from "react";
import { createStore } from "./createStore";
import { uid } from "./util";

export interface Toast {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface UIState {
  paletteOpen: boolean;
  captureOpen: boolean;
  captureText: string;
  taskId: string | null;
  reviewOpen: boolean;
  confirm: ConfirmRequest | null;
  toasts: Toast[];
}

export const uiStore = createStore<UIState>({
  paletteOpen: false,
  captureOpen: false,
  captureText: "",
  taskId: null,
  reviewOpen: false,
  confirm: null,
  toasts: [],
});
export const useUI = uiStore.use;

const set = (p: Partial<UIState>) => uiStore.set((s) => ({ ...s, ...p }));

export const ui = {
  openPalette: () => set({ paletteOpen: true, captureOpen: false }),
  closePalette: () => set({ paletteOpen: false }),
  openCapture: (text = "") => set({ captureOpen: true, captureText: text, paletteOpen: false }),
  closeCapture: () => set({ captureOpen: false, captureText: "" }),
  openTask: (id: string) => set({ taskId: id, paletteOpen: false }),
  closeTask: () => set({ taskId: null }),
  openReview: () => set({ reviewOpen: true }),
  closeReview: () => set({ reviewOpen: false }),
  toast(text: string, action?: Toast["action"]) {
    const t: Toast = { id: uid(), text, action };
    uiStore.set((s) => ({ ...s, toasts: [...s.toasts.slice(-2), t] }));
    window.setTimeout(() => uiStore.set((s) => ({ ...s, toasts: s.toasts.filter((x) => x.id !== t.id) })), 4000);
  },
  dismissToast: (id: string) => uiStore.set((s) => ({ ...s, toasts: s.toasts.filter((x) => x.id !== id) })),
  confirm(req: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
    return new Promise((resolve) => {
      set({
        confirm: {
          ...req,
          resolve: (ok) => {
            set({ confirm: null });
            resolve(ok);
          },
        },
      });
    });
  },
};

/* ---------------- Rotas (hash) ---------------- */

function getHash() {
  return window.location.hash.replace(/^#/, "") || "/hoje";
}

function subscribeHash(fn: () => void) {
  window.addEventListener("hashchange", fn);
  return () => window.removeEventListener("hashchange", fn);
}

export function useRoute(): { path: string; parts: string[] } {
  const path = useSyncExternalStore(subscribeHash, getHash, getHash);
  return { path, parts: path.split("/").filter(Boolean) };
}

export function navigate(path: string) {
  if (getHash() !== path) window.location.hash = path;
}

/* ---------------- Preferências de visão (por navegador) ---------------- */

export function usePersistedView<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const store = viewStores[key] || (viewStores[key] = createStore<string>(readView(key, fallback)));
  const value = store.use() as T;
  const setValue = (v: T) => {
    store.set(v);
    try {
      localStorage.setItem(`organizador:view:${key}`, v);
    } catch {
      /* ignora */
    }
  };
  return [value, setValue];
}

const viewStores: Record<string, ReturnType<typeof createStore<string>>> = {};

function readView(key: string, fallback: string) {
  try {
    return localStorage.getItem(`organizador:view:${key}`) || fallback;
  } catch {
    return fallback;
  }
}
