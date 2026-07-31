import { useEffect, useRef } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";

type Props = {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  readOnly?: boolean;
};

export default function QuillEditor({
  value,
  onChange,
  placeholder = "",
  minHeight = 220,
  readOnly = false,
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);

  useEffect(() => {
    if (!editorRef.current || quillRef.current) return;

    quillRef.current = new Quill(editorRef.current, {
      theme: "snow",
      placeholder,
      readOnly,
      modules: readOnly
        ? { toolbar: false }
        : {
            toolbar: [
              [{ header: [1, 2, 3, false] }],
              ["bold", "italic", "underline"],
              [{ list: "ordered" }, { list: "bullet" }],
              ["link"],
              ["clean"],
            ],
          },
    });

    //  FORCE LTR — THIS FIXES REVERSED TYPING
    const editor = quillRef.current;

    editor.root.setAttribute("dir", "ltr");
    editor.root.style.direction = "ltr";
    editor.root.style.textAlign = "left";
    editor.root.style.unicodeBidi = "plaintext";
    editor.root.style.minHeight = `${minHeight}px`;

    if (onChange) {
      quillRef.current.on("text-change", () => {
        onChange(quillRef.current!.root.innerHTML);
      });
    }

    quillRef.current.root.style.minHeight = `${minHeight}px`;
  }, [onChange, placeholder, minHeight, readOnly]);

  useEffect(() => {
    if (!quillRef.current) return;

    const editor = quillRef.current;
    const currentHTML = editor.root.innerHTML;

    //  Only update if value actually changed externally
    if (value !== currentHTML) {
      const selection = editor.getSelection();
      editor.root.innerHTML = value || "";

      if (selection) {
        editor.setSelection(selection.index, selection.length);
      }
    }
  }, [value]);

  return (
    <div dir="ltr" className="bg-white border border-gray-300 rounded-lg">
      <div ref={editorRef} />
    </div>
  );
}
