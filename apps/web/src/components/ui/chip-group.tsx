import * as React from "react";

import { cn } from "@/lib/utils";

function ChipGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-2 overflow-x-auto whitespace-nowrap", className)}
      style={{ WebkitOverflowScrolling: "touch" }}
      {...props}
    />
  );
}

function ChipGroupFade({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card/90 to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { ChipGroup, ChipGroupFade };
