import * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { fieldControlVariants } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type SelectProps = React.ComponentProps<"select"> &
  VariantProps<typeof fieldControlVariants>;

function Select({ className, status, ...props }: SelectProps) {
  const ariaInvalid = props["aria-invalid"] ?? status === "error";

  return (
    <select
      data-slot="select"
      data-status={status}
      aria-invalid={ariaInvalid}
      className={cn(
        fieldControlVariants({ status }),
        "havi-select",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
