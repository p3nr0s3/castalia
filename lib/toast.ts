// lib/toast.ts
// Lightweight, zero-dependency event-driven Toast notification bus for Lyra.

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

class ToastManager {
  private toasts: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();
  private counter = 0;

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = [...this.toasts];
    for (const listener of this.listeners) {
      try {
        listener(copy);
      } catch (err) {
        console.error("[toast] listener error:", err);
      }
    }
  }

  show(message: string, type: ToastType = "info", duration = 4000): string {
    const id = `toast_${Date.now()}_${++this.counter}`;
    const item: ToastItem = { id, type, message, duration };

    this.toasts = [...this.toasts, item];
    this.notify();

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  dismiss(id: string) {
    const filtered = this.toasts.filter((t) => t.id !== id);
    if (filtered.length !== this.toasts.length) {
      this.toasts = filtered;
      this.notify();
    }
  }

  clear() {
    this.toasts = [];
    this.notify();
  }
}

export const toastManager = new ToastManager();

export const toast = {
  success: (message: string, duration?: number) => toastManager.show(message, "success", duration),
  error: (message: string, duration?: number) => toastManager.show(message, "error", duration || 5000),
  warning: (message: string, duration?: number) => toastManager.show(message, "warning", duration || 4500),
  info: (message: string, duration?: number) => toastManager.show(message, "info", duration),
  dismiss: (id: string) => toastManager.dismiss(id),
  clear: () => toastManager.clear(),
};
