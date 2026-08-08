import { useCallback, useEffect, useState } from "react";
import { documentsApi } from "../api/documentsApi";
import type { DocumentItem, DocumentKey } from "../types";

export function useMyDocuments() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    const res = await documentsApi.list();
    if (res.data.success) setDocuments(res.data.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const uploadDocument = useCallback(async (key: DocumentKey, file: File) => {
    const res = await documentsApi.upload(key, file);
    if (res.data.success) {
      setDocuments((prev) => prev.map((d) => (d.key === key ? res.data.data! : d)));
    }
    return res.data;
  }, []);

  return { documents, loading, fetchDocuments, uploadDocument };
}
