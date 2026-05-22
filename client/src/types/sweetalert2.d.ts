declare module "sweetalert2" {
  export type SweetAlertIcon =
    | "warning"
    | "question"
    | "success"
    | "error"
    | "info";

  export interface SweetAlertResult<T = unknown> {
    isConfirmed: boolean;
    value?: T;
  }

  export interface SweetAlertOptions {
    title?: string;
    text?: string;
    icon?: SweetAlertIcon;
    showCancelButton?: boolean;
    confirmButtonText?: string;
    confirmButtonColor?: string;
    cancelButtonText?: string;
    cancelButtonColor?: string;
    reverseButtons?: boolean;
    input?: "textarea";
    inputPlaceholder?: string;
    inputAttributes?: Record<string, string>;
    preConfirm?: (value: unknown) => unknown;
    buttonsStyling?: boolean;
    customClass?: Record<string, string>;
    timer?: number;
    showConfirmButton?: boolean;
  }

  export interface SweetAlertStatic {
    fire<T = unknown>(options: SweetAlertOptions): Promise<SweetAlertResult<T>>;
    showValidationMessage(message: string): void;
  }

  const Swal: SweetAlertStatic;
  export default Swal;
}
