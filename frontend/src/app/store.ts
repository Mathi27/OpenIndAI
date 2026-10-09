// Minimal global application state with change notification.
import type { Catalogue, Me } from "../api/types";

interface State {
  me: Me | null;
  catalogue: Catalogue | null;
}

const state: State = { me: null, catalogue: null };
const listeners = new Set<() => void>();

export const store = {
  get me() {
    return state.me;
  },
  get catalogue() {
    return state.catalogue;
  },
  setMe(me: Me | null) {
    state.me = me;
    listeners.forEach((fn) => fn());
  },
  setCatalogue(c: Catalogue) {
    state.catalogue = c;
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
