import { supportedLocales } from "./locales";
import { LANGUAGE_KEY, languageCookiePath } from "./preference";

const args = JSON.stringify([
  supportedLocales.map((locale) => locale.code),
  LANGUAGE_KEY,
  languageCookiePath,
]).replaceAll("<", "\\u003c");
/** A single pre-paint migration; a blocked cookie never causes a reload loop or an extra editor. */
export const localeBootstrapScript = `(() => {
  try {
    const [codes, key, path] = ${args};
    const language = localStorage.getItem(key);
    if (!language || !codes.includes(language)) return;
    const read = () => document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(key + "="))?.slice(key.length + 1);
    if (read() === language) return;
    document.cookie = key + "=" + language + "; Path=" + path + "; Max-Age=31536000; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
    if (read() === language && document.documentElement.dataset.initialLocale !== language) {
      document.documentElement.dataset.localeRedirect = "true";
      document.documentElement.style.visibility = "hidden";
      location.replace(location.href);
    }
  } catch {}
})();`;
