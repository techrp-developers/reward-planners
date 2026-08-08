import { useEffect, useState } from "react";
import { reviewsApi } from "../api/reviewsApi";
import type { Review } from "../types";

export function useMyReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await reviewsApi.list();
      if (res.data.success) setReviews(res.data.data);
      setLoading(false);
    })();
  }, []);

  return { reviews, loading };
}
