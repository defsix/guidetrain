import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase client, or nothing.
 *
 * Nothing is a supported state and the rest of the app is built around it. The
 * project may not exist yet, a fork may not have one, and a phone in a basement
 * gym has no network at all — in every one of those cases GuideTrain has to
 * work exactly as it did before accounts existed, storing everything locally.
 * So this returns null rather than throwing, and every caller treats a null
 * client as "you are training offline", which is not an error.
 *
 * The keys are build-time `VITE_` variables and therefore ship inside the
 * bundle. That is correct for these two and only these two: the URL names the
 * project and the anon key names the *project*, not the person. Supabase is
 * designed around that key being public, which is why row-level security is the
 * whole of the protection and why the policies in supabase/migrations came
 * first. The service-role key bypasses RLS entirely and must never appear in a
 * VITE_ variable, a commit, or anything that reaches a browser.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * A secret key here would be a serious mistake shipped to every visitor, so it
 * is worth one cheap check rather than trusting the variable name.
 *
 * Two formats, because Supabase is midway through changing them. The current
 * keys are opaque strings prefixed `sb_publishable_` and `sb_secret_`; the
 * legacy ones are JWTs carrying `"role":"anon"` or `"role":"service_role"`.
 * Both are accepted, and the check has to know both — a guard that only
 * understood JWTs would wave a modern `sb_secret_` key straight through, which
 * is exactly the kind of silent gap this exists to close.
 */
function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  if (key.startsWith("sb_publishable_")) return false;
  try {
    const payload = JSON.parse(atob(key.split(".")[1]));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

let client: SupabaseClient | null = null;

if (url && anonKey) {
  if (isSecretKey(anonKey)) {
    // Refusing is the only safe response. Connecting would hand every visitor
    // a key that reads and writes every row of every account.
    console.error(
      "VITE_SUPABASE_ANON_KEY is a secret key (sb_secret_… or service_role). " +
        "Refusing to connect — that key bypasses row-level security and must " +
        "never reach a browser. Use the publishable key.",
    );
  } else {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Explicit rather than trusting the library default, which is
        // 'implicit' — that flow returns the session as a URL *fragment*
        // (`#access_token=...`), and this app is hash-routed, so the two would
        // fight over the same piece of the URL. 'pkce' returns an
        // authorization code as a real query parameter instead. Verified
        // against auth-js's own source rather than assumed: parseParametersFromURL
        // reads the query string and the fragment separately and lets the
        // query string win on a key collision, and the post-exchange cleanup
        // (GoTrueClient._getSessionFromURL) only ever deletes from
        // `url.searchParams` — `url.hash`, and with it this app's route, is
        // never touched.
        flowType: "pkce",
      },
    });
  }
}

export const supabase = client;

/** Whether accounts are available at all. False is a normal, working state. */
export const hasBackend = client !== null;

/**
 * Providers with real credentials in place, both in their own console and in
 * Supabase's dashboard.
 *
 * A provider not listed here would still redirect a visitor to a real consent
 * screen and back to a clear error — not broken, but not something to put in
 * front of anyone before it has actually been proven working end to end.
 *
 * A plain array rather than an env var on purpose: turning a provider on is a
 * one-line code change with nothing secret in it, and it means confirming
 * Google works needs no extra dashboard step beyond the ones already done —
 * flip this, push, and it appears.
 */
export const ENABLED_OAUTH_PROVIDERS: ("google" | "apple" | "facebook")[] = [];
