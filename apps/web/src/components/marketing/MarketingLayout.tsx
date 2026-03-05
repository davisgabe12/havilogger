"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { HaviWordmark } from "@/components/brand/HaviWordmark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/solutions", label: "Solutions" },
  { href: "/stories", label: "Stories" },
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Resources" },
  { href: "/about", label: "About" },
  { href: "/competitors", label: "Competitors" },
];

type MarketingLayoutProps = {
  children: React.ReactNode;
};

export function MarketingLayout({ children }: MarketingLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="havi-marketing-header">
        <div className="havi-marketing-header-inner">
          <Link href="/" className="havi-marketing-brand-link">
            <HaviWordmark />
          </Link>
          <nav className="havi-marketing-nav hidden md:flex" aria-label="Primary navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="havi-marketing-nav-link"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="havi-marketing-header-actions">
            <Button variant="ghost" size="sm" className="havi-marketing-header-signin" asChild>
              <Link href="/auth/sign-in">Sign in</Link>
            </Button>
            <Button size="sm" className="havi-marketing-header-cta" asChild>
              <Link href="/auth/sign-up">Start now</Link>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="havi-marketing-menu-button md:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        <div
          className={cn(
            "havi-marketing-mobile-panel md:hidden",
            menuOpen ? "block" : "hidden",
          )}
        >
          <nav className="flex flex-col gap-4 text-sm" aria-label="Mobile navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="havi-marketing-nav-link"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div>© {new Date().getFullYear()} Havi. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
