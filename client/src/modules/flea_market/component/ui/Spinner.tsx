interface SpinnerProps {
  className?: string;
  label?: string;
}

function Spinner({ className = "w-4 h-4", label }: SpinnerProps) {
  const spinner = <span className={`border-2 border-purple-200 rounded-full animate-spin border-t-purple-600 ${className}`} />;

  if (!label) return spinner;

  return (
    <span className="flex items-center justify-center gap-2 text-sm text-gray-500">
      {spinner}
      {label}
    </span>
  );
}

export default Spinner;
