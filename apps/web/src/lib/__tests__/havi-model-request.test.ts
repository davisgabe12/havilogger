import { buildHaviModelRequest, HAVI_SYSTEM_PROMPT } from "@/lib/havi-model-request";

describe("buildHaviModelRequest", () => {
  it("includes the Havi system prompt", () => {
    const request = buildHaviModelRequest({
      userMessage: "Hello",
    });

    expect(request.messages[0]?.content).toContain(HAVI_SYSTEM_PROMPT);
  });

  it("includes feedback summary when provided", () => {
    const request = buildHaviModelRequest({
      userMessage: "Hello",
      feedbackSummary: "User prefers shorter answers.",
    });

    expect(request.messages[0]?.content).toContain(
      "Feedback summary: User prefers shorter answers.",
    );
  });

  it("omits feedback summary when not provided", () => {
    const request = buildHaviModelRequest({
      userMessage: "Hello",
    });

    expect(request.messages[0]?.content).not.toContain("Feedback summary:");
  });
});
