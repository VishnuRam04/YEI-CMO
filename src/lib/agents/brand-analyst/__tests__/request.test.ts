import { describe, expect, it } from "vitest";
import { parseBrandAnalystRequest } from "../request";

describe("Brand Analyst request parsing", () => {
  it("parses the legacy JSON envelope", async () => {
    const request = new Request("http://localhost/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        brandId: "brand-1",
        traceId: "trace-1",
        payload: { url: "example.com" },
      }),
    });

    const input = await parseBrandAnalystRequest(request);
    expect(input.brandId).toBe("brand-1");
    expect(input.payload.sources[0]).toMatchObject({
      kind: "website",
      url: "https://example.com",
    });
  });

  it("parses website, text, context, and a real multipart logo upload", async () => {
    const form = new FormData();
    form.set("brandId", "brand-2");
    form.set("traceId", "trace-2");
    form.set("companyName", "Northwind Labs");
    form.set("url", "https://northwind.example");
    form.set(
      "sources",
      JSON.stringify([
        {
          kind: "text",
          label: "approved-copy",
          content: "Senior strategy for lean marketing teams.",
        },
      ]),
    );
    form.set("context", JSON.stringify({ industry: "B2B software" }));
    form.set(
      "logo",
      new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], "logo.png", {
        type: "image/png",
      }),
    );

    const request = new Request("http://localhost/api/extract", {
      method: "POST",
      body: form,
    });
    const input = await parseBrandAnalystRequest(request);

    expect(input.payload.sources).toHaveLength(3);
    expect(input.payload.sources[2]).toMatchObject({
      kind: "image",
      label: "logo",
      fileName: "logo.png",
      mimeType: "image/png",
    });
    expect(input.payload.context?.industry).toBe("B2B software");
  });

  it("rejects unsupported request content types", async () => {
    const request = new Request("http://localhost/api/extract", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    await expect(parseBrandAnalystRequest(request)).rejects.toThrow("Content-Type");
  });

  it("infers the Excel MIME type and labels a catalogue upload", async () => {
    const form = new FormData();
    form.set("brandId", "brand-catalogue");
    form.set("catalogue", new File([Uint8Array.from([1, 2, 3])], "products.xlsx"));

    const input = await parseBrandAnalystRequest(new Request(
      "http://localhost/api/extract",
      { method: "POST", body: form },
    ));

    expect(input.payload.sources[0]).toMatchObject({
      kind: "document",
      label: "product-catalogue",
      fileName: "products.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });
});
