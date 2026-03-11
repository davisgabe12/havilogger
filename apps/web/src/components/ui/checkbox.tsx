import * as React from "react";

import { cn } from "@/lib/utils";

const checkboxBaseClass =
  "h-4 w-4 rounded border border-border/60 bg-background text-primary shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

function Checkbox({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(checkboxBaseClass, className)}
      {...props}
    />
  );
}

export { Checkbox, checkboxBaseClass };
