import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type ActiveChildOption = {
  id: string;
  name: string;
};

type ActiveChildPillProps = {
  activeChildId: string | null;
  activeChildName: string;
  children: ActiveChildOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
};

export function ActiveChildPill({
  activeChildId,
  activeChildName,
  children,
  onChange,
  disabled = false,
}: ActiveChildPillProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const listboxId = React.useId();
  const isDisabled = disabled || children.length === 0;

  const selectedIndex = React.useMemo(() => {
    const index = children.findIndex((option) => option.id === activeChildId);
    return index >= 0 ? index : 0;
  }, [children, activeChildId]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setHighlightedIndex(selectedIndex);
    const frame = window.requestAnimationFrame(() => {
      listRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open, selectedIndex]);

  const closeList = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const commitSelection = React.useCallback(
    (index: number) => {
      const option = children[index];
      if (!option) return;
      onChange(option.id);
      closeList();
    },
    [children, closeList, onChange],
  );

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex(event.key === "ArrowUp" ? Math.max(children.length - 1, 0) : 0);
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (!children.length) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeList();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, children.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(children.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commitSelection(highlightedIndex);
    }
  };

  const visibleName = activeChildName.trim() || "No child";

  return (
    <div className="havi-active-child-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="havi-active-child-pill"
        data-testid="active-child-pill"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => {
          if (isDisabled) return;
          setOpen((value) => !value);
        }}
        onKeyDown={handleTriggerKeyDown}
        disabled={isDisabled}
      >
        <span className="havi-active-child-pill-name">{visibleName}</span>
        <ChevronDown
          className={cn("havi-active-child-pill-chevron", open && "havi-active-child-pill-chevron-open")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="havi-active-child-popover" data-testid="active-child-popover">
          <ul
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            ref={listRef}
            aria-label="Select active child"
            aria-activedescendant={`${listboxId}-option-${highlightedIndex}`}
            className="havi-active-child-list"
            onKeyDown={handleListKeyDown}
          >
            {children.map((option, index) => {
              const selected = option.id === activeChildId;
              const highlighted = index === highlightedIndex;
              return (
                <li
                  id={`${listboxId}-option-${index}`}
                  key={option.id}
                  role="option"
                  aria-selected={selected}
                  data-highlighted={highlighted}
                  className={cn(
                    "havi-active-child-option",
                    selected && "havi-active-child-option-selected",
                    highlighted && "havi-active-child-option-highlighted",
                  )}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commitSelection(index)}
                >
                  {option.name}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
