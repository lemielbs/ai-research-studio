import { z } from "zod";
import { generateChatCompletion, generateImage, editImage } from "@lovable.dev/ai-gateway";
import type { ClaudeModel, ContentProvider } from "./ai-models";

const version = "2026-10-21";
const openAIImageModels = [
  "gpt-image-2.5-flare",
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1-mini",
];
type Keys = {
  preference: ContentProvider;
  claudeModel: ClaudeModel;
  anthropicKey?: string | undefined;
  openaiKey?: string | undefined;
  owner: boolean;
};
type Selection =
  | { provider: "anthropic"; key: string; model: ClaudeModel }
  | { provider: "openai"; key: string }
  | { provider: "lovable" };

export function selectProvider(keys: Keys, purpose: "content" | "visual"): Selection {
  const usesClaude =
    keys.preference === "anthropic" ||
    (keys.preference === "automatic" && Boolean(keys.anthropicKey));
  if (purpose === "content" && usesClaude) {
    if (!keys.anthropicKey)
      throw new Error("Connect an Anthropic API key or select OpenAI in Settings.");
    return { provider: "anthropic", key: keys.anthropicKey, model: keys.claudeModel };
  }
  if (keys.openaiKey) return { provider: "openai", key: keys.openaiKey };
  if (keys.owner && !usesClaude && keys.preference !== "openai") return { provider: "lovable" };
  throw new Error(
    purpose === "visual"
      ? "Add an OpenAI API key in Settings for visual design, covers, and illustrations."
      : "Add an OpenAI API key in Settings, or connect an Anthropic key and choose Automatic or Claude.",
  );
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: "model" | "uncertain" | "other" = "other",
  ) {
    super(message);
  }
}

