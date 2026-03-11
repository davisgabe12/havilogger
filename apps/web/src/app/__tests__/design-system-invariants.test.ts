import * as fs from "fs";
import * as path from "path";

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("Design system invariants", () => {
  it("blocks legacy ad-hoc destructive/success text classes on priority routes", () => {
    const files = [
      "src/app/app/page.tsx",
      "src/app/app/invite/page.tsx",
      "src/app/app/select-family/page.tsx",
      "src/app/app/onboarding/care-member/page.tsx",
      "src/app/auth/sign-in/page.tsx",
      "src/app/auth/sign-up/page.tsx",
      "src/app/auth/forgot-password/page.tsx",
      "src/app/auth/reset-password/page.tsx",
      "src/app/share/[token]/page.tsx",
      "src/app/knowledge/page.tsx",
    ];

    const forbidden = /(text-destructive|text-emerald-200)/;
    for (const file of files) {
      const source = readFile(file);
      expect(source).not.toMatch(forbidden);
    }
  });

  it("uses shared controls (no raw input/select/textarea) in app and chat/timeline surfaces", () => {
    const files = [
      "src/app/app/page.tsx",
      "src/components/timeline/timeline-panel.tsx",
      "src/components/chat/message-feedback.tsx",
    ];

    const forbidden = /<\s*(input|select|textarea)\b/;
    for (const file of files) {
      const source = readFile(file);
      expect(source).not.toMatch(forbidden);
    }
  });

  it("uses shared typography utility classes on launch-priority entry surfaces", () => {
    const files = [
      "src/app/auth/sign-in/page.tsx",
      "src/app/auth/sign-up/page.tsx",
      "src/app/auth/forgot-password/page.tsx",
      "src/app/auth/reset-password/page.tsx",
      "src/app/share/[token]/page.tsx",
      "src/app/knowledge/page.tsx",
    ];

    for (const file of files) {
      const source = readFile(file);
      expect(source).toMatch(/havi-type-page-title/);
      expect(source).toMatch(/havi-type-body/);
    }
  });
});
