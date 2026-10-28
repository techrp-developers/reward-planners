import { useState } from "react";

export function useListPagination(total: number, filterKey: string) {
  const [pageSize, setPageSize] = useState(25);
  const [position, setPosition] = useState({ key: filterKey, page: 1 });
  const page = Math.min(position.key === filterKey ? position.page : 1, Math.max(1, Math.ceil(total / pageSize)));
  const onPageChange = (next: number) => setPosition({ key: filterKey, page: next });
  const onPageSizeChange = (size: number) => {
    setPageSize(size);
    setPosition({ key: filterKey, page: 1 });
  };
  return { total, page, pageSize, onPageChange, onPageSizeChange };
}
