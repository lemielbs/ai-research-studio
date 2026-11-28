import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  getAiStatus,
  saveMyKey,
  removeMyKey,
  saveAnthropicKey,
  removeAnthropicKey,
  setContentProvider,
} from "@/lib/ai.functions";
import { claudeModels, type ClaudeModel, type ContentProvider } from "@/lib/ai-models";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings - Synthforge" }] }),
  component: Settings,
});

function Settings() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getAiStatus);
  const saveOpenAI = useServerFn(saveMyKey);
  const removeOpenAI = useServerFn(removeMyKey);
  const saveClaude = useServerFn(saveAnthropicKey);
  const removeClaude = useServerFn(removeAnthropicKey);
  const saveProvider = useServerFn(setContentProvider);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => statusFn(),
  });
  const [openAIKey, setOpenAIKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [choice, setChoice] = useState<{ preference: ContentProvider; claudeModel: ClaudeModel }>();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (operation: () => Promise<unknown>, success: string, refresh = true) => {
    setBusy(true);
    try {
      await operation();
      if (refresh) await qc.invalidateQueries({ queryKey: ["ai-status"] });
      toast.success(success);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save your settings.");
    } finally {
      setBusy(false);
    }
  };

  const options = choice ?? data;
  const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <h1 className="text-4xl font-bold">Settings</h1>
      {isLoading && <p role="status">Loading AI settings…</p>}
      {error && <p role="alert">{error.message}</p>}
      {data && options && (
        <>
          <section className="space-y-5 rounded-2xl border bg-card p-6">
            <h2 className="text-xl font-semibold">AI provider keys</h2>
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await saveOpenAI({ data: { key: openAIKey } });
                  setOpenAIKey("");
                }, "OpenAI key saved.");
              }}
            >
              <label htmlFor="openai-key" className="font-medium">
                OpenAI API key
              </label>
              <p className="text-sm text-muted-foreground">
                Required for AI covers, interior images, and visual styles. Also writes content when
                OpenAI is selected.
              </p>
              <p className="text-sm">
                {data.hasKey
                  ? "Key saved"
                  : data.hasOpenAI
                    ? "A server key is available for the owner"
                    : "No key saved"}
              </p>
              <Input
                id="openai-key"
                type="password"
                autoComplete="off"
                maxLength={300}
                value={openAIKey}
                onChange={(event) => setOpenAIKey(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || openAIKey.trim().length < 20}>
                  {data.hasKey ? "Replace OpenAI key" : "Validate and save"}
                </Button>
                {data.hasKey && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(() => removeOpenAI(), "OpenAI key removed.")}
                  >
                    Remove OpenAI key
                  </Button>
                )}
              </div>
            </form>
            <form
              className="space-y-2 border-t pt-5"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await saveClaude({ data: { key: claudeKey } });
                  setClaudeKey("");
                }, "Anthropic key saved.");
              }}
            >
              <label htmlFor="anthropic-key" className="font-medium">
                Anthropic API key (optional)
              </label>
              <p className="text-sm text-muted-foreground">
                Enables Claude for outlines, manuscript text, and revisions.
              </p>
              <p className="text-sm">{data.hasClaude ? "Key saved" : "No key saved"}</p>
              <Input
                id="anthropic-key"
                type="password"
                autoComplete="off"
                maxLength={300}
                value={claudeKey}
                onChange={(event) => setClaudeKey(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || claudeKey.trim().length < 20}>
                  {data.hasClaude ? "Replace Anthropic key" : "Validate and save"}
                </Button>
                {data.hasClaude && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(() => removeClaude(), "Anthropic key removed.")}
                  >
                    Remove Anthropic key
                  </Button>
                )}
              </div>
            </form>
          </section>
          <form
            className="space-y-3 rounded-2xl border bg-card p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await saveProvider({
                  data: { preference: options.preference, claudeModel: options.claudeModel },
                });
              }, "Content provider saved.");
            }}
          >
            <h2 className="text-xl font-semibold">Content provider</h2>
            <label htmlFor="content-provider" className="block text-sm">
              Write with
            </label>
            <select
              id="content-provider"
              className={selectClass}
              value={options.preference}
              disabled={busy}
              onChange={(event) =>
                setChoice({
                  preference: event.target.value as ContentProvider,
                  claudeModel: options.claudeModel,
                })
              }
            >
              <option value="automatic">Automatic (prefer Claude when connected)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic" disabled={!data.hasClaude}>
                Anthropic Claude
              </option>
            </select>
            {options.preference !== "openai" && (
              <>
                <label htmlFor="claude-model" className="block text-sm">
                  Claude model
                </label>
                <select
                  id="claude-model"
                  className={selectClass}
                  value={options.claudeModel}
                  disabled={busy}
                  onChange={(event) =>
                    setChoice({
                      preference: options.preference,
                      claudeModel: event.target.value as ClaudeModel,
                    })
                  }
                >
                  {claudeModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {!data.hasOpenAI && data.hasClaude && (
              <p className="text-sm text-muted-foreground">
                Add an OpenAI API key to generate a complete book with AI artwork. Claude can write
                the draft with your Anthropic key.
              </p>
            )}
            {data.owner && !data.hasOpenAI && !data.hasClaude && (
              <p className="text-sm text-muted-foreground">
                The owner’s existing Lovable AI plan is available in Automatic mode until an API key
                is connected.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              After a failure, retry the same action or choose another provider here before
              retrying.
            </p>
            <Button disabled={busy || (options.preference === "anthropic" && !data.hasClaude)}>
              Save content provider
            </Button>
          </form>
        </>
      )}
      <form
        className="space-y-3 rounded-2xl border bg-card p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            async () => {
              const { error: saveError } = await supabase.auth.updateUser({ password });
              if (saveError) throw saveError;
              setPassword("");
            },
            "Password saved.",
            false,
          );
        }}
      >
        <h2 className="text-xl font-semibold">Account password</h2>
        <label htmlFor="pw-new">New password</label>
        <Input
          id="pw-new"
          autoComplete="new-password"
          required
          minLength={6}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button disabled={busy}>Save password</Button>
      </form>
    </main>
  );
}
