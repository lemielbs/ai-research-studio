import { credentialsDb } from "./ai-credentials.server";
import { ProviderError } from "./ai-provider.server";

export async function reuseGeneration<T>(
  userId: string,
  operation: string,
  input: unknown,
  generate: () => Promise<T>,
): Promise<T> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([operation, input])),
  );
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const requests = credentialsDb().from("ai_generation_requests");
  const lease = crypto.randomUUID();
  const now = new Date();
  const expiration = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

  const cleanup = await requests
    .delete()
    .eq("user_id", userId)
    .lte("expires_at", now.toISOString());
  if (cleanup.error) throw new Error("Generation could not start. Please try again.");
  const reservation = await requests.insert({
    user_id: userId,
    fingerprint,
    lease_id: lease,
    expires_at: expiration(4),
  });
  if (reservation.error) {
    if (reservation.error.code !== "23505")
      throw new Error("Generation could not start. Please try again.");
    const existing = await requests
      .select("result")
      .eq("user_id", userId)
      .eq("fingerprint", fingerprint)
      .maybeSingle();
    if (existing.data?.["result"] != null) return existing.data["result"] as T;
    throw new Error(
      "This generation is already in progress or awaiting confirmation. Wait before trying again.",
    );
  }

  let value: T;
  try {
    value = await generate();
  } catch (error) {
    // A timeout or dropped connection may still have been accepted by the provider.
    if (!(error instanceof ProviderError && error.code === "uncertain"))
      await requests
        .delete()
        .eq("user_id", userId)
        .eq("fingerprint", fingerprint)
        .eq("lease_id", lease);
    throw error;
  }
  const stored = await requests
    .update({ result: value, expires_at: expiration(15) })
    .eq("user_id", userId)
    .eq("fingerprint", fingerprint)
    .eq("lease_id", lease);
  if (stored.error) console.warn("Could not cache completed AI generation.");
  return value;
}
