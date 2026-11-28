import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { KeyBanner } from "@/components/KeyBanner";

export function AppHeader() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col items-start gap-2 px-4 py-3 md:h-16 md:flex-row md:items-center md:justify-between md:px-6 md:py-0">
        <Link to="/dashboard" className="shrink-0"><Logo /></Link>
        <nav aria-label="Main navigation" className="flex w-full min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain py-1 [&>*]:shrink-0 md:w-auto">
          <Button asChild variant="ghost" size="sm"><Link to="/dashboard">My products</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link to="/creators">Creators</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link to="/settings">Settings</Link></Button>
          <Button asChild size="sm"><Link to="/new">+ New product</Link></Button>
          <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
        </nav>
      </div>
      <KeyBanner />
    </header>
  );
}
