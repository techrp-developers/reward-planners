import { documentsMock } from "../mock/documents.mock";
import { delay } from "./mockUtils";
import type { DocumentItem, DocumentKey } from "../types";

let documents: DocumentItem[] = [...documentsMock];

export const documentsApi = {
  async list() {
    await delay();
    return { data: { success: true, data: [...documents] } };
  },

  async upload(key: DocumentKey, file: File) {
    await delay();
    const url = URL.createObjectURL(file);
    documents = documents.map((d) =>
      d.key === key
        ? { ...d, fileName: file.name, uploadedOn: new Date().toISOString().slice(0, 10), url }
        : d,
    );
    return { data: { success: true, data: documents.find((d) => d.key === key) ?? null } };
  },
};
