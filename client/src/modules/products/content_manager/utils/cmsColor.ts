import type { CSSProperties } from "react";
import type { GradientConfig, GradientDirection } from "../types";

export type CmsColorValue =
  | { type: "solid"; color: string }
  | GradientConfig;

export const DEFAULT_SOLID_COLOR = "#852BAF";
export const DEFAULT_GRADIENT_COLORS = ["#852BAF", "#FC3F78"];
export const DEFAULT_GRADIENT_DIRECTION: GradientDirection = "left-right";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const CSS_DIRECTIONS: Record<GradientDirection, string> = {
  "left-right": "to right",
  "right-left": "to left",
  "top-bottom": "to bottom",
  "bottom-top": "to top",
  "top-left-bottom-right": "to bottom right",
  "bottom-left-top-right": "to top right",
};

export const GRADIENT_DIRECTION_LABELS: Record<GradientDirection, string> = {
  "left-right": "Left -> Right",
  "right-left": "Right -> Left",
  "top-bottom": "Top -> Bottom",
  "bottom-top": "Bottom -> Top",
  "top-left-bottom-right": "Top Left -> Bottom Right",
  "bottom-left-top-right": "Bottom Left -> Top Right",
};

export const GRADIENT_DIRECTIONS = Object.keys(GRADIENT_DIRECTION_LABELS) as GradientDirection[];

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value.trim());
}

export function isGradientConfig(value: unknown): value is GradientConfig {
  if (!value || typeof value !== "object") return false;
  const candidate = value as GradientConfig;
  return (
    candidate.type === "gradient" &&
    Array.isArray(candidate.colors) &&
    candidate.colors.length >= 2 &&
    candidate.colors.every((color) => typeof color === "string" && isValidHexColor(color)) &&
    GRADIENT_DIRECTIONS.includes(candidate.direction)
  );
}

export function parseCmsColorValue(value: string | null | undefined): CmsColorValue {
  const raw = value?.trim();
  if (!raw) return { type: "solid", color: DEFAULT_SOLID_COLOR };

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isGradientConfig(parsed)) return parsed;
    } catch {
      // Invalid JSON falls through to solid fallback so legacy rendering never crashes.
    }
  }

  return { type: "solid", color: isValidHexColor(raw) ? raw : DEFAULT_SOLID_COLOR };
}

export function makeGradientColorValue(
  colors = DEFAULT_GRADIENT_COLORS,
  direction: GradientDirection = DEFAULT_GRADIENT_DIRECTION,
): string {
  return JSON.stringify({ type: "gradient", colors, direction });
}

export function gradientToCssBackground(config: GradientConfig): string {
  return `linear-gradient(${CSS_DIRECTIONS[config.direction]}, ${config.colors.join(", ")})`;
}

export function cmsColorToBackground(value: string | null | undefined): CSSProperties {
  const parsed = parseCmsColorValue(value);
  return parsed.type === "gradient" ? { background: gradientToCssBackground(parsed) } : { backgroundColor: parsed.color };
}
