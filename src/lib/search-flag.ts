"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const read = () => (typeof window === "undefined" ? "" : window.location.search);

export function useSearchFlag(name: string) {
  const search = useSyncExternalStore(subscribe, read, () => "");
  return new URLSearchParams(search).get(name);
}

export function clearSearchFlags(names: string[]) {
  const url = new URL(window.location.href);
  for (const name of names) url.searchParams.delete(name);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  for (const listener of listeners) listener();
}
