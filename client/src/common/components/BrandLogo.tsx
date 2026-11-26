import logo from "../assets/reward-planners.png";

export default function BrandLogo({ className = "w-44" }: { className?: string }) {
  return <img src={logo} alt="Reward Planners" className={`block h-auto max-w-full shrink-0 object-contain ${className}`} />;
}
