import { useState } from "react";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  variant?: "neutral" | "brand";
  // Optional — falls back to the initial-letter badge below when absent.
  // Never required anywhere this is used (product creation collects no
  // image), so every call site must keep working with this omitted.
  imageUrl?: string | null;
}

// "lg" uses a rounded-square shape (matches a logo tile) rather than a
// circle — used where an Avatar stands in for a missing company logo.
const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "w-9 h-9 text-xs rounded-full",
  md: "w-11 h-11 text-base rounded-full",
  lg: "w-12 h-12 text-lg rounded-lg",
};

// The initial badge used for people/products/companies throughout billing
// (product search results, customer results, confirmed customer bar, invoice
// company logo fallback) — now doubles as a product thumbnail when imageUrl
// is given. A broken/404 image falls back to the initial badge rather than
// the browser's broken-image icon (onError flips a local flag; imageUrl
// itself never mutates, so a re-render with a new prop retries cleanly).
function Avatar({ name, size = "sm", variant = "neutral", imageUrl }: AvatarProps) {
  // Derived against the specific URL that failed, not a bare boolean — if
  // this same Avatar instance later receives a different imageUrl (list
  // re-sorts, product changes), a stale failure from the PREVIOUS url would
  // otherwise wrongly suppress a perfectly valid new one.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageFailed = failedUrl === imageUrl;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const palette =
    variant === "brand"
      ? "text-white bg-gradient-to-tr from-[#852BAF] to-[#FC3F78] shadow-sm"
      : "text-gray-600 border border-white shadow-sm bg-gradient-to-tr from-gray-100 to-gray-200";

  if (imageUrl && !imageFailed) {
    return (
      <img
        src={imageUrl}
        alt={name}
        onError={() => setFailedUrl(imageUrl)}
        className={`object-cover shrink-0 ${SIZE_CLASSES[size]}`}
      />
    );
  }

  return (
    <div className={`flex items-center justify-center font-bold shrink-0 ${SIZE_CLASSES[size]} ${palette}`}>
      {initial}
    </div>
  );
}

export default Avatar;