async function apiRequest(
  provider: "OpenAI" | "Anthropic",
  path: string,
  key: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const anthropic = provider === "Anthropic";
  const multipart = body instanceof FormData;
  const timeout = AbortSignal.timeout(90_000);
  const requestSignal = signal ? AbortSignal.any([timeout, signal]) : timeout;
  let response: Response;
  try {
    response = await fetch(`https://api.${anthropic ? "anthropic" : "openai"}.com/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(anthropic ? { "anthropic-version": version } : {}),
        ...(body !== undefined && !multipart ? { "Content-Type": "application/json" } : {}),
      },
      ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
      signal: requestSignal,
      redirect: "error",
    });
  } catch {
    throw new ProviderError(
      signal?.aborted
        ? `${provider} request cancelled.`
        : `${provider} did not confirm the request. Wait a few minutes before retrying.`,
      "uncertain",
    );
  }
  if (!response.ok) {
    const errorCode = await response.json().then(
      (value) => value?.error?.code ?? value?.error?.type,
      () => null,
    );
    const seconds = Number(response.headers.get("retry-after"));
    if (response.status === 401 || response.status === 403)
      throw new ProviderError(
        `${provider} rejected this key or its permissions. Check the API key in Settings.`,
      );
    if (response.status === 402 || errorCode === "insufficient_quota")
      throw new ProviderError(`${provider} has insufficient API credit. Check your API billing.`);
    if (response.status === 429)
      throw new ProviderError(
        `${provider} rate limit reached. ${seconds > 0 && Number.isFinite(seconds) ? `Wait ${Math.ceil(seconds)} seconds, then retry.` : "Wait a moment, then retry."}`,
      );
    if (response.status === 404 || errorCode === "model_not_found")
      throw new ProviderError(
        `${provider} could not access the selected model. Check model access in Settings.`,
        "model",
      );
    if (response.status >= 500)
      throw new ProviderError(
        `${provider} is temporarily unavailable. Wait a few minutes before retrying.`,
        "uncertain",
      );
    throw new ProviderError(
      `${provider} rejected the request. Review your API access and try again.`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderError(`${provider} returned an unreadable response. Try again.`);
  }
}

export const openAIRequest = (path: string, key: string, body?: unknown, signal?: AbortSignal) =>
  apiRequest("OpenAI", path, key, body, signal);

export async function validateClaudeKey(key: string, model: ClaudeModel, signal?: AbortSignal) {
  const response = await apiRequest("Anthropic", `models/${model}`, key, undefined, signal);
  if (response?.id !== model)
    throw new ProviderError("Anthropic did not confirm access to this model.");
}

const claudeMessage = z.object({
  stop_reason: z.enum(["end_turn", "stop_sequence"]),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});
const openAIMessage = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({ content: z.string().trim().min(1) }),
      }),
    )
    .nonempty(),
});

export async function generateText(
  selection: Selection,
  options: {
    system: string;
    user: string;
    json: boolean;
    signal?: AbortSignal;
  },
) {
  const { system, user, json, signal } = options;
  if (selection.provider === "anthropic") {
    const raw = await apiRequest(
      "Anthropic",
      "messages",
      selection.key,
      {
        model: selection.model,
        max_tokens: 8192,
        system: json
          ? `${system}\nReturn a single valid JSON object with no surrounding prose or code fences.`
          : system,
        messages: [{ role: "user", content: user }],
      },
      signal,
    );
    const reply = claudeMessage.safeParse(raw);
    const text = reply.data?.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!text)
      throw new ProviderError(
        "Claude returned incomplete content. Try again or change the model in Settings.",
      );
    return text;
  }
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
  const format = json ? { response_format: { type: "json_object" as const } } : {};
  let raw: unknown;
  if (selection.provider === "lovable") {
    signal?.throwIfAborted();
    try {
      raw = await generateChatCompletion({ model: "openai/gpt-6-astra", messages, ...format });
    } catch {
      throw new ProviderError(
        "Lovable AI could not complete the request. Check your credits or choose an API key in Settings.",
        "uncertain",
      );
    }
  } else {
    raw = await openAIRequest(
      "chat/completions",
      selection.key,
      { model: "gpt-4o-mini", messages, ...format },
      signal,
    );
  }
  const choice = openAIMessage.safeParse(raw).data?.choices[0];
  if (!choice || choice.finish_reason === "length" || choice.finish_reason === "content_filter")
    throw new ProviderError("OpenAI returned incomplete content. Try again.");
  return choice.message.content;
}

export const imageReferencePattern =
  /^data:(image[/](?:png|jpeg|webp));base64,([a-z0-9+/]+={0,2})$/i;
const artwork = z.object({ data: z.array(z.object({ b64_json: z.string().min(1) })).nonempty() });

export async function createImage(
  selection: Exclude<Selection, { provider: "anthropic" }>,
  opts: {
    prompt: string;
    size: "1536x1024" | "1024x1536";
    referenceImage?: string | undefined;
    signal?: AbortSignal;
  },
) {
  const reference = opts.referenceImage?.match(imageReferencePattern);
  const mediaType = reference?.[1];
  const image =
    mediaType && reference?.[2]
      ? new File(
          [Uint8Array.from(atob(reference[2]), (byte) => byte.charCodeAt(0))],
          "reference." + mediaType.split("/")[1],
          { type: mediaType },
        )
      : undefined;
  const options = {
    prompt: opts.prompt,
    size: opts.size,
    quality: "low",
    output_format: "png",
  } as const;
  let raw: unknown;
  if (selection.provider === "lovable") {
    opts.signal?.throwIfAborted();
    try {
      raw = image
        ? await editImage({ model: "openai/gpt-image-2", image, ...options })
        : await generateImage({ model: "openai/gpt-image-2.5-sunburst", ...options });
    } catch {
      throw new ProviderError(
        "Lovable AI could not generate the image. Check your credits or add an OpenAI key in Settings.",
        "uncertain",
      );
    }
  } else {
    for (const model of openAIImageModels) {
      try {
        if (image) {
          const form = new FormData();
          form.append("image", image);
          for (const [key, value] of Object.entries({ model, ...options })) form.append(key, value);
          if (model === "gpt-image-1.5") form.append("input_fidelity", "high");
          raw = await openAIRequest("images/edits", selection.key, form, opts.signal);
        } else {
          raw = await openAIRequest(
            "images/generations",
            selection.key,
            { model, ...options, n: 1 },
            opts.signal,
          );
        }
        break;
      } catch (error) {
        // Only try another OpenAI model when the previous model was unavailable.
        if (
          !(error instanceof ProviderError) ||
          error.code !== "model" ||
          model === openAIImageModels.at(-1)
        )
          throw error;
      }
    }
  }
  const result = artwork.safeParse(raw).data;
  if (!result)
    throw new ProviderError("OpenAI returned no usable artwork. Try again or upload an image.");
  return result;
}
