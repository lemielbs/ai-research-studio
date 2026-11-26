import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { suggestAngles, generateOutline, suggestTopics, suggestTitles, recommendDesign, type Unlocks, type ProductBrief, researchProduct, type ProductResearch } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { marketCountries } from "@/lib/markets";

export const Route = createFileRoute("/_authenticated/new")({
  head: () => ({ meta: [{ title: "New product — Synthforge" }] }),
  component: NewProduct,
});

const TYPES = ["auto", "ebook", "workbook", "checklist", "mini-course"];
const TONES = ["friendly", "professional", "bold", "inspiring"];
type Angle = { title: string; subtitle: string; why: string; promise?: string; unlocks?: Unlocks; brief?: ProductBrief | undefined; productType: string };
type Idea = { topic: string; audience: string; pain: string; worsening: string; unlocks: Unlocks };
const PILLARS = ["", "wealth", "health", "relationships", "hobbies"];

function angleScore(angle: Angle) {
  const scores = angle.unlocks
    ? [angle.unlocks.pain, angle.unlocks.worsening, angle.unlocks.transformation, angle.unlocks.specificity, angle.unlocks.speed]
    : [];
  const sum = scores.reduce((total, value) => total + (Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : 0), 0);
  return sum + (angle.brief ? 51 : 0);
}

function bestAngle(angles: Angle[]) {
  return angles.reduce<Angle | undefined>((best, angle) => !best || angleScore(angle) > angleScore(best) ? angle : best, undefined);
}

function AngleCard({ angle, disabled, recommended = false, onChoose }: {
  angle: Angle;
  disabled: boolean;
  recommended?: boolean;
  onChoose: (angle: Angle) => void;
}) {
  const brief = angle.brief;
  return (
    <article className={recommended ? "rounded-2xl border border-primary/40 bg-card p-5 sm:p-6" : "rounded-xl border bg-card p-4"}>
      <p className="text-xs font-semibold capitalize text-primary">{recommended ? "Recommended · " : ""}{angle.productType}</p>
      <h2 className="mt-1 text-xl font-semibold">{angle.title}</h2>
      {angle.subtitle && <p className="mt-1 text-sm text-muted-foreground">{angle.subtitle}</p>}
      {brief ? (
        <dl className="my-4 grid gap-3 text-sm">
          <div><dt className="font-semibold">Who it helps</dt><dd>{brief.buyer}</dd></div>
          <div><dt className="font-semibold">Problem it solves</dt><dd>{brief.pain}</dd></div>
          <div><dt className="font-semibold">What readers finish with</dt><dd>{brief.pointB} ({brief.timeframe})</dd></div>
        </dl>
      ) : angle.promise && <p className="my-4 text-sm">{angle.promise}</p>}
      <Button className="mt-2" variant={recommended ? "default" : "outline"} disabled={disabled} onClick={() => onChoose(angle)}>Use this idea</Button>
    </article>
  );
}

type OL = { title: string; summary: string };

function Chips({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o || "any"} type="button" aria-pressed={value === o} onClick={() => onChange(o)}
          className={`rounded-full border px-4 py-1.5 text-sm capitalize transition ${value === o ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"}`}>
          {o === "auto" ? "Auto-detect" : o || "Any topic"}
        </button>
      ))}
    </div>
  );
}

