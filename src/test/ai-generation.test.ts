// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reuseGeneration } from "@/lib/ai-generation.server";
import { ProviderError } from "@/lib/ai-provider.server";

type Row = {
  user_id: string;
  fingerprint: string;
  lease_id: string;
  expires_at: string;
  result?: unknown;
};

const { rows } = vi.hoisted(() => ({ rows: [] as Row[] }));
vi.mock("@/lib/ai-credentials.server", () => ({
  credentialsDb: () => ({
    from: () => {
      const conditions: ((row: Row) => boolean)[] = [];
      let command: "delete" | "update" = "delete";
      let patch: Partial<Row> = {};
      const chain = {
        eq(key: keyof Row, value: string) {
          conditions.push((row) => row[key] === value);
          return chain;
        },
        lte(key: "expires_at", value: string) {
          conditions.push((row) => row[key] <= value);
          return chain;
        },
        delete() {
          conditions.length = 0;
          command = "delete";
          return chain;
        },
        update(values: Partial<Row>) {
          conditions.length = 0;
          command = "update";
          patch = values;
          return chain;
        },
        select() {
          conditions.length = 0;
          return chain;
        },
        async insert(row: Row) {
          if (
            rows.some(
              (item) => item.user_id === row.user_id && item.fingerprint === row.fingerprint,
            )
          )
            return { error: { code: "23505" } };
          rows.push(row);
          return { error: null };
        },
        async maybeSingle() {
          return { data: rows.find((row) => conditions.every((test) => test(row))) };
        },
        then(resolve: (response: { error: null }) => unknown) {
          for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i]!;
            if (!conditions.every((test) => test(row))) continue;
            if (command === "update") Object.assign(row, patch);
            else rows.splice(i, 1);
          }
          return Promise.resolve(resolve({ error: null }));
        },
      };
      return chain;
    },
  }),
}));

beforeEach(() => {
  rows.length = 0;
});

describe("Generation reservations", () => {
  it("stops duplicate paid work and reuses a completed response after an interrupted save", async () => {
    let complete!: (content: string) => void;
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const generate = vi.fn(() => {
      started();
      return new Promise<string>((resolve) => {
        complete = resolve;
      });
    });
    const first = reuseGeneration("owner", "chapter", { id: "chapter-1" }, generate);
    await running;
    await expect(
      reuseGeneration("owner", "chapter", { id: "chapter-1" }, generate),
    ).rejects.toThrow(/already in progress/);
    complete("Saved manuscript");
    await expect(first).resolves.toBe("Saved manuscript");
    await expect(reuseGeneration("owner", "chapter", { id: "chapter-1" }, generate)).resolves.toBe(
      "Saved manuscript",
    );
    expect(generate).toHaveBeenCalledOnce();
    await expect(
      reuseGeneration("teammate", "chapter", { id: "chapter-1" }, async () => "Another draft"),
    ).resolves.toBe("Another draft");
  });

  it("allows a retry after a confirmed failure but holds the reservation on an uncertain charge", async () => {
    const run = (fn: () => Promise<string>) =>
      reuseGeneration("owner", "image", { chapter: "chapter-1" }, fn);
    await expect(
      run(async () => {
        throw new ProviderError("Rate limited");
      }),
    ).rejects.toThrow("Rate limited");
    await expect(
      run(async () => {
        throw new ProviderError("Timed out", "uncertain");
      }),
    ).rejects.toThrow("Timed out");
    const retry = vi.fn(async () => "Image");
    await expect(run(retry)).rejects.toThrow(/awaiting confirmation/);
    expect(retry).not.toHaveBeenCalled();
    rows[0]!.expires_at = new Date(0).toISOString();
    await expect(run(retry)).resolves.toBe("Image");
  });
});
