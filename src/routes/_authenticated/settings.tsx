import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAiStatus, saveMyKey, removeMyKey } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Synthforge" }] }),
  component: Settings,
});

function Settings() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getAiStatus);
  const saveFn = useServerFn(saveMyKey);
  const removeFn = useServerFn(removeMyKey);
  const { data } = useQuery({ queryKey: ["ai-status"], queryFn: () => statusFn() });
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try { await saveFn({ data: { key } }); setKey(""); toast.success("Key saved. You're ready to build."); qc.invalidateQueries({ queryKey: ["ai-status"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-4xl font-bold">Settings</h1>
      <section className="mt-8 rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Your AI key</h2>
        {(
          <>
            <p className="mt-2 text-muted-foreground">{data?.owner ? "You're the owner: Lovable AI credits are used first, then the OpenAI key you save here." : "Every teammate uses their own OpenAI key."} Get one at platform.openai.com/api-keys (needs a funded balance). Only you can see it.</p>
            <p className="mt-4 text-sm">{data?.hasKey ? "✓ Key saved" : "No key saved yet"}</p>
            <div className="mt-3 flex gap-2">
              <Input type="password" placeholder="sk-..." value={key} onChange={(e) => setKey(e.target.value)} />
              <Button disabled={busy || key.length < 20} onClick={save}>{busy ? "Checking…" : "Save"}</Button>
            </div>
            {data?.hasKey && <Button variant="ghost" size="sm" className="mt-3" onClick={async () => { await removeFn(); qc.invalidateQueries({ queryKey: ["ai-status"] }); }}>Remove my key</Button>}
          </>
        )}
      </section>
    </main>
  );
}
