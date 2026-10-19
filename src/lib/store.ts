import { useSyncExternalStore } from "react"

/** Minimal external store for realtime state that changes too often for React Query. */
export function createStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()

  const get = () => state
  const set = (next: T | ((prev: T) => T)) => {
    state = typeof next === "function" ? (next as (prev: T) => T)(state) : next
    listeners.forEach((listener) => listener())
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function useStore<S>(selector: (state: T) => S) {
    return useSyncExternalStore(subscribe, () => selector(state))
  }

  return { get, set, subscribe, useStore }
}
