import { useEffect, useState } from "react";
import type { Zone } from "../types";

export type ImageDimensions = {
  width: number;
  height: number;
  aspectRatio: number;
  aspectRatioLabel: string;
  fileSize: number;
};

export type ImageZoneSpec = {
  recommendedWidth: number;
  recommendedHeight: number;
  recommendedRatio: number;
  recommendedRatioLabel: string;
  maxFileSize: number;
  typeLabel: string;
};

// Design guidance only - the CMS never crops/forces an upload to these exact
// pixels. See ratioStatus() below for the actual (tolerant) validation.
export const ZONE_IMAGE_SPECS: Record<Zone, ImageZoneSpec> = {
  navbar_background: {
    recommendedWidth: 1080,
    recommendedHeight: 1920,
    recommendedRatio: 9 / 16,
    recommendedRatioLabel: "9:16",
    maxFileSize: 500 * 1024,
    typeLabel: "Portrait / full-screen background",
  },
  promotional_banner: {
    recommendedWidth: 1080,
    recommendedHeight: 1350,
    recommendedRatio: 4 / 5,
    recommendedRatioLabel: "4:5",
    maxFileSize: 800 * 1024,
    typeLabel: "Portrait banner",
  },
  offers_banner: {
    recommendedWidth: 720,
    recommendedHeight: 900,
    recommendedRatio: 4 / 5,
    recommendedRatioLabel: "4:5",
    maxFileSize: 800 * 1024,
    typeLabel: "Offer / card",
  },
};

const RATIO_TOLERANCE = 0.03;

// Common named ratios, checked before falling back to a raw simplified fraction -
// keeps the label readable ("4:5") instead of exact-but-ugly ("137:171").
const NAMED_RATIOS: { label: string; value: number }[] = [
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "5:4", value: 5 / 4 },
  { label: "3:4", value: 3 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "2:3", value: 2 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
  { label: "1:2", value: 1 / 2 },
  { label: "2:1", value: 2 },
  { label: "3:5", value: 3 / 5 },
  { label: "5:3", value: 5 / 3 },
];

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function aspectRatioLabel(width: number, height: number): string {
  const ratio = width / height;

  const named = NAMED_RATIOS.find((candidate) => Math.abs(candidate.value - ratio) / candidate.value <= 0.02);
  if (named) return named.label;

  const divisor = gcd(Math.round(width), Math.round(height)) || 1;
  const simpleW = Math.round(width) / divisor;
  const simpleH = Math.round(height) / divisor;
  if (simpleW <= 30 && simpleH <= 30) return `${simpleW}:${simpleH}`;

  return `${ratio.toFixed(2)}:1`;
}

export type RatioStatus = "match" | "different";

export function ratioStatus(actualRatio: number, recommendedRatio: number, tolerance = RATIO_TOLERANCE): RatioStatus {
  return Math.abs(actualRatio - recommendedRatio) / recommendedRatio <= tolerance ? "match" : "different";
}

export function isLowResolution(width: number, height: number, spec: ImageZoneSpec): boolean {
  const threshold = 0.75;
  return width < spec.recommendedWidth * threshold || height < spec.recommendedHeight * threshold;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads real pixel dimensions from any image source (data URL or remote URL) without a network upload. */
export function useImageDimensions(url: string | null | undefined): { width: number; height: number } | null {
  const [trackedUrl, setTrackedUrl] = useState(url);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);

  // Adjust state during render when the url prop changes, rather than in an effect -
  // avoids an extra render and a synchronous setState call inside useEffect.
  if (url !== trackedUrl) {
    setTrackedUrl(url);
    setDims(null);
  }

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setDims({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setDims(null);
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [url]);

  return dims;
}
