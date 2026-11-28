import { getRequest } from "@tanstack/react-start/server";
import { readCredentials, type Account } from "./ai-credentials.server";
import { createImage, generateText, openAIRequest, selectProvider } from "./ai-provider.server";
import { reuseGeneration } from "./ai-generation.server";

export async function ask(
  account: Account,
  system: string,
  user: string,
  json = false,
  purpose: "content" | "visual" = "content",
) {
  const selection = selectProvider(await readCredentials(account), purpose);
  return generateText(selection, { system, user, json, signal: getRequest().signal });
}

export async function reserve<T>(
  account: Account,
  operation: string,
  input: unknown,
  purpose: "content" | "visual",
  generate: (
    askSelected: (system: string, user: string, json?: boolean) => Promise<string>,
  ) => Promise<T>,
) {
  const selection = selectProvider(await readCredentials(account), purpose);
  return reuseGeneration(
    account.userId,
    operation,
    {
      provider: selection.provider,
      model: selection.provider === "anthropic" ? selection.model : null,
      input,
    },
    () =>
      generate((system, user, json = false) =>
        generateText(selection, { system, user, json, signal: getRequest().signal }),
      ),
  );
}

export async function generateImage(
  account: Account,
  opts: {
    prompt: string;
    size: "1536x1024" | "1024x1536";
    referenceImage?: string | undefined;
    requestId?: string | undefined;
    subjectId: string;
  },
) {
  const selection = selectProvider(await readCredentials(account), "visual");
  if (selection.provider === "anthropic")
    throw new Error("An OpenAI key is required for illustrations.");
  return reuseGeneration(account.userId, "artwork", { provider: selection.provider, ...opts }, () =>
    createImage(selection, { ...opts, signal: getRequest().signal }),
  );
}

export async function provider(account: Account) {
  const credentials = await readCredentials(account);
  return { key: credentials.openaiKey };
}

export async function openai(key: string | undefined, path: string, body: unknown) {
  if (!key) throw new Error("Add an OpenAI API key in Settings to use web research.");
  return openAIRequest(path, key, body, getRequest().signal);
}
