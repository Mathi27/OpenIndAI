import { get, post, put } from "../api/client";
import type { Me, Profile } from "../api/types";
import { setLanguage } from "../i18n";
import type { Language } from "../mission/types";
import { getSettings, updateSettings } from "./settings";
import { store } from "./store";

function adoptLanguage(me: Me): void {
  // The server-stored preference wins after sign-in so it follows the trainee across devices.
  if (me.profile.language !== getSettings().language) {
    updateSettings({ language: me.profile.language });
    void setLanguage(me.profile.language);
  }
}

export async function loadMe(): Promise<Me | null> {
  try {
    const me = await get<Me>("/auth/me", { silentAuth: true });
    store.setMe(me);
    adoptLanguage(me);
    return me;
  } catch {
    store.setMe(null);
    return null;
  }
}

export async function login(username: string, password: string, portal: "trainee" | "admin"): Promise<Me> {
  const me = await post<Me>("/auth/login", { username, password, portal });
  store.setMe(me);
  adoptLanguage(me);
  return me;
}

export async function register(username: string, password: string, displayName: string): Promise<Me> {
  const me = await post<Me>("/auth/register", { username, password, display_name: displayName });
  // Keep the language the trainee picked before registering.
  const lang = getSettings().language;
  store.setMe(me);
  if (lang !== "en") return saveProfile({ language: lang });
  return me;
}

export async function logout(): Promise<void> {
  try {
    await post("/auth/logout");
  } finally {
    store.setMe(null);
  }
}

export async function saveProfile(patch: Partial<Profile> & { displayName?: string }): Promise<Me> {
  const me = await put<Me>("/profile", patch);
  store.setMe(me);
  return me;
}

export async function changeLanguage(lang: Language): Promise<void> {
  updateSettings({ language: lang });
  await setLanguage(lang);
  if (store.me) {
    try {
      await saveProfile({ language: lang });
    } catch {
      /* preference still stored locally */
    }
  }
}