function NewProduct() {
  const navigate = useNavigate();
  const researchFn = useServerFn(researchProduct);
  const anglesFn = useServerFn(suggestAngles);
  const outlineFn = useServerFn(generateOutline);
  const topicsFn = useServerFn(suggestTopics);
  const titlesFn = useServerFn(suggestTitles);
  const designFn = useServerFn(recommendDesign);
  const [pillar, setPillar] = useState("");
  const [country, setCountry] = useState("");
  const marketCountry = country || undefined;
  const [angleResearch, setAngleResearch] = useState<ProductResearch | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [titleOpts, setTitleOpts] = useState<{ title: string; subtitle: string }[]>([]);
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState<"ideas" | "titles" | "angles" | "outline" | "create" | "automatic" | null>(null);
  const busy = pending !== null;
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [type, setType] = useState("auto");
  const [tone, setTone] = useState("friendly");
  const [count, setCount] = useState(6);
  const [angles, setAngles] = useState<Angle[]>([]);
  const [picked, setPicked] = useState<Angle | null>(null);
  const [outline, setOutline] = useState<OL[]>([]);

  useEffect(() => { if (step > 1) stepHeading.current?.focus(); }, [step]);

  const run = async <T,>(action: NonNullable<typeof pending>, fn: () => Promise<T>): Promise<T | undefined> => {
    setPending(action);
    try { return await fn(); } catch (e) { toast.error((e as Error).message); } finally { setPending(null); }
    return undefined;
  };

  const researchMarket = (query: string) => researchFn({ data: {
    topic: query.slice(0, 300), audience, marketCountry,
  } }).catch(() => null);

  const getIdeas = () => run("ideas", async () => {
    const research = marketCountry
      ? await researchMarket(`Digital product ideas for ${pillar || "health, wealth, relationships and practical hobbies"}${topic.trim() ? ": " + topic.trim() : ""}`)
      : null;
    if (marketCountry && !research) toast.info("Local web research was unavailable. These ideas are starting points to validate.");
    const r = await topicsFn({ data: { pillar, hint: topic, marketCountry, demandResearch: research?.demand } });
    setIdeas(r.ideas);
  });

  const getTitles = () => run("titles", async () => {
    if (!picked) return;
    const r = await titlesFn({
      data: {
        topic: topic.trim(),
        audience: picked.brief?.buyer ?? audience,
        marketCountry,
        current: picked.title,
        subtitle: picked.subtitle,
        promise: picked.promise || undefined,
        brief: picked.brief,
        outline: outline.map(({ title, summary }) => title + ": " + summary).join("\n").slice(0, 4000),
      },
    });
    setTitleOpts(r.titles);
  });

  const loadAngles = async (research?: ProductResearch | null) => {
    const result = await anglesFn({ data: { topic: topic.trim(), audience, productType: type, marketCountry, demandResearch: research?.demand } });
    if (!result.angles.length) throw new Error("No product ideas came back. Try a more specific topic.");
    return result.angles;
  };

  const buildOutline = async (angle: Angle, research?: ProductResearch | null) => {
    const result = await outlineFn({ data: {
      title: angle.title, subtitle: angle.subtitle, topic: topic.trim(),
      audience: angle.brief?.buyer ?? audience, productType: angle.productType,
      marketCountry,
      tone, chapters: count, brief: angle.brief, factualResearch: research?.facts,
    } });
    return result.chapters;
  };

  const saveDraft = async (angle: Angle, chapters: OL[], research?: ProductResearch | null) => {
    const chapterRows = chapters.filter((chapter) => chapter.title.trim());
    if (!chapterRows.length) throw new Error("The draft needs at least one chapter.");
    const buyer = angle.brief?.buyer ?? audience;
    const design = await designFn({ data: { title: angle.title, subtitle: angle.subtitle.slice(0, 300), promise: (angle.promise ?? "").slice(0, 400), topic: topic.trim(), audience: buyer, tone, marketCountry } })
      .catch(() => ({ theme: "minimal", reason: "", coverLayout: "split" as const }));
    const { data: product, error } = await supabase.from("products").insert({
      title: angle.title, subtitle: angle.subtitle, topic: topic.trim(), audience: buyer,
      product_type: angle.productType, tone, status: "outline", promise: angle.promise ?? null,
      unlocks: angle.unlocks ?? null, design: { theme: design.theme, reason: design.reason, ...("coverLayout" in design && design.coverLayout ? { coverLayout: design.coverLayout } : {}), brief: angle.brief ?? null, ...(marketCountry ? { marketCountry } : {}), ...(research !== undefined ? { research } : {}) },
    }).select("id").single();
    if (error) throw error;
    const { error: chapterError } = await supabase.from("chapters").insert(
      chapterRows.map((chapter, position) => ({ product_id: product.id, position, title: chapter.title, summary: chapter.summary })),
    );
    if (chapterError) {
      const { error: cleanupError } = await supabase.from("products").delete().eq("id", product.id);
      if (cleanupError) throw new Error(chapterError.message + " An empty draft may appear in My products.");
      throw chapterError;
    }
    await navigate({ to: "/products/$id", params: { id: product.id }, search: { autowrite: true } });
  };

  const getAngles = () => run("angles", async () => {
    const research = marketCountry ? await researchMarket(topic.trim()) : null;
    if (marketCountry && !research) toast.info("Local web research was unavailable. These ideas are starting points to validate.");
    setAngles(await loadAngles(research));
    setAngleResearch(research);
    setStep(2);
  });

  const getOutline = (angle: Angle) => run("outline", async () => {
    const chapters = await buildOutline(angle, angleResearch);
    setPicked(angle);
    setOutline(chapters);
    setTitleOpts([]);
    setStep(3);
  });

  const autoCreate = () => run("automatic", async () => {
    const research = await researchMarket(topic.trim());
    if (marketCountry && !research) toast.info("Local web research was unavailable. Review local facts before publishing.");
    const ideas = await loadAngles(research);
    const angle = bestAngle(ideas);
    if (!angle) throw new Error("No product idea was available.");
    await saveDraft(angle, await buildOutline(angle, research), research);
  });

  const create = () => run("create", async () => {
    if (picked?.title.trim()) await saveDraft({ ...picked, title: picked.title.trim(), subtitle: picked.subtitle.trim() }, outline, angleResearch);
  });

  const recommended = bestAngle(angles);
  const alternatives = angles.filter((a) => a !== recommended);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex gap-2 text-xs uppercase tracking-widest">
        {["Idea", "Angle", "Outline"].map((s, i) => (
          <span key={s} className={step >= i + 1 ? "text-primary" : "text-muted-foreground"}>{i + 1}. {s}{i < 2 && " —"}</span>
        ))}
      </div>

      {step === 1 && (
        <form className="space-y-5 rounded-2xl border bg-card p-5 sm:p-8" onSubmit={(event) => {
          event.preventDefault();
          if (!busy && topic.trim().length >= 2) void autoCreate();
        }}>
          <div className="space-y-2">
            <Label htmlFor="product-topic" className="text-2xl font-bold sm:text-3xl">What do you want to make?</Label>
            <p id="topic-help" className="text-sm text-muted-foreground">Enter a topic and Synthforge will pick the format, plan the outline, and write your draft.</p>
            <Input id="product-topic" disabled={busy} aria-describedby="topic-help" placeholder="e.g. A first-paycheck budget for new graduates" maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-market">Target country</Label>
            <select id="product-market" value={country} disabled={busy} aria-describedby="market-help"
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              onChange={(event) => {
                setCountry(event.currentTarget.value);
                setIdeas([]);
                setAngles([]);
                setAngleResearch(null);
              }}>
              <option value="">Global audience</option>
              {marketCountries.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
            </select>
            <p id="market-help" className="text-sm text-muted-foreground">Focus research, ideas, and book content on readers in this country.</p>
          </div>
          <Button type="submit" size="lg" disabled={busy || topic.trim().length < 2}>
            {pending === "automatic" ? "Planning your draft…" : "Create my draft"}
          </Button>
          {pending === "automatic" && <p role="status" className="text-sm text-muted-foreground">Researching the topic and planning the outline. Writing starts automatically after that.</p>}

          <details className="rounded-xl border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Need an idea?</summary>
            <div className="mt-3 space-y-3">
              <Chips value={pillar} options={PILLARS} onChange={setPillar} />
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={getIdeas}>
                {pending === "ideas" ? "Thinking…" : "Suggest ideas for me"}
              </Button>
              {ideas.length > 0 && (
                <div className="space-y-2">
                  {ideas.map((idea) => (
                    <button key={idea.topic} type="button" disabled={busy} onClick={() => {
                      setTopic(idea.topic.slice(0, 300));
                      setAudience(idea.audience.slice(0, 300));
                      setIdeas([]);
                      document.getElementById("product-topic")?.focus();
                    }} className="block w-full rounded-lg border bg-background p-3 text-left text-sm hover:border-primary">
                      <span className="block font-semibold">{idea.topic}</span>
                      <span className="block text-muted-foreground">For {idea.audience}</span>
                      <span className="mt-1 block">{idea.pain}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </details>
          <details className="rounded-xl border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Options</summary>
            <fieldset disabled={busy} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product-audience">Who is it for?</Label>
                <Input id="product-audience" placeholder="e.g. Recent U.S. graduates" maxLength={300} value={audience} onChange={(e) => setAudience(e.target.value)} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Format</p>
                <Chips value={type} options={TYPES} onChange={setType} />
                {type === "mini-course" && <p className="text-sm text-muted-foreground">Teach a skill with short lessons, practice, and an explained answer key.</p>}
                {type === "workbook" && <p className="text-sm text-muted-foreground">Help readers complete their own plan with fillable worksheets.</p>}
              </div>
              <div className="space-y-2"><p className="text-sm font-medium">Tone</p><Chips value={tone} options={TONES} onChange={setTone} /></div>
              <div className="space-y-2">
                <Label htmlFor="chapter-count">{type === "mini-course" ? "Lessons" : "Chapters"} ({count})</Label>
                <input id="chapter-count" type="range" min={3} max={12} value={count} onChange={(e) => setCount(+e.target.value)} className="w-full accent-primary" />
              </div>
            </fieldset>
            <Button className="mt-4" type="button" variant="outline" disabled={busy || topic.trim().length < 2} onClick={getAngles}>
              {pending === "angles" ? "Finding ideas…" : "Choose an idea and outline myself"}
            </Button>
          </details>
        </form>
      )}

      {step === 2 && recommended && (
        <section className="space-y-4" aria-labelledby="choose-product">
          <h1 id="choose-product" ref={stepHeading} tabIndex={-1} className="text-3xl font-bold">Choose a product idea</h1>
          <AngleCard angle={recommended} disabled={busy} recommended onChoose={getOutline} />
          {alternatives.length > 0 && (
            <details className="rounded-xl border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">See other ideas ({alternatives.length})</summary>
              <div className="mt-3 space-y-3">
                {alternatives.map((angle) => <AngleCard key={angle.title} angle={angle} disabled={busy} onChoose={getOutline} />)}
              </div>
            </details>
          )}
          {pending === "outline" && <p role="status" className="text-sm text-muted-foreground">Building your outline…</p>}
          <Button variant="ghost" disabled={busy} onClick={() => setStep(1)}>Back to topic</Button>
        </section>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{picked?.productType}</p>
          <h1 ref={stepHeading} tabIndex={-1} className="text-3xl font-bold">{picked?.title}</h1>
          {picked && (
            <div className="grid gap-3">
              <label className="text-sm font-medium">Title<Input required maxLength={200} disabled={busy} value={picked.title} onChange={(e) => setPicked({ ...picked, title: e.target.value })} /></label>
              <label className="text-sm font-medium">Subtitle<Input maxLength={300} disabled={busy} value={picked.subtitle} onChange={(e) => setPicked({ ...picked, subtitle: e.target.value })} /></label>
            </div>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={getTitles}>{busy ? "…" : "Rewrite title"}</Button>
          {titleOpts.length > 0 && (
            <div className="space-y-2">
              {titleOpts.map((o) => (
                <button key={o.title} type="button" onClick={() => { setPicked(picked ? { ...picked, ...o } : picked); setTitleOpts([]); }}
                  className="block w-full rounded-lg border bg-card p-3 text-left hover:border-primary">
                  <div className="font-semibold">{o.title}</div><div className="text-sm text-muted-foreground">{o.subtitle}</div>
                </button>
              ))}
            </div>
          )}
          <p className="text-muted-foreground">Edit the outline, then let AI write every chapter.</p>
          {outline.map((c, i) => (
            <div key={i} className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex gap-2">
                <span className="pt-2 font-display text-primary">{i + 1}</span>
                <Input value={c.title} onChange={(e) => setOutline(outline.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                <Button variant="ghost" size="sm" onClick={() => setOutline(outline.filter((_, j) => j !== i))}>✕</Button>
              </div>
              <Textarea rows={2} value={c.summary} onChange={(e) => setOutline(outline.map((x, j) => j === i ? { ...x, summary: e.target.value } : x))} />
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOutline([...outline, { title: "New chapter", summary: "" }])}>+ Add chapter</Button>
            <Button className="shadow-glow" disabled={busy || !picked?.title.trim() || !outline.some((chapter) => chapter.title.trim())} onClick={create}>{busy ? "Saving…" : "Write my product →"}</Button>
          </div>
        </div>
      )}
    </main>
  );
}
