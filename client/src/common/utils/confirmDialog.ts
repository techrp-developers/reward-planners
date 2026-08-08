import Swal from "sweetalert2";

export interface ConfirmDialogOptions {
  title: string;
  text?: string;
  icon?: "warning" | "question" | "success" | "error" | "info";
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmButtonColor?: string;
  cancelButtonColor?: string;
  reverseButtons?: boolean;
  customClass?: { popup?: string };
}

export async function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  const { icon = "warning", ...rest } = options;
  const result = await Swal.fire({
    icon,
    showCancelButton: true,
    ...rest,
  });
  return result.isConfirmed;
}
