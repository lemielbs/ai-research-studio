// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateOutline, planImages, writeChapter, generateCover } from "@/lib/ai.functions";
import { checkPdf } from "@/lib/pdf";
import { mdToHtml } from "@/lib/markdown";

const userId = "0d1b62db-0c39-417d-9916-e04abe4f7585";
const productId = "0a582a80-b4e5-42ed-9d37-3a93ef8b9d1b";
const chapterId = "33f52f80-272f-45a3-b1ce-cc6f9b7fe81d";
const fixture = [
  "Identify a week’s bills and put them in order.",
  "| Bill | Due |\n| --- | --- |\n| Internet | Friday |",
  "## Worksheet: My plan\n\n> Instructions: Record your next due date.\n\n> Field: Next payday",
].join("\n\n");

const { loadKeys, ctx } = vi.hoisted(() => ({
  loadKeys: vi.fn(),
  ctx: { userId: "", supabase: { from: vi.fn() } },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (data: unknown) => data;
    const builder = {
      middleware: () => builder,
      inputValidator: (validate: typeof parse) => {
        parse = validate;
        return builder;
      },
      handler:
        (handler: (args: { data: unknown; context: typeof ctx }) => unknown) =>
        ({ data }: { data: unknown }) =>
          handler({ data: parse(data), context: ctx }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"),
}));
vi.mock("@/lib/ai-credentials.server", () => ({ readCredentials: loadKeys }));
vi.mock("@/lib/ai-generation.server", () => ({
  reuseGeneration: (_id: string, _operation: string, _input: unknown, fn: () => unknown) => fn(),
}));

function claude(text: string) {
  return Response.json({ stop_reason: "end_turn", content: [{ type: "text", text }] });
}

function openAI(content: string) {
  return Response.json({ choices: [{ finish_reason: "stop", message: { content } }] });
}

const writingInput = {
  productTitle: "Payday planner",
  chapterId,
  chapterTitle: "Make a schedule",
  productType: "workbook",
  audience: "new graduates",
  tone: "friendly",
  summary: "Create an actionable bill schedule",
  outline: "Make a schedule",
};

beforeEach(() => {
  ctx.userId = userId;
  loadKeys.mockReset().mockResolvedValue({
    preference: "automatic",
    claudeModel: "claude-sonnet-5-5",
    openaiKey: "openai-test-key",
    anthropicKey: "claude-test-key",
    owner: false,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Manuscript integration", () => {
  it("renders a Claude chapter alongside legacy OpenAI content and exports an edited fillable workbook", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(claude(fixture))
      .mockResolvedValueOnce(openAI(fixture));
    vi.stubGlobal("fetch", fetchMock);
    const written = await writeChapter({ data: writingInput });
    loadKeys.mockResolvedValueOnce({
      preference: "openai",
      openaiKey: "openai-test-key",
      owner: false,
    });
    const legacy = await writeChapter({ data: writingInput });
    expect(written).toEqual(legacy);
    const edited = written.content.replace("Internet", "Utilities");
    expect(mdToHtml(edited)).toContain("<table");
    const result = await checkPdf({ title: "Payday planner", productType: "workbook" }, [
      { title: "Make a schedule", content: edited },
      { title: "Review bills", content: "Keep the existing chapter intact." },
    ]);
    expect(result.doc.output()).toContain("/Subtype /Widget");
    expect(result.doc.output()).toContain("Utilities");
    expect(result.doc.output()).toContain("Keep the existing chapter intact.");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.anthropic.com/v1/messages",
      "https://api.openai.com/v1/chat/completions",
    ]);
  });

  it("validates the outline before the editor can persist any rows", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(claude('{"chapters":[{"title":"Missing summary"}]}'));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateOutline({
        data: {
          title: "Payday planner",
          topic: "Budget",
          subtitle: "",
          productType: "workbook",
          audience: "",
          tone: "friendly",
          chapters: 3,
        },
      }),
    ).rejects.toThrow(/incomplete structured content/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("plans and generates artwork with OpenAI from Claude-written excerpts", async () => {
    const manuscript = "The lesson explains how to use a paper calendar during a shift break.";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        openAI(
          JSON.stringify({
            images: [
              { id: chapterId, prompt: "A simple paper calendar", featuresCharacter: false },
              { id: chapterId, prompt: "Duplicate", featuresCharacter: false },
              { id: "unknown", prompt: "Unrequested", featuresCharacter: false },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        openAI('{"layout":"band","concept":"A paper calendar beside a lunch bag"}'),
      )
      .mockResolvedValueOnce(Response.json({ data: [{ b64_json: "dGVzdA==" }] }));
    vi.stubGlobal("fetch", fetchMock);
    ctx.supabase.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () =>
          table === "products"
            ? { maybeSingle: async () => ({ data: { id: productId }, error: null }) }
            : {
                order: () => ({
                  limit: async () => ({
                    data: [{ title: "Lesson", summary: "", content: manuscript }],
                    error: null,
                  }),
                }),
              },
      }),
    }));
    const plan = await planImages({
      data: {
        title: "Payday planner",
        audience: "shift workers",
        chapters: [
          { id: chapterId, title: "Lesson", summary: "", excerpt: manuscript, pageId: "chapter-1" },
        ],
      },
    });
    expect(plan.images).toHaveLength(1);
    const cover = await generateCover({
      data: { productId, title: "Payday planner", topic: "Budgets", mode: "complete" },
    });
    expect(cover.dataUrl).toBe("data:image/png;base64,dGVzdA==");
    for (const call of fetchMock.mock.calls.slice(0, 2)) {
      expect(call[0]).toBe("https://api.openai.com/v1/chat/completions");
      expect(String(call[1]?.body)).toContain(manuscript);
    }
    expect(String(fetchMock.mock.calls[2]?.[1]?.body)).toContain(
      "paper calendar beside a lunch bag",
    );
  });
});
