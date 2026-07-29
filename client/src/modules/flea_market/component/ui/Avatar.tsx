interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  variant?: "neutral" | "brand";
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
// company logo fallback).
function Avatar({ name, size = "sm", variant = "neutral" }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const palette =
    variant === "brand"
      ? "text-white bg-gradient-to-tr from-[#852BAF] to-[#FC3F78] shadow-sm"
      : "text-gray-600 border border-white shadow-sm bg-gradient-to-tr from-gray-100 to-gray-200";

  return (
    <div className={`flex items-center justify-center font-bold shrink-0 ${SIZE_CLASSES[size]} ${palette}`}>
      {initial}
    </div>
  );
}

export default Avatar;
