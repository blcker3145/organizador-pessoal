import { useSyncExternalStore } from "react";

export interface Store<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (fn: () => void) => () => void;
  use: () => T;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const get = () => state;
  const set: Store<T>["set"] = (next) => {
    const value = typeof next === "function" ? (next as (p: T) => T)(state) : next;
    if (value === state) return;
    state = value;
    listeners.forEach((l) => l());
  };
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const use = () => useSyncExternalStore(subscribe, get, get);
  return { get, set, subscribe, use };
}
