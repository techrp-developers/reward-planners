import type { IconType } from "react-icons";

interface Props {
  title: string;
  description: string;
  Icon: IconType;
}

export default function ComingSoon({ title, description, Icon }: Props) {
  return (
    <div className="max-w-3xl mx-auto py-24 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white"
        style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
      >
        <Icon size={26} />
      </div>
      <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-gray-400 font-medium">{description}</p>
      <p
        className="mt-6 inline-block px-4 py-2 rounded-xl text-xs font-bold"
        style={{ background: "rgba(133,43,175,0.07)", color: "#852BAF" }}
      >
        Coming soon
      </p>
    </div>
  );
}
