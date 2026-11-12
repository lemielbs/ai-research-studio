import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Synthforge — Build sellable digital products with AI" },
      { name: "description", content: "Type a topic. Get a complete ebook, sales page, social posts and PDF in minutes." },
      { property: "og:title", content: "Synthforge — Build sellable digital products with AI" },
      { property: "og:description", content: "Type a topic. Get a complete ebook, sales page, social posts and PDF in minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const steps = [
  { n: "01", t: "Develop", d: "Pick a topic. AI finds profitable niche angles, builds the outline and writes every chapter." },
  { n: "02", t: "Distribute", d: "Get a ready sales page, product description, price suggestion and 5 social posts." },
  { n: "03", t: "Deliver", d: "Generate a cover and download a polished PDF, ready for Gumroad, Etsy or Stan." },
];

const plans = [
  { name: "Starter", price: "$0", note: "Try it out", feats: ["3 products / month", "PDF export", "Sales kit"] },
  { name: "Pro", price: "$29", note: "per month", feats: ["Unlimited products", "AI covers", "Priority generation", "Commercial rights"], hot: true },
  { name: "Business", price: "$79", note: "per month", feats: ["Everything in Pro", "Team seats", "Bulk generation", "White-label PDFs"] },
];

const faqs: [string, string][] = [
  ["Do I need writing or design skills?", "No. The AI writes the content, the copy and creates the cover. You just pick and tweak."],
  ["Can I sell what I create?", "Yes — the products are yours to sell on any marketplace."],
  ["How long does one product take?", "Usually 5–10 minutes from topic to downloadable PDF."],
  ["What kinds of products can I make?", "Ebooks, workbooks, checklists and mini-courses on almost any topic."],
];

function Index() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/auth">Log in</Link></Button>
          <Button asChild size="sm"><Link to="/auth">Start free</Link></Button>
        </div>
      </header>

      <section className="grid-bg relative border-b">
        <div className="mx-auto max-w-5xl px-6 py-28 text-center">
          <p className="mb-6 inline-block rounded-full border px-4 py-1 text-xs uppercase tracking-widest text-muted-foreground">
            Develop · Distribute · Deliver
          </p>
          <h1 className="text-5xl font-bold leading-[1.05] md:text-7xl">
            Turn any idea into a <span className="text-primary">sellable</span> digital product.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Type a topic. Synthforge writes the ebook, designs the cover, drafts the sales page and hands you a PDF — in minutes.
          </p>
          <div className="mt-10 flex justify-center gap-3">
            <Button asChild size="lg" className="shadow-glow"><Link to="/auth">Build my first product →</Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="mb-12 text-3xl font-bold md:text-4xl">The 3D system, automated.</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl border bg-card p-8">
              <div className="font-display text-sm text-primary">{s.n}</div>
              <h3 className="mt-3 text-2xl font-semibold">{s.t}</h3>
              <p className="mt-3 text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="border-y bg-card/40">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl">Simple pricing</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((p) => (
              <div key={p.name} className={`rounded-2xl border p-8 ${p.hot ? "border-primary bg-card shadow-glow" : "bg-background"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">{p.name}</h3>
                  {p.hot && <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Popular</span>}
                </div>
                <div className="mt-6 font-display text-5xl font-bold">{p.price}</div>
                <div className="text-sm text-muted-foreground">{p.note}</div>
                <ul className="mt-6 space-y-2 text-sm">
                  {p.feats.map((f) => <li key={f}>✓ {f}</li>)}
                </ul>
                <Button asChild className="mt-8 w-full" variant={p.hot ? "default" : "outline"}>
                  <Link to="/auth">Get started</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-24">
        <h2 className="mb-8 text-3xl font-bold">Questions</h2>
        <Accordion type="single" collapsible>
          {faqs.map(([q, a]) => (
            <AccordionItem key={q} value={q}>
              <AccordionTrigger className="text-left">{q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <footer className="border-t py-10 text-center text-sm text-muted-foreground">© 2026 Synthforge</footer>
    </div>
  );
}
