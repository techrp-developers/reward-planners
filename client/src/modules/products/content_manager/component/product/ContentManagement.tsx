import { useEffect, useState } from "react";
import { FiList, FiPlus } from "react-icons/fi";
import type { AxiosError } from "axios";
import Swal from "sweetalert2";
import { toast } from "sonner";
import type { ContentEntry } from "../../types";
import { blankEntry } from "../../types";
import { buildEntryFormData, createEntry, deactivateEntry, deleteEntry, duplicateEntry, listEntries, updateEntry } from "../../api/contentApi";
import { fromApiEntry } from "../../store/mappers";
import ContentForm from "../ContentForm";
import ContentTable from "../ContentTable";
import LivePreviewPanel from "../LivePreviewPanel";

type View = "table" | "form";

interface ApiErrorBody {
  message?: string;
  data?: {
    conflicts?: { title: string }[];
  };
}

const asApiError = (err: unknown) => err as AxiosError<ApiErrorBody>;
const errorMessage = (err: unknown, fallback: string) => asApiError(err).response?.data?.message || fallback;

export default function ContentManagement() {
  const [entries, setEntries] = useState<ContentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("table");
  const [draft, setDraft] = useState<ContentEntry>(() => blankEntry("navbar_background"));
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const result = await listEntries({ pageSize: 200 });
      setEntries(result.entries.map(fromApiEntry));
    } catch (err) {
      toast.error(errorMessage(err, "Failed to load content entries"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadEntries(); }, []);

  const startAdd = () => { setDraft(blankEntry("navbar_background")); setView("form"); };
  const startEdit = (entry: ContentEntry) => { setDraft({ ...entry }); setView("form"); };
  const patchDraft = (patch: Partial<ContentEntry>) => setDraft((prev) => ({ ...prev, ...patch }));

  const validate = (entry: ContentEntry, requireContentValue: boolean) => {
    if (!entry.title.trim()) return "Title / Label is required.";
    if (requireContentValue) {
      if (entry.contentType === "color" && !entry.colorValue.trim()) return "Pick a color for this zone.";
      if (entry.contentType === "image" && !entry.imageUrl.trim()) return "Upload an image for this zone.";
    }
    if (entry.startAt && entry.endAt && new Date(entry.endAt) <= new Date(entry.startAt)) {
      return "End Date must be after Start Date.";
    }
    return null;
  };

  const handleSaveDraft = async () => {
    const error = validate(draft, false);
    if (error) { await Swal.fire("Can't save", error, "warning"); return; }

    setSaving(true);
    try {
      const fd = buildEntryFormData(draft, { isPublished: false, imageFile: draft.imageFile });
      if (draft.id) await updateEntry(draft.id, fd);
      else await createEntry(fd);
      await loadEntries();
      setView("table");
      toast.success("Saved as draft");
    } catch (err) {
      toast.error(errorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = () => {
    toast.message("Live preview updated", { description: "This is a preview only — nothing has been saved yet." });
  };

  const handlePublish = async () => {
    const error = validate(draft, true);
    if (error) { await Swal.fire("Can't publish", error, "warning"); return; }

    setSaving(true);
    try {
      const fd = buildEntryFormData(draft, { isPublished: true, imageFile: draft.imageFile });
      if (draft.id) await updateEntry(draft.id, fd);
      else await createEntry(fd);
      await loadEntries();
      setView("table");
      toast.success("Published");
    } catch (err: unknown) {
      const apiError = asApiError(err);
      if (apiError.response?.status === 409) {
        const conflicts = apiError.response.data?.data?.conflicts || [];
        const result = await Swal.fire({
          title: "Scheduling conflict detected",
          html: `This overlaps with <b>${conflicts.map((conflict) => conflict.title).join(", ")}</b> in the same zone. The higher priority entry will be shown. Publish anyway?`,
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Publish anyway",
          confirmButtonColor: "#852BAF",
        });
        if (result.isConfirmed) {
          try {
            const fd = buildEntryFormData(draft, { isPublished: true, forcePublish: true, imageFile: draft.imageFile });
            if (draft.id) await updateEntry(draft.id, fd);
            else await createEntry(fd);
            await loadEntries();
            setView("table");
            toast.success("Published");
          } catch (forceErr) {
            toast.error(errorMessage(forceErr, "Publish failed"));
          }
        }
      } else {
        toast.error(errorMessage(err, "Publish failed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (entry: ContentEntry) => {
    try {
      await duplicateEntry(entry.id);
      await loadEntries();
      toast.success("Duplicated as a new draft");
    } catch (err) {
      toast.error(errorMessage(err, "Duplicate failed"));
    }
  };

  const handleDelete = async (entry: ContentEntry) => {
    if (entry.isDefault) return;
    const result = await Swal.fire({
      title: `Remove "${entry.title}"?`,
      text: "This entry will no longer be shown in the app.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
      confirmButtonColor: "#DC2626",
    });
    if (!result.isConfirmed) return;
    try {
      await deleteEntry(entry.id);
      await loadEntries();
      toast.success("Removed");
    } catch (err) {
      toast.error(errorMessage(err, "Delete failed"));
    }
  };

  const handleDeactivateNow = async (entry: ContentEntry) => {
    try {
      await deactivateEntry(entry.id);
      await loadEntries();
      toast.success(`"${entry.title}" deactivated — zone reverts to Default`);
    } catch (err) {
      toast.error(errorMessage(err, "Deactivate failed"));
    }
  };

  return (
    <main className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#25103d] via-[#68258d] to-[#c33076] p-7 text-white shadow-[0_24px_65px_rgba(91,33,124,0.24)]">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-purple-200">Content management · Product</p>
            <h1 className="mt-1 text-3xl font-black">Home Screen Content</h1>
            <p className="mt-2 text-sm text-purple-100/80">Manage the Navbar, Promotional Banner and Offers Banner shown on the Product home screen.</p>
          </div>
          <div className="flex gap-2 rounded-2xl bg-white/10 p-1.5">
            <button
              onClick={() => setView("table")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${view === "table" ? "bg-white text-[#852BAF] shadow" : "text-white/80 hover:bg-white/10"}`}
            >
              <FiList /> Manage Content
            </button>
            <button
              onClick={startAdd}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${view === "form" ? "bg-white text-[#852BAF] shadow" : "text-white/80 hover:bg-white/10"}`}
            >
              <FiPlus /> Add Content
            </button>
          </div>
        </div>
      </header>

      {view === "table" ? (
        <ContentTable
          entries={entries}
          now={now}
          loading={loading}
          onEdit={startEdit}
          onDuplicate={(entry) => void handleDuplicate(entry)}
          onDelete={(entry) => void handleDelete(entry)}
          onDeactivateNow={(entry) => void handleDeactivateNow(entry)}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <ContentForm
            draft={draft}
            entries={entries}
            now={now}
            onChange={patchDraft}
            onSaveDraft={() => void handleSaveDraft()}
            onPreview={handlePreview}
            onPublish={() => void handlePublish()}
            saving={saving}
          />
          <LivePreviewPanel entries={entries} draft={draft} now={now} />
        </div>
      )}
    </main>
  );
}
