// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { claudeModels, defaultClaudeModel } from "@/lib/ai-models";
import {
  createImage,
  generateText,
  selectProvider,
  validateClaudeKey,
} from "@/lib/ai-provider.server";

const defaults = {
  preference: "automatic",
  claudeModel: defaultClaudeModel,
  owner: false,
} as const;
const request = { system: "Return a book chapter.", user: "Write about planning.", json: false };

afterEach(() => vi.unstubAllGlobals());

describe("AI provider routing", () => {
  it("uses OpenAI for writing and visuals with only an OpenAI key", () => {
    const keys = { ...defaults, openaiKey: "openai" };
    expect(selectProvider(keys, "content").provider).toBe("openai");
    expect(selectProvider(keys, "visual").provider).toBe("openai");
  });

  it("prefers Claude for writing in Automatic while keeping OpenAI for art", () => {
    const keys = { ...defaults, anthropicKey: "claude", openaiKey: "openai" };
    expect(selectProvider(keys, "content")).toEqual({
      provider: "anthropic",
      key: "claude",
      model: defaultClaudeModel,
    });
    expect(selectProvider({ ...keys, preference: "openai" }, "content").provider).toBe("openai");
    expect(selectProvider({ ...keys, preference: "anthropic" }, "visual").provider).toBe("openai");
  });

  it("allows text-only Claude and requires an OpenAI key for art", () => {
    const keys = { ...defaults, preference: "anthropic", anthropicKey: "claude" } as const;
    expect(selectProvider(keys, "content").provider).toBe("anthropic");
    expect(() => selectProvider(keys, "visual")).toThrow(/OpenAI API key/);
    expect(() =>
      selectProvider({ ...keys, anthropicKey: undefined, openaiKey: "openai" }, "content"),
    ).toThrow(/Anthropic API key/);
    expect(() => selectProvider(defaults, "content")).toThrow(/API key/);
    expect(() => selectProvider({ ...keys, owner: true }, "visual")).toThrow(/OpenAI API key/);
    expect(selectProvider({ ...defaults, owner: true }, "content").provider).toBe("lovable");
  });

  it.each(claudeModels)(
    "validates model access and sends Messages requests for $id",
    async ({ id }) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ id }))
        .mockResolvedValueOnce(
          Response.json({
            stop_reason: "end_turn",
            content: [{ type: "thinking" }, { type: "text", text: '{"chapters":[]}' }],
          }),
        );
      vi.stubGlobal("fetch", fetchMock);
      await validateClaudeKey("secret", id);
      const result = await generateText(
        { provider: "anthropic", model: id, key: "secret" },
        { ...request, json: true },
      );
      const [lookup, response] = fetchMock.mock.calls;
      expect(lookup?.[0]).toBe("https://api.anthropic.com/v1/models/" + id);
      expect(response?.[0]).toBe("https://api.anthropic.com/v1/messages");
      expect(response?.[1]?.headers).toMatchObject({
        Authorization: "Bearer secret",
        "anthropic-version": "2026-10-21",
      });
      expect(JSON.parse(String(response?.[1]?.body))).toMatchObject({
        model: id,
        system: expect.stringContaining("valid JSON"),
      });
      expect(result).toBe('{"chapters":[]}');
    },
  );

  it("retains OpenAI chat completion and vision endpoints", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ finish_reason: "stop", message: { content: "Chapter prose" } }],
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: [{ b64_json: "cG5n" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const selection = { provider: "openai", key: "openai" } as const;
    expect(await generateText(selection, request)).toBe("Chapter prose");
    expect(
      await createImage(selection, { prompt: "A workbook's example scene", size: "1536x1024" }),
    ).toMatchObject({
      data: [{ b64_json: "cG5n" }],
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.openai.com/v1/chat/completions",
      "https://api.openai.com/v1/images/generations",
    ]);
  });

  it("rejects partial, refused and malformed Claude output", async () => {
    for (const raw of [
      { stop_reason: "max_tokens", content: [{ type: "text", text: "Partial" }] },
      { stop_reason: "refusal", content: [{ type: "text", text: "Refused" }] },
      { stop_reason: "end_turn", content: [{ type: "thinking" }] },
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(raw)));
      await expect(
        generateText({ provider: "anthropic", model: defaultClaudeModel, key: "secret" }, request),
      ).rejects.toThrow(/incomplete/);
    }
  });

  it("explains bad keys and rate limits without leaking the provider response or retrying on another provider", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: { message: "raw-provider-secret" } }, { status: 401 }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "raw-provider-secret" } },
          { status: 429, headers: { "retry-after": "12" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(validateClaudeKey("secret", defaultClaudeModel)).rejects.toThrow(
      /^Anthropic rejected this key/,
    );
    await expect(
      generateText({ provider: "anthropic", model: defaultClaudeModel, key: "secret" }, request),
    ).rejects.toThrow(/Wait 12 seconds/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tries only OpenAI models known to be unavailable and stops after a failed image request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { code: "model_not_found" } }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ error: { code: "internal_error" } }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createImage({ provider: "openai", key: "key" }, { prompt: "Cover", size: "1024x1536" }),
    ).rejects.toThrow(/temporarily unavailable/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes cancellation to the API request", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
        expect(init?.signal?.aborted).toBe(true);
        throw new DOMException("aborted", "AbortError");
      }),
    );
    controller.abort();
    await expect(
      generateText(
        { provider: "anthropic", model: defaultClaudeModel, key: "key" },
        { ...request, signal: controller.signal },
      ),
    ).rejects.toThrow(/cancelled/);
  });
});
