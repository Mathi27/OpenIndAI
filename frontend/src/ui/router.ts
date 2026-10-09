// Hash router with role/profile guards. Hash routing keeps deep links and
// browser refresh working without server-side routing.
import type { Me } from "../api/types";
import { nextSetupRoute } from "../app/profileLogic";

export type Guard = "public" | "guestOnly" | "auth" | "trainee" | "traineeReady" | "admin";

export interface Screen {
  el: HTMLElement;
  dispose?: () => void;
  /** Screens that own the full viewport (the 3D game) opt out of re-render on language change. */
  handlesLanguage?: boolean;
}

export interface RouteDef {
  pattern: string; // e.g. "/play/:sessionId"
  guard: Guard;
  render: (params: Record<string, string>, query: URLSearchParams) => Screen | Promise<Screen>;
}

export interface Match {
  route: RouteDef;
  params: Record<string, string>;
}

export function parseHash(hash: string): { path: string; query: URLSearchParams } {
  const raw = hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?", 2);
  return { path: path || "/", query: new URLSearchParams(qs ?? "") };
}

export function matchRoute(routes: RouteDef[], path: string): Match | null {
  const parts = path.split("/").filter(Boolean);
  for (const route of routes) {
    const rp = route.pattern.split("/").filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(":")) params[rp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (rp[i] !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

/** Returns a redirect path if the guard is not satisfied, else null. */
export function guardRedirect(guard: Guard, me: Me | null, path: string): string | null {
  switch (guard) {
    case "public":
      return null;
    case "guestOnly":
      return me ? (me.user.role === "admin" ? "/admin" : "/menu") : null;
    case "auth":
      return me ? null : "/welcome";
    case "trainee":
      if (!me) return "/welcome";
      return me.user.role === "trainee" ? null : "/admin";
    case "traineeReady": {
      if (!me) return "/welcome";
      if (me.user.role !== "trainee") return "/admin";
      const setup = nextSetupRoute(me.profile);
      return setup && setup !== path ? setup : null;
    }
    case "admin":
      if (!me) return "/welcome";
      return me.user.role === "admin" ? null : "/menu";
  }
}

export class Router {
  private current: Screen | null = null;
  private rendering = 0;

  constructor(
    private root: HTMLElement,
    private routes: RouteDef[],
    private getMe: () => Me | null,
    private onError: (e: unknown) => Screen,
  ) {
    window.addEventListener("hashchange", () => void this.render());
  }

  navigate(path: string, replace = false): void {
    const target = `#${path}`;
    if (location.hash === target) {
      void this.render();
      return;
    }
    if (replace) {
      history.replaceState(null, "", target);
      void this.render();
    } else {
      location.hash = path;
    }
  }

  refresh(force = false): void {
    if (!force && this.current?.handlesLanguage) return;
    void this.render();
  }

  async render(): Promise<void> {
    const ticket = ++this.rendering;
    const { path, query } = parseHash(location.hash);
    const match = matchRoute(this.routes, path);
    if (!match) {
      this.navigate(this.getMe() ? "/menu" : "/welcome", true);
      return;
    }
    const redirect = guardRedirect(match.route.guard, this.getMe(), path);
    if (redirect && redirect !== path) {
      this.navigate(redirect, true);
      return;
    }
    let screen: Screen;
    try {
      screen = await match.route.render(match.params, query);
    } catch (e) {
      screen = this.onError(e);
    }
    if (ticket !== this.rendering) {
      screen.dispose?.();
      return; // a newer navigation superseded this one
    }
    this.current?.dispose?.();
    this.root.replaceChildren(screen.el);
    this.current = screen;
    const focusTarget = screen.el.querySelector<HTMLElement>("[autofocus], h1, h2");
    focusTarget?.focus?.({ preventScroll: true });
  }
}
