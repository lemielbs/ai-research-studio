import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "My products — Synthforge" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,title,subtitle,product_type,status,cover_url,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">My products</h1>
          <p className="mt-2 text-muted-foreground">Everything you've built with AI.</p>
        </div>
        <Button asChild><Link to="/new">+ New product</Link></Button>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !data?.length ? (
        <div className="rounded-2xl border border-dashed px-6 py-12 text-center sm:p-16">
          <h2 className="text-2xl font-semibold">No products yet</h2>
          <p className="mt-2 text-muted-foreground">Create your first AI digital product in minutes.</p>
          <Button asChild className="mt-6"><Link to="/new">Start building</Link></Button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Link key={p.id} to="/products/$id" params={{ id: p.id }} search={{ autowrite: undefined }} className="group overflow-hidden rounded-2xl border bg-card transition hover:border-primary">
              <div className="aspect-square bg-muted">
                {p.cover_url ? (
                  <img
                    src={p.cover_url}
                    alt=""
                    className="h-full w-full object-contain p-4"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid-bg h-full w-full" />
                )}
              </div>
              <div className="p-5">
                <div className="text-xs uppercase tracking-widest text-primary">{p.product_type} · {p.status}</div>
                <h3 className="mt-2 break-words text-lg font-semibold">{p.title}</h3>
                {p.subtitle && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.subtitle}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
