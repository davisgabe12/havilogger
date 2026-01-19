import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "havi-input transition-[color,box-shadow] text-base md:text-sm",
  {
    variants: {
      status: {
        default: "",
        success:
          "border-[color:var(--havi-status-success)] focus-visible:border-[color:var(--havi-status-success)] focus-visible:ring-[color:var(--havi-status-success)]",
        warning:
          "border-[color:var(--havi-status-warning)] focus-visible:border-[color:var(--havi-status-warning)] focus-visible:ring-[color:var(--havi-status-warning)]",
        error:
          "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
      },
    },
    defaultVariants: {
      status: "default",
    },
  }
)

const inputMessageVariants = cva("text-xs", {
  variants: {
    status: {
      default: "text-muted-foreground",
      success: "text-[color:var(--havi-status-success)]",
      warning: "text-[color:var(--havi-status-warning)]",
      error: "text-destructive",
    },
  },
  defaultVariants: {
    status: "default",
  },
})

type InputProps = React.ComponentProps<"input"> &
  VariantProps<typeof inputVariants>

function Input({ className, status, ...props }: InputProps) {
  const ariaInvalid = props["aria-invalid"] ?? status === "error"

  return (
    <input
      data-slot="input"
      data-status={status}
      aria-invalid={ariaInvalid}
      className={cn(inputVariants({ status, className }))}
      {...props}
    />
  )
}

type InputMessageProps = React.ComponentProps<"p"> &
  VariantProps<typeof inputMessageVariants>

function InputMessage({ className, status, ...props }: InputMessageProps) {
  return (
    <p
      data-slot="input-message"
      className={cn(inputMessageVariants({ status, className }))}
      {...props}
    />
  )
}

export { Input, InputMessage }
