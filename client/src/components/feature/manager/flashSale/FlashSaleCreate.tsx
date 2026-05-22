import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../api/api";
import "./css/flashsalecreate.css";
import { Link } from "react-router-dom";
import {  ArrowLeft } from "lucide-react";
import Swal from "sweetalert2";


const API_BASEIMAGE_URL = "https://rewardplanners.com/api/crm";

const FlashSaleForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [bannerPreview, setBannerPreview] = useState<string>("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchFlashSale = async () => {
      if (isEdit && id) {
        const res = await api.get(`/flash/flash-sale/${id}`);
        const data = res.data.data;

        setTitle(data.title);
        setStartAt(data.start_at?.slice(0, 16));
        setEndAt(data.end_at?.slice(0, 16));

        if (data.banner_image) {
          setBannerPreview(
            `${API_BASEIMAGE_URL}/uploads/flash-banners/${data.banner_image}`,
          );
        }
      }
    };

    fetchFlashSale();
  }, [id, isEdit]);

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBannerFile(e.target.files[0]);
      setBannerPreview(URL.createObjectURL(e.target.files[0]));
    }
  };

  const handleSubmit = async () => {
  // Validation
  if (!title || !startAt || !endAt) {
    Swal.fire({
      icon: "warning",
      title: "Missing Fields",
      text: "Please fill all required fields.",
      confirmButtonColor: "#852BAF",
    });
    return;
  }

  if (!isEdit && !bannerFile) {
    Swal.fire({
      icon: "warning",
      title: "Banner Required",
      text: "Please upload a banner image.",
      confirmButtonColor: "#852BAF",
    });
    return;
  }

  // Confirmation Popup
  const confirmResult = await Swal.fire({
    title: isEdit ? "Update Flash Sale?" : "Create Flash Sale?",
    text: "Please confirm to continue.",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#852BAF",
    cancelButtonColor: "#d33",
    confirmButtonText: "Yes, Continue",
  });

  if (!confirmResult.isConfirmed) return;

  const formData = new FormData();
  formData.append("title", title);
  formData.append("start_at", startAt);
  formData.append("end_at", endAt);

  if (bannerFile) {
    formData.append("banner_image", bannerFile);
  }

  try {
    setLoading(true);

    let res;

    if (isEdit && id) {
      res = await api.put(`/flash/flash-sale/${id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } else {
      res = await api.post(`/flash/flash-sale`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }

    await Swal.fire({
      icon: "success",
      title: "Success!",
      text: isEdit
        ? "Flash sale updated successfully."
        : "Flash sale created successfully.",
      confirmButtonColor: "#852BAF",
    });

    navigate(`/manager/flash-variants/${res.data.flash_id}`);
  } catch (err) {
    console.error("Save failed", err);

    Swal.fire({
      icon: "error",
      title: "Failed!",
      text: "Something went wrong. Please try again.",
      confirmButtonColor: "#852BAF",
    });
  } finally {
    setLoading(false);
  }
};


  return (
  <div className="flex items-center justify-center min-h-screen">
  <div className="w-full p-8 bg-white shadow-2xl rounded-2xl">

    {/* ✅ Header (Icon + Title + Subtitle) + Back Button Right */}
    <div className="flex items-start justify-between gap-4 mb-8">
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center
                bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
                shadow-lg shadow-purple-300/40
                transition  hover:shadow-xl"
        >
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
          </svg>
        </div>

        <div>
          <h2 className="text-3xl font-extrabold leading-tight text-gray-900">
            {isEdit ? "Edit Flash Sale" : "Create Flash Sale"}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage banner, schedule timing, and publish your flash sale
          </p>
        </div>
      </div>

      {/* ✅ Back Button Right Side */}
      <Link
  to="/manager/flashlist"
  className="inline-flex items-center gap-2 text-sm font-semibold
             bg-[#852BAF] text-white
             px-4 py-2 rounded-md
             shadow-md shadow-[#852BAF]/25
             hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
             active:scale-95 transition mt-1"
>
  <ArrowLeft size={16} />
  Back
</Link>

    </div>

    {/* Title */}
    <div className="mb-6">
      <label className="block mb-2 text-sm font-semibold text-gray-600">
        Flash Sale Title
      </label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="eg. Diwali Mega Offer"
        className="w-full px-4 py-3 text-sm transition duration-200 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
      />
    </div>

    {/* Date Row */}
    <div className="grid gap-6 mb-6 md:grid-cols-2">
      <div>
        <label className="block mb-2 text-sm font-semibold text-gray-600">
          Start Time
        </label>
        <input
          type="datetime-local"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          className="w-full px-4 py-3 text-sm transition duration-200 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
        />
      </div>

      <div>
        <label className="block mb-2 text-sm font-semibold text-gray-600">
          End Time
        </label>
        <input
          type="datetime-local"
          value={endAt}
          onChange={(e) => setEndAt(e.target.value)}
          className="w-full px-4 py-3 text-sm transition duration-200 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
        />
      </div>
    </div>

    {/* Banner Upload */}
    <div className="mb-6">
      <label className="block mb-2 text-sm font-semibold text-gray-600">
        Banner Image
      </label>

      <label
        className="flex flex-col items-center justify-center w-full p-6 transition duration-200 border-2 border-gray-300 border-dashed cursor-pointer rounded-xl hover:border-purple-400 hover:bg-purple-50"
      >
        <input type="file" onChange={handleBannerChange} className="hidden" />

        <span className="text-sm text-gray-500">Click to upload banner</span>
      </label>
    </div>

    {/* Preview */}
    {bannerPreview && (
      <div className="mb-6">
        <div className="overflow-hidden border shadow-md rounded-xl">
          <img src={bannerPreview} alt="preview" className="object-cover w-full h-48" />
        </div>
      </div>
    )}

    {/* Submit */}
    <button
  onClick={handleSubmit}
  disabled={loading}
  className="flex items-center justify-center w-full px-6 py-3 text-sm font-semibold text-white
         rounded-full transition-all duration-300 cursor-pointer
         bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
         hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
         shadow-lg shadow-[#852BAF]/25 hover:shadow-xl
         active:scale-95
         disabled:opacity-60 disabled:cursor-not-allowed"
>
  {loading ? "Saving..." : "Save & Manage Variants"}
</button>


  </div>
</div>


  );
};

export default FlashSaleForm;
