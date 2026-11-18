import { afterEach, describe, expect, it, vi } from "vitest";
import { googlePage, trackGoogleSignup } from "./google-ads";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Google Ads privacy", () => {
  it("allows only exact public paths, with no private URLs", () => {
    for (const path of ["/case/secret", "/team/secret", "/api/invite", "/missing", "/start?name=tenant"]) {
      expect(googlePage(path, "https://abate.test")).toBeNull();
    }
    expect(googlePage("/start", "https://abate.test")).toEqual({ page_location: "https://abate.test/start", page_referrer: "", page_title: "Start your case · Abate" });
  });
  it("sends no tenant data without a conversion destination", async () => {
    vi.useFakeTimers();
    const gtag = vi.fn(); const dataLayer: unknown[] = [];
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_SEND_TO", "");
    vi.stubGlobal("window", { location: { pathname: "/start" }, gtag, dataLayer, setTimeout, clearTimeout });
    const result = trackGoogleSignup();
    await vi.advanceTimersByTimeAsync(1200);
    await result;
    expect(dataLayer).toEqual([{ event: "abate_signup_completed", eventCallback: expect.any(Function), eventTimeout: 1000 }]);
    expect(gtag).not.toHaveBeenCalled();
  });
  it("never emits from a private page", async () => {
    const gtag = vi.fn(); const dataLayer: unknown[] = [];
    vi.stubGlobal("window", { location: { pathname: "/case/secret" }, gtag, dataLayer });
    await trackGoogleSignup();
    expect(dataLayer).toEqual([]); expect(gtag).not.toHaveBeenCalled();
  });
  it("does not block navigation when Google is blocked", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_SEND_TO", "AW-123/example");
    const gtag = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/start" }, gtag, dataLayer: [], setTimeout, clearTimeout });
    const result = trackGoogleSignup();
    await vi.advanceTimersByTimeAsync(1200);
    await result;
    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({ send_to: "AW-123/example" }));
    expect(Object.keys(gtag.mock.calls[0][2]).sort()).toEqual(["event_callback", "event_timeout", "send_to"]);
  });
});
