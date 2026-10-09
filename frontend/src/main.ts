import "@fontsource/noto-sans-tamil/400.css";
import "@fontsource/noto-sans-tamil/700.css";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/700.css";
import "./styles/main.css";
import "./styles/hud.css";

import { get, setAuthFailureHandler } from "./api/client";
import type { Catalogue } from "./api/types";
import { loadMe } from "./app/auth";
import { setNavigator } from "./app/nav";
import { getSettings } from "./app/settings";
import { store } from "./app/store";
import { audio } from "./game/audio/AudioManager";
import { initI18n, onLanguageChange, t } from "./i18n";
import { toast } from "./ui/dom";
import { Router, type RouteDef } from "./ui/router";
import { adminScreen } from "./ui/screens/admin";
import { loginScreen, registerScreen } from "./ui/screens/auth";
import { errorScreen, errorText, loadingScreen } from "./ui/screens/common";
import { menuScreen, profileScreen, progressScreen } from "./ui/screens/menu";
import { missionsScreen } from "./ui/screens/missions";
import { playScreen } from "./ui/screens/play";
import { resultsScreen } from "./ui/screens/results";
import { designationScreen, experienceScreen, industryScreen } from "./ui/screens/setup";
import { aboutScreen, instructionsScreen, settingsScreen, welcomeScreen } from "./ui/screens/welcome";

const routes: RouteDef[] = [
  { pattern: "/welcome", guard: "guestOnly", render: welcomeScreen },
  { pattern: "/login", guard: "guestOnly", render: loginScreen },
  { pattern: "/register", guard: "guestOnly", render: registerScreen },
  { pattern: "/about", guard: "public", render: aboutScreen },
  { pattern: "/instructions", guard: "public", render: instructionsScreen },
  { pattern: "/settings", guard: "public", render: settingsScreen },
  { pattern: "/menu", guard: "trainee", render: menuScreen },
  { pattern: "/profile", guard: "trainee", render: profileScreen },
  { pattern: "/progress", guard: "trainee", render: progressScreen },
  { pattern: "/setup/industry", guard: "trainee", render: industryScreen },
  { pattern: "/setup/designation", guard: "trainee", render: designationScreen },
  { pattern: "/setup/experience", guard: "trainee", render: experienceScreen },
  { pattern: "/missions", guard: "traineeReady", render: missionsScreen },
  { pattern: "/play/:sessionId", guard: "traineeReady", render: playScreen },
  { pattern: "/results/:sessionId", guard: "trainee", render: resultsScreen },
  { pattern: "/admin", guard: "admin", render: adminScreen },
];

async function boot(): Promise<void> {
  initI18n(getSettings().language);
  const root = document.getElementById("app")!;
  root.replaceChildren(loadingScreen().el);

  // Browsers block audio until a user gesture.
  const unlock = () => audio.unlock();
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });

  try {
    store.setCatalogue(await get<Catalogue>("/catalogue"));
  } catch (e) {
    root.replaceChildren(errorScreen(e, "/welcome").el);
    toast(errorText(e), "error", 8000);
    return;
  }
  await loadMe();

  const router = new Router(root, routes, () => store.me, (e) => errorScreen(e));
  setNavigator((p, replace) => router.navigate(p, replace));
  setAuthFailureHandler((code) => {
    if (!store.me) return;
    store.setMe(null);
    toast(t(`error.${code === "SESSION_EXPIRED" ? "SESSION_EXPIRED" : "NOT_AUTHENTICATED"}`), "warn", 6000);
    router.navigate("/welcome", true);
  });
  onLanguageChange(() => router.refresh());
  if (!location.hash) history.replaceState(null, "", "#/welcome");
  await router.render();
}

void boot();
