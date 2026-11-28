import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { claudeModelSchema, contentProviderSchema, defaultClaudeModel } from "./ai-models";

export const OWNER_EMAIL = "reyeslanzjomaribs@gmail.com";
export type Account = { userId: string; claims?: { email?: unknown } };

let client: SupabaseClient | undefined;

export function credentialsDb() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key)
    throw new Error(
      "AI settings are unavailable. Ask the site administrator to finish the server setup.",
    );
  return (client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch(input, init) {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_secret_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  }));
}

export async function readCredentials(account: Account) {
  const db = credentialsDb();
  const [openai, settings] = await Promise.all([
    db.from("user_ai_keys").select("openai_key").eq("user_id", account.userId).maybeSingle(),
    db
      .from("user_ai_provider_settings")
      .select("anthropic_key,content_provider,claude_model")
      .eq("user_id", account.userId)
      .maybeSingle(),
  ]);
  if (openai.error || settings.error)
    throw new Error("AI settings could not be loaded. Try again or contact support.");
  const owner = String(account.claims?.email ?? "").toLowerCase() === OWNER_EMAIL;
  const savedOpenAI = openai.data?.["openai_key"] as string | undefined;
  return {
    owner,
    hasSavedOpenAI: Boolean(savedOpenAI),
    openaiKey: savedOpenAI || (owner ? process.env["OPENAI_API_KEY"] : undefined),
    anthropicKey: (settings.data?.["anthropic_key"] as string | null | undefined) ?? undefined,
    preference:
      contentProviderSchema.safeParse(settings.data?.["content_provider"]).data ?? "automatic",
    claudeModel:
      claudeModelSchema.safeParse(settings.data?.["claude_model"]).data ?? defaultClaudeModel,
  };
}

export async function saveOpenAI(userId: string, key: string | null) {
  const keys = credentialsDb().from("user_ai_keys");
  const { error } = key
    ? await keys.upsert({ user_id: userId, openai_key: key, updated_at: new Date().toISOString() })
    : await keys.delete().eq("user_id", userId);
  if (error) throw new Error("Could not update your OpenAI key.");
}

export async function updateProviderSettings(
  userId: string,
  patch: {
    anthropic_key?: string | null;
    content_provider?: string;
    claude_model?: string;
  },
) {
  const { error } = await credentialsDb()
    .from("user_ai_provider_settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) throw new Error("Could not update your AI settings.");
}
