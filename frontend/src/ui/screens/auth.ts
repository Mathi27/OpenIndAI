import { ApiError } from "../../api/client";
import { login, register } from "../../app/auth";
import { navigate } from "../../app/nav";
import { nextSetupRoute } from "../../app/profileLogic";
import { t } from "../../i18n";
import { h } from "../dom";
import type { Screen } from "../router";
import { errorText, page, pageHeader } from "./common";

function field(id: string, label: string, type: string, autocomplete: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const input = h("input", { id, name: id, type, autocomplete, required: true, spellcheck: "false", autocapitalize: "off" });
  return { wrap: h("div", { class: "field" }, h("label", { for: id }, label), input), input };
}

export function validateLogin(username: string, password: string): string | null {
  if (!username.trim() || !password) return "error.emptyFields";
  return null;
}

export function validateRegistration(username: string, password: string, displayName: string): string | null {
  if (!username.trim() || !password || !displayName.trim()) return "error.emptyFields";
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username.trim())) return "error.usernameRule";
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return "error.passwordRule";
  return null;
}

export function loginScreen(_: Record<string, string>, query: URLSearchParams): Screen {
  const portal = query.get("portal") === "admin" ? "admin" : "trainee";
  const user = field("username", t("auth.username"), "text", "username");
  const pass = field("password", t("auth.password"), "password", "current-password");
  user.input.autofocus = true;
  const err = h("p", { class: "form-error", role: "alert", "aria-live": "assertive" });
  const submit = h("button", { class: "btn btn-primary btn-block btn-lg", type: "submit" }, t("auth.signIn"));

  const form = h("form", { class: "panel", novalidate: true }, user.wrap, pass.wrap, err, submit);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const problem = validateLogin(user.input.value, pass.input.value);
    user.input.setAttribute("aria-invalid", String(!user.input.value.trim()));
    pass.input.setAttribute("aria-invalid", String(!pass.input.value));
    if (problem) {
      err.textContent = t(problem);
      return;
    }
    submit.disabled = true;
    submit.textContent = t("auth.signingIn");
    err.textContent = "";
    try {
      const me = await login(user.input.value.trim(), pass.input.value, portal);
      if (me.user.role === "admin") navigate("/admin", true);
      else navigate(nextSetupRoute(me.profile) ?? "/menu", true);
    } catch (ex) {
      err.textContent = errorText(ex);
      if (ex instanceof ApiError && ex.code === "INVALID_CREDENTIALS") {
        pass.input.value = "";
        pass.input.focus();
      }
    } finally {
      submit.disabled = false;
      submit.textContent = t("auth.signIn");
    }
  });

  return page(
    [
      pageHeader(t(portal === "admin" ? "auth.titleAdmin" : "auth.titleTrainee"), "/welcome"),
      h(
        "div",
        { class: "narrow", style: "margin:0 auto;width:min(460px,100%)" },
        form,
        portal === "admin" ? h("p", { class: "notice" }, t("auth.adminNote")) : h("p", {}, h("a", { href: "#/register" }, t("auth.needAccount"))),
        import.meta.env.DEV ? h("p", { class: "notice orange small" }, t("auth.devHint")) : null,
      ),
    ],
    "",
  );
}

export function registerScreen(): Screen {
  const name = field("displayName", t("auth.displayName"), "text", "name");
  const user = field("username", t("auth.username"), "text", "username");
  const pass = field("password", t("auth.password"), "password", "new-password");
  name.input.autofocus = true;
  const err = h("p", { class: "form-error", role: "alert" });
  const submit = h("button", { class: "btn btn-primary btn-block btn-lg", type: "submit" }, t("auth.register"));
  const form = h("form", { class: "panel", novalidate: true }, name.wrap, user.wrap, pass.wrap, h("p", { class: "muted small" }, t("error.passwordRule")), err, submit);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const problem = validateRegistration(user.input.value, pass.input.value, name.input.value);
    if (problem) {
      err.textContent = t(problem);
      return;
    }
    submit.disabled = true;
    try {
      await register(user.input.value.trim(), pass.input.value, name.input.value.trim());
      navigate("/setup/industry", true);
    } catch (ex) {
      err.textContent = errorText(ex);
    } finally {
      submit.disabled = false;
    }
  });
  return page([
    pageHeader(t("auth.titleRegister"), "/login?portal=trainee"),
    h("div", { style: "margin:0 auto;width:min(460px,100%)" }, form, h("p", {}, h("a", { href: "#/login?portal=trainee" }, t("auth.haveAccount")))),
  ]);
}
