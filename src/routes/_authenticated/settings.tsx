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
  const [editingKey, setEditingKey] = useState<"openai" | "anthropic">();
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
      {isLoading && <p role="status">Loading AI settings.</p>}
      {error && <p role="alert">{error.message}</p>}
      {data && options && (
        <>
          <section className="space-y-5 rounded-2xl border bg-card p-6">
            <h2 className="text-xl font-semibold">AI provider keys</h2>
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy || editingKey !== "openai" || openAIKey.trim().length < 20) return;
                void run(async () => {
                  await saveOpenAI({ data: { key: openAIKey } });
                  setOpenAIKey("");
                  setEditingKey(undefined);
                }, "OpenAI key saved.");
              }}
            >
              <h3 className="font-medium">OpenAI API key</h3>
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
              {editingKey === "openai" && (
                <Input
                  aria-label="OpenAI API key"
                  id="openai-key"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  maxLength={300}
                  value={openAIKey}
                  onChange={(event) => setOpenAIKey(event.target.value)}
                />
              )}
              <div className="flex flex-wrap gap-2">
                {editingKey === "openai" ? (
                  <>
                    <Button disabled={busy || openAIKey.trim().length < 20}>
                      Validate and save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setOpenAIKey("");
                        setEditingKey(undefined);
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setOpenAIKey("");
                      setClaudeKey("");
                      setEditingKey(undefined);
                      setEditingKey("openai");
                    }}
                  >
                    {data.hasKey ? "Replace OpenAI key" : "Add OpenAI key"}
                  </Button>
                )}
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
                if (busy || editingKey !== "anthropic" || claudeKey.trim().length < 20) return;
                void run(async () => {
                  await saveClaude({ data: { key: claudeKey } });
                  setClaudeKey("");
                }, "Anthropic key saved.");
              }}
            >
              <h3 className="font-medium">Anthropic API key (optional)</h3>
              <p className="text-sm text-muted-foreground">
                Enables Claude for outlines, manuscript text, and revisions.
              </p>
              <p className="text-sm">{data.hasClaude ? "Key saved" : "No key saved"}</p>
              {editingKey === "anthropic" && (
                <Input
                  aria-label="Anthropic API key"
                  id="anthropic-key"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  maxLength={300}
                  value={claudeKey}
                  onChange={(event) => setClaudeKey(event.target.value)}
                />
              )}
              <div className="flex flex-wrap gap-2">
                {editingKey === "anthropic" ? (
                  <>
                    <Button disabled={busy || claudeKey.trim().length < 20}>
                      Validate and save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setClaudeKey("");
                        setEditingKey(undefined);
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setOpenAIKey("");
                      setClaudeKey("");
                      setEditingKey("anthropic");
                    }}
                  >
                    {data.hasClaude ? "Replace Anthropic key" : "Add Anthropic key"}
                  </Button>
                )}
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
                The owner's existing Lovable AI plan is available in Automatic mode until an API key
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
