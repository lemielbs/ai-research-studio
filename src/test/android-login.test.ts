import { describe, expect, it } from "vitest";
import { finishAndroidLogin, startAndroidLogin } from "@/lib/android-login";

describe("Android Google sign-in", () => {
  const site = "https://synthforgeai.netlify.app";
  const state = "a".repeat(43);
  const challenge = "b".repeat(43);
  it("starts PKCE using the site's existing Google callback", () => {
    const response = startAndroidLogin(new Request(site + "/api/mobile?state=" + state + "&challenge=" + challenge));
    expect(response.status).toBe(302);
    const next = new URL(response.headers.get("Location")!);
    expect(next.searchParams.get("redirect_to")).toBe(site + "/auth");
    expect(next.searchParams.get("code_challenge")).toBe(challenge);
    expect(next.searchParams.get("code_challenge_method")).toBe("s256");
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
  });
  it("hands only an authorization code to the installed app and clears the browser marker", async () => {
    const request = new Request(site + "/auth?code=test-auth-code", { headers: { cookie: "__Host-synthforge_android=" + state } });
    const response = finishAndroidLogin(request)!;
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(await response.text()).toContain("intent://login/callback?state=" + state + "&amp;code=test-auth-code");
    expect(finishAndroidLogin(new Request(site + "/auth?code=test-auth-code"))).toBeUndefined();
  });
  it("rejects malformed mobile starts and ignores unrelated callbacks", () => {
    expect(startAndroidLogin(new Request(site + "/api/mobile")).status).toBe(400);
    expect(finishAndroidLogin(new Request(site + "/auth"))).toBeUndefined();
  });
});
