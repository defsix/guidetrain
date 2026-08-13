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
 * A service-role key here would be a serious mistake shipped to every visitor,
 * so it is worth one cheap check rather than trusting the variable name. The
 * role is a claim inside the JWT; anon keys carry `"role":"anon"`.
 */
function looksLikeServiceRole(key: string): boolean {
  try {
    const payload = JSON.parse(atob(key.split(".")[1]));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

let client: SupabaseClient | null = null;

if (url && anonKey) {
  if (looksLikeServiceRole(anonKey)) {
    // Refusing is the only safe response. Connecting would hand every visitor
    // a key that reads and writes every row of every account.
    console.error(
      "VITE_SUPABASE_ANON_KEY is a service-role key. Refusing to connect — " +
        "that key bypasses row-level security and must never reach a browser.",
    );
  } else {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The app is hash-routed, and a magic link or OAuth redirect comes back
        // with its tokens in the fragment, which is where the route also lives.
        detectSessionInUrl: true,
      },
    });
  }
}

export const supabase = client;

/** Whether accounts are available at all. False is a normal, working state. */
export const hasBackend = client !== null;
