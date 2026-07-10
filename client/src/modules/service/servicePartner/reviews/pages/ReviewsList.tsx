import { FaStar } from "react-icons/fa";
import { FiMessageSquare } from "react-icons/fi";
import { useMyReviews } from "../../store/useMyReviews";

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <FaStar key={s} size={12} className={s <= rating ? "text-amber-400" : "text-gray-200"} />
      ))}
    </div>
  );
}

export default function ReviewsList() {
  const { reviews, loading } = useMyReviews();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  const avgRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : "—";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div
        className="flex items-center justify-between p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}
          >
            <FiMessageSquare size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Reviews</h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">Feedback from employees you've served</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: "rgba(133,43,175,0.07)" }}>
          <FaStar className="text-amber-400" size={16} />
          <span className="text-lg font-black text-gray-800">{avgRating}</span>
          <span className="text-xs text-gray-500 font-semibold">({reviews.length} reviews)</span>
        </div>
      </div>

      <div className="space-y-4">
        {reviews.map((r) => (
          <div
            key={r.reviewId}
            className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm bg-gradient-to-tr from-[#852BAF] to-[#FC3F78]">
                  {r.employeeName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.employeeName}</p>
                  <p className="text-xs text-gray-400">{r.service}</p>
                </div>
              </div>
              <div className="text-right">
                <Stars rating={r.rating} />
                <p className="text-xs text-gray-400 mt-1">{new Date(r.reviewDate).toLocaleDateString()}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-4">{r.comment}</p>
          </div>
        ))}

        {reviews.length === 0 && (
          <div className="py-16 text-center bg-white rounded-2xl border border-gray-100">
            <h3 className="text-base font-bold text-gray-700 mb-1">No Reviews Yet</h3>
            <p className="text-sm text-gray-400">Reviews will appear here once employees rate your services.</p>
          </div>
        )}
      </div>
    </div>
  );
}
