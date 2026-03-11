import React from "react";
import "@testing-library/jest-dom";
import "whatwg-fetch";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
}

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({
    children,
    remarkPlugins,
    rehypePlugins,
    ...props
  }: {
    children?: React.ReactNode;
    remarkPlugins?: unknown;
    rehypePlugins?: unknown;
    [key: string]: unknown;
  }) => {
    const text =
      typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : "";
    if (text) {
      const paragraphs = text.split(/\n\n+/);
      return React.createElement(
        "div",
        props,
        paragraphs.map((paragraph, index) =>
          React.createElement("p", { key: index }, paragraph),
        ),
      );
    }
    return React.createElement("div", props, children);
  },
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => "",
  }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) =>
    React.createElement("a", { href, ...props }, children),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    fill,
    priority,
    ...props
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    priority?: boolean;
    [key: string]: unknown;
  }) => {
    void fill;
    void priority;
    return (
    React.createElement("img", {
      src,
      alt,
      ...props,
    })
    );
  },
}));

jest.mock("@radix-ui/react-scroll-area", () => {
  const ReactLocal = require("react") as typeof React;
  return {
    __esModule: true,
    Root: ReactLocal.forwardRef(
      (
        { children, ...props }: { children?: React.ReactNode; [key: string]: unknown },
        ref: React.Ref<HTMLDivElement>,
      ) => ReactLocal.createElement("div", { ref, ...props }, children),
    ),
    Viewport: ReactLocal.forwardRef(
      (
        { children, ...props }: { children?: React.ReactNode; [key: string]: unknown },
        ref: React.Ref<HTMLDivElement>,
      ) => ReactLocal.createElement("div", { ref, ...props }, children),
    ),
    ScrollAreaScrollbar: ReactLocal.forwardRef(
      (
        { children, ...props }: { children?: React.ReactNode; [key: string]: unknown },
        ref: React.Ref<HTMLDivElement>,
      ) => ReactLocal.createElement("div", { ref, ...props }, children),
    ),
    ScrollAreaThumb: ReactLocal.forwardRef(
      (
        { children, ...props }: { children?: React.ReactNode; [key: string]: unknown },
        ref: React.Ref<HTMLDivElement>,
      ) => ReactLocal.createElement("div", { ref, ...props }, children),
    ),
    Corner: ReactLocal.forwardRef(
      (
        { children, ...props }: { children?: React.ReactNode; [key: string]: unknown },
        ref: React.Ref<HTMLDivElement>,
      ) => ReactLocal.createElement("div", { ref, ...props }, children),
    ),
  };
});
