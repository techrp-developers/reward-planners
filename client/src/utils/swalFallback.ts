type AlertIcon = "warning" | "question" | "success" | "error" | "info";

interface AlertOptions {
  title?: string;
  text?: string;
  icon?: AlertIcon;
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

interface AlertResult<T = unknown> {
  isConfirmed: boolean;
  value?: T;
}

const swalFallback = {
  async fire<T = unknown>(options: AlertOptions): Promise<AlertResult<T>> {
    const title = options.title ?? "";
    const text = options.text ?? "";

    if (options.input === "textarea") {
      const value = window.prompt([title, text, options.inputPlaceholder ?? ""].filter(Boolean).join("\n\n")) ?? "";
      const preConfirmResult = options.preConfirm ? options.preConfirm(value) : value;
      if (preConfirmResult === false) {
        return { isConfirmed: false };
      }
      if (options.showCancelButton) {
        const confirmed = window.confirm(options.confirmButtonText ?? "Confirm");
        return confirmed
          ? { isConfirmed: true, value: (value as T) }
          : { isConfirmed: false };
      }
      return { isConfirmed: true, value: (value as T) };
    }

    if (options.showCancelButton) {
      const confirmed = window.confirm([title, text].filter(Boolean).join("\n\n"));
      return confirmed ? { isConfirmed: true } : { isConfirmed: false };
    }

    if (options.showConfirmButton === false && options.timer) {
      return { isConfirmed: true };
    }

    window.alert([title, text].filter(Boolean).join("\n\n"));
    return { isConfirmed: true };
  },

  showValidationMessage(message: string) {
    window.alert(message);
  },
};

export default swalFallback;
