#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const SOURCE_PATH = path.join(rootDir, "src/styles/havi-tokens.source.json");
const CSS_PATH = path.join(rootDir, "src/styles/havi-tokens.css");
const UI_TOKENS_JSON_PATH = path.join(
  rootDir,
  "public/brand/palette/night-forest-ui-tokens.json",
);
const CORE_PALETTE_JSON_PATH = path.join(
  rootDir,
  "public/brand/palette/night-forest.json",
);

const CHECK_MODE = process.argv.includes("--check");

const sourceRaw = fs.readFileSync(SOURCE_PATH, "utf8");
const source = JSON.parse(sourceRaw);

if (!source.tokens || typeof source.tokens !== "object") {
  throw new Error(`Invalid token source at ${SOURCE_PATH}: missing tokens object.`);
}

const tokenEntries = Object.entries(source.tokens);

if (!tokenEntries.length) {
  throw new Error(`Invalid token source at ${SOURCE_PATH}: tokens object is empty.`);
}

const token = (name) => {
  const value = source.tokens[name];
  if (typeof value !== "string") {
    throw new Error(`Token '${name}' missing from ${SOURCE_PATH}`);
  }
  return value;
};

const pxToNumber = (name) => {
  const raw = token(name).trim();
  const match = raw.match(/^(\d+(?:\.\d+)?)px$/);
  if (!match) {
    throw new Error(`Token '${name}' must be in px format. Received '${raw}'.`);
  }
  return Number(match[1]);
};

const renderCss = () => {
  const lines = [
    "/* AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY. */",
    "/* Source: src/styles/havi-tokens.source.json */",
    ":root {",
    ...tokenEntries.map(([name, value]) => `  ${name}: ${value};`),
    "}",
    "",
  ];
  return lines.join("\n");
};

const renderUiTokensJson = () => {
  const spacing = source.exports?.spacing;
  if (!spacing || typeof spacing !== "object") {
    throw new Error(
      `Invalid token source at ${SOURCE_PATH}: missing exports.spacing object.`,
    );
  }

  const uiTokens = {
    base: {
      background: token("--havi-bg"),
      foreground: token("--havi-fg"),
      moss: token("--havi-moss"),
    },
    surfaces: {
      surface1: token("--havi-surface-1"),
      surface2: token("--havi-surface-2"),
      surface3: token("--havi-surface-3"),
    },
    text: {
      primary: token("--havi-text"),
      muted: token("--havi-text-muted"),
      disabled: token("--havi-text-disabled"),
      inverse: token("--havi-bg"),
    },
    borders: {
      default: token("--havi-border"),
      strong: token("--havi-border-strong"),
    },
    actions: {
      primary: {
        bg: token("--havi-primary-bg"),
        fg: token("--havi-primary-fg"),
        hoverBg: token("--havi-primary-hover"),
        activeBg: token("--havi-primary-active"),
        disabledBg: token("--havi-primary-disabled-bg"),
        disabledFg: token("--havi-primary-disabled-fg"),
      },
      secondary: {
        bg: token("--havi-secondary-bg"),
        fg: token("--havi-fg"),
        hoverBg: token("--havi-secondary-hover"),
        activeBg: token("--havi-secondary-active"),
        border: token("--havi-border"),
      },
      ghost: {
        fg: token("--havi-fg"),
        hoverBg: token("--havi-ghost-hover"),
        activeBg: token("--havi-ghost-active"),
      },
    },
    focus: {
      ring: token("--havi-ring"),
    },
    tooltip: {
      bg: token("--havi-tooltip-bg"),
      fg: token("--havi-tooltip-fg"),
      border: token("--havi-tooltip-border"),
    },
    status: {
      success: token("--havi-status-success"),
      warning: token("--havi-status-warning"),
      destructive: token("--havi-status-destructive"),
    },
    radius: {
      sm: pxToNumber("--havi-radius-sm"),
      md: pxToNumber("--havi-radius-md"),
      lg: pxToNumber("--havi-radius-lg"),
    },
    spacing,
  };

  return `${JSON.stringify(uiTokens, null, 2)}\n`;
};

const renderCorePaletteJson = () => {
  const palette = {
    background: token("--havi-bg"),
    foreground: token("--havi-fg"),
    moss: token("--havi-moss"),
  };

  return `${JSON.stringify(palette, null, 2)}\n`;
};

const outputs = [
  { path: CSS_PATH, content: renderCss() },
  { path: UI_TOKENS_JSON_PATH, content: renderUiTokensJson() },
  { path: CORE_PALETTE_JSON_PATH, content: renderCorePaletteJson() },
];

const changedPaths = [];

for (const output of outputs) {
  const current = fs.existsSync(output.path)
    ? fs.readFileSync(output.path, "utf8")
    : null;

  if (current !== output.content) {
    changedPaths.push(output.path);
    if (!CHECK_MODE) {
      fs.writeFileSync(output.path, output.content, "utf8");
    }
  }
}

if (CHECK_MODE) {
  if (changedPaths.length) {
    console.error("Token drift detected. Run: npm run tokens:sync");
    for (const changedPath of changedPaths) {
      console.error(`- ${path.relative(rootDir, changedPath)}`);
    }
    process.exit(1);
  }
  console.log("Token outputs are synchronized.");
  process.exit(0);
}

if (changedPaths.length) {
  console.log("Updated token artifacts:");
  for (const changedPath of changedPaths) {
    console.log(`- ${path.relative(rootDir, changedPath)}`);
  }
} else {
  console.log("Token artifacts already up to date.");
}
