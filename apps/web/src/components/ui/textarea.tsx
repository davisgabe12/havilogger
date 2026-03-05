import * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { fieldControlVariants } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type TextareaProps = React.ComponentProps<"textarea"> &
  VariantProps<typeof fieldControlVariants>;

function Textarea({ className, status, ...props }: TextareaProps) {
  const ariaInvalid = props["aria-invalid"] ?? status === "error";
  return (
    <textarea
      data-slot="textarea"
      data-status={status}
      aria-invalid={ariaInvalid}
      className={cn(
        fieldControlVariants({ status }),
        "field-sizing-content min-h-16 shadow-xs",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
