import { describe, expect, it } from "vitest";
import { BrandAnalystPayloadSchema } from "../schema";
import {
  assertPublicUrl,
  detectMediaType,
  isNonPublicAddress,
  prepareBrandSources,
} from "../sources";

describe("Brand Analyst source preparation", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.2",
    "172.16.0.1",
    "192.168.1.4",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks non-public address %s", (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it("allows a public address and blocks a private URL before fetching", async () => {
    expect(isNonPublicAddress("93.184.216.34")).toBe(false);
    await expect(assertPublicUrl("http://127.0.0.1/admin")).rejects.toThrow(
      "non-public",
    );
  });

  it("crawls relevant same-origin pages and strips page chrome", async () => {
    const pages = new Map([
      [
        "https://example.com/",
        `<html><head><title>Example</title></head><body><nav>Menu noise</nav><main>Brand promise</main><a href="/about">About</a><a href="https://other.example/pricing">Other</a></body></html>`,
      ],
      [
        "https://example.com/about",
        `<html><head><title>About Example</title></head><body><main>Founder story</main></body></html>`,
      ],
    ]);
    const fakeFetch = async (input: string | URL | Request) => {
      const url = input.toString();
      const html = pages.get(url);
      return html
        ? new Response(html, { headers: { "content-type": "text/html" } })
        : new Response("missing", { status: 404 });
    };
    const payload = BrandAnalystPayloadSchema.parse({ url: "https://example.com" });
    const prepared = await prepareBrandSources(payload, {
      fetch: fakeFetch,
      resolveHost: async () => ["93.184.216.34"],
    });

    expect(prepared.crawledUrls).toEqual([
      "https://example.com/",
      "https://example.com/about",
    ]);
    expect(prepared.sources[0].text).toContain("Brand promise");
    expect(prepared.sources[0].text).toContain("Founder story");
    expect(prepared.sources[0].text).not.toContain("Menu noise");
  });

  it("keeps valid sources when another source fails", async () => {
    const payload = BrandAnalystPayloadSchema.parse({
      sources: [
        { kind: "text", label: "approved-copy", content: "Clear first-party proof." },
        {
          kind: "image",
          label: "logo",
          fileName: "fake.png",
          mimeType: "image/png",
          data: Buffer.from("not a png").toString("base64"),
        },
      ],
    });
    const prepared = await prepareBrandSources(payload);

    expect(prepared.sources).toHaveLength(1);
    expect(prepared.reports.map((report) => report.status)).toEqual([
      "processed",
      "failed",
    ]);
  });

  it("detects supported file signatures", () => {
    expect(detectMediaType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe(
      "image/png",
    );
    expect(detectMediaType(new TextEncoder().encode("%PDF-1.7"))).toBe(
      "application/pdf",
    );
  });
});
