export interface OrderOffer {
  type: "flash_sale" | "promotional_offer";
  title: string;
  original_price: number | null;
  savings: number;
}

const currency = (amount: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);

export default function OfferTag({ offer }: { offer?: OrderOffer | null }) {
  if (!offer) return null;
  return (
    <div className="mt-1 space-y-0.5">
      <span className="inline-flex rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[10px] font-bold text-[#FC3F78]">
        {offer.type === "flash_sale" ? "Flash sale" : "Offer"}: {offer.title}
      </span>
      {offer.original_price !== null && <p className="text-xs text-gray-400 line-through">{currency(offer.original_price)}</p>}
    </div>
  );
}
