import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const fieldControlVariants = cva(
  "havi-input transition-[border-color,box-shadow,color] text-base md:text-sm",
  {
    variants: {
      status: {
        default: "",
        success:
          "border-[color:var(--havi-status-success)] focus-visible:border-[color:var(--havi-status-success)] focus-visible:ring-[color:var(--havi-status-success)]",
        warning:
          "border-[color:var(--havi-status-warning)] focus-visible:border-[color:var(--havi-status-warning)] focus-visible:ring-[color:var(--havi-status-warning)]",
        error:
          "border-[color:var(--havi-status-destructive)] focus-visible:border-[color:var(--havi-status-destructive)] focus-visible:ring-[color:var(--havi-status-destructive)]",
      },
    },
    defaultVariants: {
      status: "default",
    },
  },
);

const fieldMessageVariants = cva("text-xs leading-5", {
  variants: {
    status: {
      default: "text-[color:var(--havi-field-hint)]",
      success: "text-[color:var(--havi-status-success)]",
      warning: "text-[color:var(--havi-status-warning)]",
      error: "text-[color:var(--havi-status-destructive)]",
    },
  },
  defaultVariants: {
    status: "default",
  },
});

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field"
      className={cn("space-y-2", className)}
      {...props}
    />
  );
}

type FieldLabelProps = React.ComponentProps<"label"> & {
  required?: boolean;
};

function FieldLabel({
  className,
  required = false,
  children,
  ...props
}: FieldLabelProps) {
  return (
    <label
      data-slot="field-label"
      className={cn(
        "text-sm font-medium text-[color:var(--havi-field-label)]",
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <span className="ml-1 text-[color:var(--havi-status-warning)]">*</span>
      ) : null}
    </label>
  );
}

function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-hint"
      className={cn("text-xs text-[color:var(--havi-field-hint)]", className)}
      {...props}
    />
  );
}

type FieldMessageProps = React.ComponentProps<"p"> &
  VariantProps<typeof fieldMessageVariants>;

function FieldMessage({ className, status, ...props }: FieldMessageProps) {
  return (
    <p
      data-slot="field-message"
      className={cn(fieldMessageVariants({ status, className }))}
      {...props}
    />
  );
}

function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <FieldMessage
      data-slot="field-error"
      status="error"
      className={className}
      {...props}
    />
  );
}

export {
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  FieldMessage,
  fieldControlVariants,
  fieldMessageVariants,
};
