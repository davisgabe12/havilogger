import * as React from "react";

import { cn } from "@/lib/utils";

function AppShell({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("havi-app-shell", className)} {...props} />;
}

function AppPanel({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("havi-panel-shell rounded-xl", className)} {...props} />;
}

function PanelSection({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("havi-panel-inset rounded-md p-4", className)} {...props} />;
}

function PanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-start justify-between gap-3", className)} {...props} />;
}

type NoticeBannerProps = React.ComponentProps<"div"> & {
  tone?: "info" | "warning" | "danger";
};

function NoticeBanner({
  className,
  tone = "info",
  ...props
}: NoticeBannerProps) {
  return (
    <div
      className={cn(
        "havi-notice-banner",
        tone === "info" && "havi-notice-banner-info",
        tone === "warning" && "havi-notice-banner-warning",
        tone === "danger" && "havi-notice-banner-danger",
        className,
      )}
      {...props}
    />
  );
}

function DrawerPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-t-2xl border p-4 shadow-xl md:h-full md:rounded-none md:rounded-l-2xl",
        "border-[color:var(--havi-app-panel-border)] bg-[color:var(--havi-app-panel-bg)]",
        className,
      )}
      {...props}
    />
  );
}

export { AppPanel, AppShell, DrawerPanel, NoticeBanner, PanelHeader, PanelSection };
