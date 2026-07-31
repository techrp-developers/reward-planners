import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../../common/api/api";
import { FaArrowLeft, FaImages, FaTrash } from "react-icons/fa";
import Swal from "sweetalert2";
import { confirmDialog } from "../../../common/utils/confirmDialog";
// import imageCompression from "browser-image-compression";

import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";

import {
  SortableContext,
  arrayMove,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

// const BASE_IMAGE_URL = "https://rewardplanners.com/api/crm/uploads";
const R2_BASE_URL = "https://cdn.rewardplanners.com";
const MAX_IMAGES = 7;

function SortableImage({
  img,
  onDelete,
}: {
  img: VariantImage;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: img.image_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group rounded-xl overflow-hidden border bg-gray-100"
    >
      {/* DRAG HANDLE */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 z-20 bg-black/70 text-white text-xs px-2 py-1 rounded cursor-grab active:cursor-grabbing"
      >
        Drag
      </div>

      <img
        src={`${R2_BASE_URL}/${img.image_url}`}
        className="h-44 w-full object-cover"
        loading="lazy"
        decoding="async"
      />

      {/* DELETE OVERLAY */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(img.image_id);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition cursor-pointer"
        >
          <FaTrash size={12} /> Delete
        </button>
      </div>

      {/* ORDER BADGE */}
      <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
        #{img.sort_order}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: any) {
  return (
    <div className="flex items-center space-x-4 pb-4 border-b border-gray-100 mb-6">
      <div className="p-4 text-white rounded-2xl" style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}>
        <Icon className="text-2xl" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 font-medium">{description}</p>
        )}
      </div>
    </div>
  );
}

type VariantImage = {
  image_id: number;
  image_url: string;
  sort_order: number;
};

type PreviewImage = {
  file: File;
  preview: string;
};

export default function ProductVariantImages() {
  const { variantId } = useParams<{ variantId: string }>();
  const navigate = useNavigate();
  const sensors = useSensors(useSensor(PointerSensor));

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<VariantImage[]>([]);
  const [previews, setPreviews] = useState<PreviewImage[]>([]);
  const [uploading, setUploading] = useState(false);

  const fetchImages = async () => {
    if (!variantId) return;

    const res = await api.get(`/variant/${variantId}/images`);

    if (res.data.success) {
      const sorted = [...res.data.images].sort((a, b) => {
        // if all are 0 → keep original order
        if (a.sort_order === 0 && b.sort_order === 0) return 0;

        // otherwise sort by sort_order
        return a.sort_order - b.sort_order;
      });

      setImages(sorted);
    }
  };

  useEffect(() => {
    fetchImages();
  }, [variantId]);

  // drag and drop handlers
  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = images.findIndex((i) => i.image_id === active.id);
    const newIndex = images.findIndex((i) => i.image_id === over.id);

    const newOrder = arrayMove(images, oldIndex, newIndex).map(
      (img, index) => ({
        ...img,
        sort_order: index + 1,
      }),
    );

    setImages(newOrder);

    // persist to backend
    await api.put(`/variant/${variantId}/images/reorder`, {
      images: newOrder.map((i) => ({
        image_id: i.image_id,
        sort_order: i.sort_order,
      })),
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const selectedFiles = Array.from(e.target.files);
    const remainingSlots = MAX_IMAGES - images.length;

    if (remainingSlots <= 0) {
      await Swal.fire({
        icon: "warning",
        title: "Image limit reached",
        text: `You can upload a maximum of ${MAX_IMAGES} images for a variant.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (selectedFiles.length > remainingSlots) {
      await Swal.fire({
        icon: "warning",
        title: "Too many images",
        text: `You can upload only ${remainingSlots} more image(s).`,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const previewsList: PreviewImage[] = [];

      for (const file of selectedFiles) {
        // 1. Type validation
        if (!file.type.startsWith("image/")) {
          await Swal.fire({
            icon: "error",
            title: "Invalid file",
            text: "Only image files are allowed.",
          });
          continue;
        }

        // 2. Size validation (5MB)
        if (file.size > 5 * 1024 * 1024) {
          await Swal.fire({
            icon: "error",
            title: "File too large",
            text: "Each image must be under 5MB.",
          });
          continue;
        }

        // 3. NO COMPRESSION → use original file
        previewsList.push({
          file: file,
          preview: URL.createObjectURL(file),
        });
      }

      setPreviews(previewsList);
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "File processing failed",
        text: "Unable to process selected images.",
      });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.preview));
    };
  }, [previews]);

  const handleUpload = async () => {
    if (!previews.length) return;

    const formData = new FormData();
    previews.forEach((p) => formData.append("images", p.file));

    try {
      setUploading(true);
      await api.post(`/variant/${variantId}/images`, formData);

      previews.forEach((p) => URL.revokeObjectURL(p.preview));
      setPreviews([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchImages();

      await Swal.fire({
        icon: "success",
        title: "Images uploaded",
        text: "Variant images have been uploaded successfully.",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Upload failed",
        text: "Unable to upload images. Please try again.",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId: number) => {
    const confirmed = await confirmDialog({
      title: "Delete image?",
      text: "This action cannot be undone.",
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete",
    });

    if (!confirmed) return;

    try {
      await api.delete(`/variant/images/${imageId}`);
      setImages((prev) => prev.filter((i) => i.image_id !== imageId));

      await Swal.fire({
        icon: "success",
        title: "Deleted",
        text: "Image has been deleted successfully.",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Delete failed",
        text: "Unable to delete image. Please try again.",
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* PAGE HEADER */}
      <div
        className="flex items-center justify-between mb-6 p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Variant <span className="gradient-text-brand">Images</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Upload and manage images for this variant (max {MAX_IMAGES})
          </p>
        </div>

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-gray-200 bg-white text-gray-700 hover:border-[#852BAF] hover:text-[#852BAF] transition-all duration-200 cursor-pointer"
        >
          <FaArrowLeft size={12} /> Back
        </button>
      </div>

      {/* Upload Section */}
      <section className="space-y-4 bg-white rounded-2xl p-6 sm:p-8 vendor-section-card" style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}>
        <SectionHeader
          icon={FaImages}
          title="Upload Images"
          description="Select and upload images for this variant"
        />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2.5 rounded-xl text-white font-semibold hover:opacity-90 active:scale-95 transition cursor-pointer"
              style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 4px 14px rgba(133,43,175,0.28)" }}
            >
              Select Images
            </button>

            <span className="text-sm text-gray-500 font-medium">
              {images.length}/{MAX_IMAGES} uploaded
            </span>
          </div>

          {previews.length > 0 && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="px-6 py-2.5 rounded-xl bg-black text-white font-semibold hover:bg-gray-900 disabled:opacity-60 transition cursor-pointer"
            >
              {uploading ? "Uploading..." : "Upload Selected"}
            </button>
          )}
        </div>
      </section>

      {/* Preview Section */}
      {previews.length > 0 && (
        <section className="mt-4 space-y-4 bg-white rounded-2xl p-6 sm:p-8 vendor-section-card" style={{ border: "1px solid rgba(133,43,175,0.08)" }}>
          <SectionHeader
            icon={FaImages}
            title="Preview Before Upload"
            description="Review selected images"
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {previews.map((p, idx) => (
              <div
                key={idx}
                className="relative rounded-xl overflow-hidden border bg-gray-50"
              >
                <img src={p.preview} className="h-40 w-full object-cover" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Uploaded Images */}
      <section className="mt-8 space-y-4 bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-lg">
        <SectionHeader
          icon={FaImages}
          title="Uploaded Images"
          description="Existing images for this variant"
        />

        {images.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            No images uploaded for this variant yet.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={images.map((i) => i.image_id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                {images.map((img) => (
                  <SortableImage
                    key={img.image_id}
                    img={img}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>
    </div>
  );
}
