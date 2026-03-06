import { resolveApiBaseUrl } from "@/lib/api-base-url";

describe("resolveApiBaseUrl", () => {
  it("uses NEXT_PUBLIC_API_BASE_URL when configured", () => {
    expect(
      resolveApiBaseUrl({
        NEXT_PUBLIC_API_BASE_URL: "https://api.example.com",
        NODE_ENV: "production",
      }),
    ).toBe("https://api.example.com");
  });

  it("falls back to production API when env is missing in production", () => {
    expect(
      resolveApiBaseUrl({
        NEXT_PUBLIC_API_BASE_URL: "",
        NODE_ENV: "production",
      }),
    ).toBe("https://api-production-0a5d.up.railway.app");
  });

  it("falls back to localhost API in non-production environments", () => {
    expect(
      resolveApiBaseUrl({
        NEXT_PUBLIC_API_BASE_URL: "",
        NODE_ENV: "development",
      }),
    ).toBe("http://127.0.0.1:8000");
  });
});
