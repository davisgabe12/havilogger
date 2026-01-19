import React from "react";
import "@testing-library/jest-dom";
import "whatwg-fetch";

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
