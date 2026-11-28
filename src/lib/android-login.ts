const cookie = "__Host-synthforge_android";
const noncePattern = /^[A-Za-z0-9_-]{43}$/;
const cookieOptions = "; Path=/; Secure; HttpOnly; SameSite=Lax";

export function startAndroidLogin(request: Request) {
  const url = new URL(request.url);
  const challenge = url.searchParams.get("challenge") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!noncePattern.test(state) || !noncePattern.test(challenge)) return new Response("Invalid sign-in request", { status: 400 });
  const authorize = new URL("https://elmaacxzqjxrxqyfywzx.supabase.co/auth/v1/authorize");
  authorize.search = new URLSearchParams({ provider: "google", redirect_to: "https://synthforgeai.netlify.app/auth", code_challenge: challenge, code_challenge_method: "s256" }).toString();
  return new Response(null, { status: 302, headers: {
    Location: authorize.href, "Set-Cookie": cookie + "=" + state + "; Max-Age=600" + cookieOptions,
    "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  } });
}

export function finishAndroidLogin(request: Request) {
  const state = (request.headers.get("Cookie") ?? "").split(/;\s*/).find((v) => v.startsWith(cookie + "="))?.slice(cookie.length + 1);
  const code = new URL(request.url).searchParams.get("code");
  if (!state || !noncePattern.test(state) || !code || !/^[A-Za-z0-9_-]{8,256}$/.test(code)) return;
  const target = "intent://login/callback?state=" + state + "&amp;code=" + code + "#Intent;scheme=studio.ljdigital.synthforge;package=studio.ljdigital.synthforge;end";
  return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Return to SynthForge</title><body style="background:#101111;color:white;font:18px system-ui;padding:12vh 8vw"><h1>Continue in SynthForge</h1><a style="display:inline-block;padding:16px 24px;border-radius:14px;background:#c4f34a;color:#101111" href="' + target + '">Open SynthForge</a></body>', { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    "Set-Cookie": cookie + "=; Max-Age=0" + cookieOptions,
  } });
}
