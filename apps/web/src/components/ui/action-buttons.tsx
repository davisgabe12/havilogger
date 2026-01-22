import * as React from "react"
import { Copy, Mic, Share, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ButtonProps = React.ComponentProps<typeof Button>

type IconButtonProps = Omit<ButtonProps, "children"> & {
  icon: React.ComponentType<{ className?: string }>
  label: string
  iconClassName?: string
}

function IconButton({
  icon: Icon,
  label,
  iconClassName,
  className,
  ...props
}: IconButtonProps) {
  return (
    <Button
      type="button"
      aria-label={label}
      title={label}
      className={className}
      {...props}
    >
      <Icon className={cn("h-4 w-4", iconClassName)} />
    </Button>
  )
}

type ShareButtonProps = Omit<IconButtonProps, "icon" | "label">

function ShareButton(props: ShareButtonProps) {
  return (
    <IconButton
      icon={Share}
      label="Share"
      size="icon"
      variant="outline"
      {...props}
    />
  )
}

type CopyButtonProps = Omit<IconButtonProps, "icon" | "label">

function CopyButton(props: CopyButtonProps) {
  return (
    <IconButton
      icon={Copy}
      label="Copy"
      size="icon-sm"
      variant="ghost"
      iconClassName="h-3 w-3"
      {...props}
    />
  )
}

type DictateButtonProps = Omit<IconButtonProps, "icon" | "label"> & {
  isRecording?: boolean
}

function DictateButton({ isRecording, ...props }: DictateButtonProps) {
  return (
    <IconButton
      icon={isRecording ? Square : Mic}
      label={isRecording ? "Stop recording" : "Record voice"}
      size="icon"
      variant="outline"
      {...props}
    />
  )
}

export { CopyButton, DictateButton, ShareButton }
