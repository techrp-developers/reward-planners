interface SkeletonProps {
  className?: string;
}

// Bare pulsing block — compose with utility classes at the call site
// (w-/h-/rounded-) rather than adding shape variants here.
function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-pulse rounded-md bg-gray-100 ${className}`} />;
}

export function SearchResultSkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
      <div className="flex items-center min-w-0 gap-3">
        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
        <div className="space-y-1.5 min-w-0">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
      <Skeleton className="w-14 h-3.5 shrink-0" />
    </div>
  );
}

export function CartLineSkeleton() {
  return (
    <div className="p-3 border border-gray-100 rounded-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-2.5 w-24" />
        </div>
        <Skeleton className="w-16 h-6 shrink-0" />
      </div>
    </div>
  );
}

export default Skeleton;
