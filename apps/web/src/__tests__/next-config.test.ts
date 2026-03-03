import nextConfig from "../../next.config";

describe("next config redirects", () => {
  it("redirects www.gethavi.com to apex", async () => {
    expect(typeof nextConfig.redirects).toBe("function");

    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/:path*",
          destination: "https://gethavi.com/:path*",
          permanent: true,
          has: expect.arrayContaining([
            expect.objectContaining({
              type: "host",
              value: "www.gethavi.com",
            }),
          ]),
        }),
      ])
    );
  });
});
