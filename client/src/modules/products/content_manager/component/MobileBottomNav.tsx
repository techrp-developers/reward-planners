import { FiGrid, FiHome, FiPlayCircle, FiShoppingCart, FiUser } from "react-icons/fi";

const TABS = [
  { key: "home", label: "Home", icon: FiHome },
  { key: "play", label: "Play", icon: FiPlayCircle },
  { key: "categories", label: "Categories", icon: FiGrid },
  { key: "account", label: "Account", icon: FiUser },
  { key: "cart", label: "Cart", icon: FiShoppingCart },
];

/** Static chrome only - purely visual, so the phone preview doesn't end abruptly at the offers section. */
export default function MobileBottomNav() {
  return (
    <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-800 bg-[#12081f] px-3 py-2">
      {TABS.map(({ key, label, icon: Icon }) => {
        const active = key === "home";
        return (
          <div key={key} className={`flex flex-col items-center gap-0.5 ${active ? "text-[#FC3F78]" : "text-white/40"}`}>
            <Icon size={16} />
            <span className="text-[9px] font-bold">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
