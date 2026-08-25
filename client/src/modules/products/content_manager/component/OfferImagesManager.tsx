import { useState } from "react";
import { FaSpinner } from "react-icons/fa";
import { FiArrowLeft, FiArrowRight, FiPlus, FiTrash2 } from "react-icons/fi";
import { toast } from "sonner";
import type { ContentZoneImage } from "../types";
import { addEntryImages, deleteEntryImage, reorderEntryImages } from "../api/contentApi";

interface Props {
  contentId: number;
  images: ContentZoneImage[];
  onChange: (images: ContentZoneImage[]) => void;
}

/** Offers Banner only - lets the admin add/remove/reorder the campaign's images via their own endpoints. */
export default function OfferImagesManager({ contentId, images, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleAdd = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setUploading(true);
    try {
      const added = await addEntryImages(contentId, Array.from(fileList));
      onChange([
        ...sorted,
        ...added.map((image) => ({ imageId: image.image_id, imageUrl: image.image_url, sortOrder: image.sort_order })),
      ]);
      toast.success(added.length > 1 ? "Images added" : "Image added");
    } catch (err) {
      toast.error("Failed to add image(s)");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (image: ContentZoneImage) => {
    if (image.imageId == null || busy) return;
    setBusy(true);
    try {
      await deleteEntryImage(contentId, image.imageId);
      onChange(sorted.filter((img) => img.imageId !== image.imageId));
      toast.success("Image removed");
    } catch (err) {
      toast.error("Failed to remove image");
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    if (busy) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const reordered = [...sorted];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    if (reordered.some((img) => img.imageId == null)) {
      toast.error("Save the campaign first to finish setting up this image before reordering.");
      return;
    }

    const optimistic = reordered.map((img, i) => ({ ...img, sortOrder: i }));
    onChange(optimistic);

    setBusy(true);
    try {
      await reorderEntryImages(
        contentId,
        optimistic.map((img) => ({ image_id: img.imageId as number, sort_order: img.sortOrder })),
      );
    } catch (err) {
      onChange(sorted);
      toast.error("Failed to reorder images");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sm:col-span-2">
      <p className="text-xs font-bold text-slate-500">Offer Images</p>
      <p className="mt-1 text-[11px] text-slate-400">Add one or more images for this campaign - shown as a horizontal carousel in the app.</p>

      <div className="mt-3 flex flex-wrap gap-3">
        {sorted.map((image, index) => (
          <div key={image.imageId ?? image.imageUrl} className="w-32 shrink-0 overflow-hidden rounded-xl border border-slate-200">
            <img src={image.imageUrl} alt="" className="h-24 w-full object-cover" />
            <div className="flex items-center justify-between gap-1 bg-white px-1.5 py-1">
              <button
                type="button"
                onClick={() => void handleMove(index, -1)}
                disabled={index === 0 || busy}
                title="Move left"
                className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              >
                <FiArrowLeft size={12} />
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(image)}
                disabled={image.imageId == null || busy}
                title="Delete"
                className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30"
              >
                <FiTrash2 size={12} />
              </button>
              <button
                type="button"
                onClick={() => void handleMove(index, 1)}
                disabled={index === sorted.length - 1 || busy}
                title="Move right"
                className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              >
                <FiArrowRight size={12} />
              </button>
            </div>
          </div>
        ))}

        <label
          className={`grid h-[calc(6rem+30px)] w-32 shrink-0 cursor-pointer place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-purple-300 hover:text-[#852BAF] ${uploading ? "pointer-events-none opacity-50" : ""}`}
        >
          {uploading ? (
            <FaSpinner className="animate-spin" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-[11px] font-bold">
              <FiPlus /> Add Image
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(event) => { void handleAdd(event.target.files); event.target.value = ""; }}
          />
        </label>
      </div>
    </div>
  );
}
