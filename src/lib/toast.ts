/**
 * Toast notification system for surfacing errors and messages to users
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

type ToastListener = (toasts: Toast[]) => void

class ToastManager {
  private toasts: Toast[] = []
  private listeners: Set<ToastListener> = new Set()
  private counter = 0

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener)
    listener(this.toasts)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    this.listeners.forEach(listener => listener([...this.toasts]))
  }

  private add(toast: Omit<Toast, 'id'>): string {
    const id = `toast-${++this.counter}-${Date.now()}`
    const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 3000)

    const newToast: Toast = { ...toast, id }
    this.toasts = [...this.toasts, newToast]
    this.notify()

    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration)
    }

    return id
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id)
    this.notify()
  }

  dismissAll() {
    this.toasts = []
    this.notify()
  }

  success(message: string, duration?: number): string {
    return this.add({ message, type: 'success', duration })
  }

  error(message: string, duration?: number): string {
    return this.add({ message, type: 'error', duration })
  }

  warning(message: string, duration?: number): string {
    return this.add({ message, type: 'warning', duration })
  }

  info(message: string, duration?: number): string {
    return this.add({ message, type: 'info', duration })
  }
}

// Singleton instance
export const toast = new ToastManager()

// Hook to use toasts in React components
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    return toast.subscribe(setToasts)
  }, [])

  return toasts
}

// For importing useState and useEffect
import { useState, useEffect } from 'react'
