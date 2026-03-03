import type { Metadata } from "next";
import "./globals.css";

function resolveMetadataBase(): URL {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gethavi.com").trim();
  try {
    return new URL(raw);
  } catch {
    return new URL("https://gethavi.com");
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "HAVI Logger",
  description: "Mobile-first baby activity logger powered by GPT",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
