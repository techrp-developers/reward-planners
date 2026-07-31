import type { ComponentType, ReactNode } from "react";

interface SectionCardProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

// The "icon badge + title + subtitle" header on a white rounded card is
// repeated verbatim across every flea market billing panel (Cart,
// ProductSearch, CustomerVerify, payment collection) — centralizing it here
// means a visual tweak (spacing, radius, gradient) only has to happen once.
function SectionCard({ icon: Icon, title, subtitle, action, children, className = "", bodyClassName = "" }: SectionCardProps) {
  return (
    <div className={`p-6 bg-white border border-gray-100 shadow-md rounded-2xl ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl shrink-0">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export default SectionCard;
