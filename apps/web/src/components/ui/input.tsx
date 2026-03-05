import * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { fieldControlVariants, fieldMessageVariants } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<"input"> &
  VariantProps<typeof fieldControlVariants>;

function Input({ className, status, ...props }: InputProps) {
  const ariaInvalid = props["aria-invalid"] ?? status === "error";

  return (
    <input
      data-slot="input"
      data-status={status}
      aria-invalid={ariaInvalid}
      className={cn(fieldControlVariants({ status, className }))}
      {...props}
    />
  );
}

type InputMessageProps = React.ComponentProps<"p"> &
  VariantProps<typeof fieldMessageVariants>;

function InputMessage({ className, status, ...props }: InputMessageProps) {
  return (
    <p
      data-slot="input-message"
      className={cn(fieldMessageVariants({ status, className }))}
      {...props}
    />
  );
}

export { Input, InputMessage };
