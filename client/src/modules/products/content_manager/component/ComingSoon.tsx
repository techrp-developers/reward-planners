import { FiTool } from "react-icons/fi";

export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-3xl border border-purple-100 bg-white p-10 text-center shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
      <div className="rounded-2xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] p-4 shadow-lg">
        <FiTool className="h-8 w-8 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900">{title} Content</h1>
      <p className="max-w-md text-sm text-gray-500">
        This zone reuses the same Content Management layout as Product and will be enabled here once finalized.
      </p>
    </div>
  );
}
