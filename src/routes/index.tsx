import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Synthforge — Create and launch ebooks and workbooks" },
      { name: "description", content: "Create an ebook or workbook with an editable draft, a cover, a PDF, and listing copy." },
      { property: "og:title", content: "Synthforge — Create and launch ebooks and workbooks" },
      { property: "og:description", content: "Create an ebook or workbook with an editable draft, a cover, a PDF, and listing copy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const steps = [
  { t: "Draft", d: "Start with a topic and outline the ebook or workbook you want to make." },
  { t: "Edit", d: "Review the chapters, customize the cover, and check the PDF preview." },
  { t: "Export", d: "Download the PDF, cover, sample pages, and listing copy in a launch kit." },
];

const faqs: [string, string][] = [
  ["What does the free beta cost?", "Synthforge access is free during beta. AI generation requires your own OpenAI API key. OpenAI bills you separately for usage."],
  ["What can I make?", "Create an ebook or workbook, edit its chapters, design its cover, and export it as a PDF."],
  ["Can I use my own cover?", "Yes. Upload a finished cover or use a template with artwork you upload or generate."],
];

function Index() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/auth">Log in</Link></Button>
          <Button asChild size="sm"><Link to="/auth">Try the free beta</Link></Button>
        </div>
      </header>

      <section className="grid-bg relative border-b">
        <div className="mx-auto max-w-5xl px-6 py-28 text-center">
          <h1 className="text-5xl font-bold leading-[1.05] md:text-7xl">
            Turn a topic into an <span className="text-primary">ebook or workbook</span> you can launch.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Write and edit your draft, design the cover, and export your PDF and listing copy from one workspace.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="shadow-glow"><Link to="/auth">Try the free beta</Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#sample">See a sample</a></Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">AI generation requires your own OpenAI API key. OpenAI bills you separately for usage.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="mb-12 text-3xl font-bold md:text-4xl">From draft to download</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.t} className="rounded-2xl border bg-card p-8">
              <h3 className="text-2xl font-semibold">{s.t}</h3>
              <p className="mt-3 text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="sample" className="scroll-mt-8 border-y bg-card/40">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
          <div className="mx-auto w-full max-w-72">
            <img
              src="/samples/first-digital-product-cover.png"
              width={497}
              height={702}
              alt="Cover of Your First Digital Product, a Synthforge sample workbook"
              loading="lazy"
              className="h-auto w-full rounded-lg border shadow-xl"
            />
          </div>
          <div>
            <h2 className="text-3xl font-bold md:text-4xl">See a finished workbook</h2>
            <p className="mt-4 text-muted-foreground">
              Your First Digital Product shows what the cover, interior pages, and worksheets look like after export.
            </p>
            <div className="mt-6 rounded-xl border bg-background p-5">
              <h3 className="text-sm font-semibold">Sample listing copy</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Turn a rough idea into a clear first product. Define one reader and one problem, then use the worksheets to outline a small digital product you can finish and share for feedback.
              </p>
            </div>
            <Button asChild variant="outline" className="mt-6">
              <a href="/samples/first-digital-product.pdf" target="_blank" rel="noreferrer">Open sample PDF</a>
            </Button>
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b">
        <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
          <div className="rounded-2xl border border-primary/50 bg-card p-6 md:p-10">
            <h2 className="text-3xl font-bold">Free beta</h2>
            <p className="mt-2 text-xl font-semibold">$0 for Synthforge access during beta</p>
            <p className="mt-4 text-muted-foreground">Bring your own OpenAI API key for AI generation. OpenAI bills usage separately.</p>
            <ul className="mt-5 list-disc space-y-2 pl-5 text-sm">
              <li>Draft and edit ebooks and workbooks</li>
              <li>Design or upload a cover and preview your PDF</li>
              <li>Export your product and listing copy</li>
            </ul>
            <Button asChild className="mt-7"><Link to="/auth">Try the free beta</Link></Button>
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
