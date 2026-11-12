import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { suggestAngles, generateOutline } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/new")({
  head: () => ({ meta: [{ title: "New product — Synthforge" }] }),
  component: NewProduct,
});

const TYPES = ["ebook", "workbook", "checklist", "mini-course"];
const TONES = ["friendly", "professional", "bold", "inspiring"];
type Angle = { title: string; subtitle: string; why: string };
type OL = { title: string; summary: string };

function Chips({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`rounded-full border px-4 py-1.5 text-sm capitalize transition ${value === o ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

function NewProduct() {
  const navigate = useNavigate();
  const anglesFn = useServerFn(suggestAngles);
  const outlineFn = useServerFn(generateOutline);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [type, setType] = useState("ebook");
  const [tone, setTone] = useState("friendly");
  const [count, setCount] = useState(6);
  const [angles, setAngles] = useState<Angle[]>([]);
  const [picked, setPicked] = useState<Angle | null>(null);
  const [outline, setOutline] = useState<OL[]>([]);

  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try { return await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
    return undefined;
  };

  const getAngles = () => run(async () => {
    const r = await anglesFn({ data: { topic, audience, productType: type } });
    setAngles(r.angles); setStep(2);
  });

  const getOutline = (a: Angle) => run(async () => {
    setPicked(a);
    const r = await outlineFn({ data: { title: a.title, subtitle: a.subtitle, topic, audience, productType: type, tone, chapters: count } });
    setOutline(r.chapters); setStep(3);
  });

  const create = () => run(async () => {
    if (!picked) return;
    const { data: p, error } = await supabase.from("products").insert({
      title: picked.title, subtitle: picked.subtitle, topic, audience, product_type: type, tone, status: "outline",
    }).select("id").single();
    if (error) throw error;
    const { error: e2 } = await supabase.from("chapters").insert(
      outline.filter((c) => c.title.trim()).map((c, i) => ({ product_id: p.id, position: i, title: c.title, summary: c.summary })),
    );
    if (e2) throw e2;
    navigate({ to: "/products/$id", params: { id: p.id }, search: { autowrite: true } });
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex gap-2 text-xs uppercase tracking-widest">
        {["Idea", "Angle", "Outline"].map((s, i) => (
          <span key={s} className={step >= i + 1 ? "text-primary" : "text-muted-foreground"}>{i + 1}. {s}{i < 2 && " —"}</span>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6 rounded-2xl border bg-card p-8">
          <h1 className="text-3xl font-bold">What do you want to build?</h1>
          <div className="space-y-2"><Label>Topic</Label><Input placeholder="e.g. meal prep for busy nurses" value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
          <div className="space-y-2"><Label>Who is it for?</Label><Input placeholder="e.g. shift-working healthcare workers" value={audience} onChange={(e) => setAudience(e.target.value)} /></div>
          <div className="space-y-2"><Label>Product type</Label><Chips value={type} options={TYPES} onChange={setType} /></div>
          <div className="space-y-2"><Label>Tone</Label><Chips value={tone} options={TONES} onChange={setTone} /></div>
          <div className="space-y-2"><Label>Number of chapters: {count}</Label>
            <input type="range" min={3} max={12} value={count} onChange={(e) => setCount(+e.target.value)} className="w-full accent-primary" />
          </div>
          <Button size="lg" disabled={busy || topic.trim().length < 2} onClick={getAngles}>{busy ? "Finding angles…" : "Find profitable angles →"}</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">Pick your angle</h1>
          {angles.map((a) => (
            <button key={a.title} disabled={busy} onClick={() => getOutline(a)} className="block w-full rounded-2xl border bg-card p-6 text-left transition hover:border-primary disabled:opacity-50">
              <h3 className="text-xl font-semibold">{a.title}</h3>
              <p className="mt-1 text-muted-foreground">{a.subtitle}</p>
              <p className="mt-3 text-sm text-primary">↗ {a.why}</p>
            </button>
          ))}
          {busy && <p className="text-muted-foreground">Building your outline…</p>}
          <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">{picked?.title}</h1>
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
            <Button className="shadow-glow" disabled={busy || !outline.length} onClick={create}>{busy ? "Saving…" : "Write my product →"}</Button>
          </div>
        </div>
      )}
    </main>
  );
}
