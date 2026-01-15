"use client";

import { HaviWordmark } from "@/components/brand/HaviWordmark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function BrandPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      {/* Identity */}
      <section className="space-y-2">
        <h1 className="text-3xl font-bold text-muted-foreground">
          <HaviWordmark />
        </h1>
        <p className="text-sm text-muted-foreground">
          HAVI Night Forest design system — quick visual artifacts for tokens, components, and type.
        </p>
      </section>

      {/* Token swatches */}
      <Card className="bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">Core tokens</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
          <TokenSwatch label="Background / foreground" boxClass="bg-background" textClass="text-foreground" />
          <TokenSwatch label="Card / card-foreground" boxClass="bg-card" textClass="text-card-foreground" />
          <TokenSwatch label="Muted / muted-foreground" boxClass="bg-muted" textClass="text-muted-foreground" />
          <TokenSwatch label="Border" boxClass="bg-background border border-border" textClass="text-muted-foreground" />
          <TokenSwatch label="Primary" boxClass="bg-primary" textClass="text-primary-foreground" />
          <TokenSwatch label="Secondary" boxClass="bg-secondary" textClass="text-secondary-foreground" />
          <TokenSwatch label="Ring (focus)" boxClass="bg-background ring-2 ring-ring" textClass="text-muted-foreground" />
          <TokenSwatch label="Destructive" boxClass="bg-destructive" textClass="text-background" />
        </CardContent>
      </Card>

      {/* Component previews */}
      <Card className="bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">Components</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide">Buttons</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm">Primary</Button>
              <Button size="sm" variant="secondary">
                Secondary
              </Button>
              <Button size="sm" variant="ghost">
                Ghost
              </Button>
            </div>
            <p className="text-xs">
              Hover and press the buttons to verify hover / active states pulled from HAVI tokens.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide">Input + focus ring</p>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Type to see focus ring…"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide">Card + muted text</p>
            <Card className="bg-card border border-border">
              <CardHeader>
                <CardTitle className="text-sm text-foreground">Sample card title</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-sm text-foreground">Primary body text on card.</p>
                <p className="text-xs text-muted-foreground">Muted helper copy for calm guidance.</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide">Tooltip-style block</p>
            <div className="inline-flex items-center rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm">
              Tooltip / popover sample
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide">Chips / tags</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Muted chip</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                Secondary chip
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Typography */}
      <Card className="bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">Type scale</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-foreground">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">H1 (32px)</p>
            <p className="text-3xl font-semibold leading-tight">Calm, legible guidance for caregivers</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">H2 (24px)</p>
            <p className="text-2xl font-semibold leading-tight">Night Forest preview</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Body (16px)</p>
            <p className="text-base leading-relaxed">
              HAVI helps you log the day, spot patterns, and understand what&apos;s typical without adding pressure.
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Small (14px)</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Use for helper copy, labels, and gentle guidance.
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Caption (12px)</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Timestamps, meta info, and light annotations.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Freeform area using real textarea */}
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Live textarea</p>
        <Textarea
          className="min-h-[80px]"
          placeholder="Use this area to quickly sanity check text contrast and cursor states."
        />
      </section>
    </main>
  );
}

function TokenSwatch({
  label,
  boxClass,
  textClass,
}: {
  label: string;
  boxClass: string;
  textClass: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-8 w-10 rounded-md ${boxClass}`} />
      <p className={textClass}>{label}</p>
    </div>
  );
}

