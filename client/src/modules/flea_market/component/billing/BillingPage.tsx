import { useCallback, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiAward,
  FiCheckCircle,
  FiCreditCard,
  FiDollarSign,
  FiMapPin,
  FiSmartphone,
} from "react-icons/fi";
import { routes } from "../../../../routes";
import { SessionExpiredError, setFleaMarketLocationId, setFleaMarketSessionToken } from "../../api/fleaMarketClient";
import type { FleaMarketCustomer } from "../../api/fleaMarketOtpApi";
import type { FleaMarketProduct } from "../../api/fleaMarketProductsApi";
import { fetchRewardEligibility } from "../../api/fleaMarketRewardApi";
import { describeScanError, resolveScannedBarcode } from "../../api/fleaMarketScanApi";
import {
  checkout,
  generateIdempotencyKey,
  getCheckoutErrorBody,
  type CheckoutResult,
} from "../../api/fleaMarketCheckoutApi";
import { maskEmail, maskPhone } from "../../utils/mask";
import { clampCartLines, getCartTotals, updateLinePoints, type CartLine } from "../../utils/cartMath";
import CustomerVerify from "./CustomerVerify";
import ProductSearch from "./ProductSearch";
import Cart from "./Cart";
import InvoiceView from "./InvoiceView";
import SectionCard from "../ui/SectionCard";
import Avatar from "../ui/Avatar";
import { ErrorState } from "../ui/EmptyState";

// Passed via router state from SchedulePage's "Start Billing" button — never
// from a URL query param, so raw ids aren't exposed in a shareable link.
interface BillingRouteState {
  companyId: number;
  companyName: string;
  locationId: number;
  locationName: string;
  scheduleId: number;
}

/* ================= CONSTANTS ================= */

// How long an OTP-verified session stays valid before the operator must
// re-verify the customer to keep billing — fraud guard against a stale
// session completing checkout for the wrong person. Matches the backend's
// SESSION_TTL_MINUTES; the backend also slides this forward on every
// authenticated request, so bumpSessionExpiry() mirrors that locally.
const SESSION_TTL_MS = 15 * 60 * 1000;
const SESSION_WARNING_MS = 60 * 1000;

// Payment mode is operator-facing only — the backend has no concept of it
// (no column to store it), it just helps the operator remember how much
// cash/card/UPI to collect for the non-points portion of the bill.
type PaymentMode = "cash" | "card" | "upi";

const PAYMENT_MODE_OPTIONS: {
  value: PaymentMode;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { value: "cash", label: "Cash", Icon: FiDollarSign },
  { value: "card", label: "Card", Icon: FiCreditCard },
  { value: "upi", label: "UPI", Icon: FiSmartphone },
];

type BillingStage = "billing" | "invoice";

/* ================= COMPONENT ================= */

function BillingPage() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const billingState = (routerLocation.state as BillingRouteState | null) ?? null;

  const [customer, setCustomer] = useState<FleaMarketCustomer | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [needsReverify, setNeedsReverify] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);

  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  // Generated once per checkout ATTEMPT and reused across retries so the
  // backend's idempotency check actually dedupes — only reset on success or
  // when starting a genuinely new bill.
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateIdempotencyKey());

  const [stage, setStage] = useState<BillingStage>("billing");
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);

  /* ================= LOCATION (from router state, set by SchedulePage) ================= */

  useEffect(() => {
    if (!billingState) {
      navigate(routes.fleaMarket.manageEvent, {
        replace: true,
        state: { message: "Select a company and location to start billing." },
      });
      return;
    }

    setFleaMarketLocationId(billingState.locationId);

    return () => {
      setFleaMarketLocationId(null);
    };
  }, [billingState, navigate]);

  const bumpSessionExpiry = useCallback(() => {
    setSessionExpiresAt(Date.now() + SESSION_TTL_MS);
    setSessionWarning(false);
  }, []);

  // Central handler for the interceptor's typed SessionExpiredError, wherever
  // it's caught (product search, reward-eligibility fetch, checkout) — drops
  // the UI back into CustomerVerify's reverify mode instead of a dead end.
  const handleSessionExpired = useCallback(() => {
    setNeedsReverify(true);
    setSessionToken(null);
    setFleaMarketSessionToken(null);
    setAwaitingPayment(false);
    setSessionWarning(false);
  }, []);

  /* ================= SESSION EXPIRY WATCH ================= */
  // Prompts re-verification instead of letting a stale/unverified session
  // complete checkout — the operator can keep the same cart, they just need
  // to re-confirm the customer's identity via OTP. Warns ~1 minute before
  // expiry so a 401 mid-checkout isn't the first sign of trouble.
  useEffect(() => {
    if (!sessionToken || !sessionExpiresAt) return;

    const id = setInterval(() => {
      const remaining = sessionExpiresAt - Date.now();

      if (remaining <= 0) {
        handleSessionExpired();
      } else if (remaining <= SESSION_WARNING_MS) {
        setSessionWarning(true);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [sessionToken, sessionExpiresAt, handleSessionExpired]);

  /* ================= HANDLERS: CUSTOMER ================= */

  const handleVerified = useCallback((verifiedCustomer: FleaMarketCustomer, token: string) => {
    setCustomer(verifiedCustomer);
    setSessionToken(token);
    setFleaMarketSessionToken(token);
    setSessionExpiresAt(Date.now() + SESSION_TTL_MS);
    setSessionWarning(false);
    setNeedsReverify(false);
    setCheckoutError("");
  }, []);

  const resetJourney = useCallback(() => {
    setCustomer(null);
    setSessionToken(null);
    setFleaMarketSessionToken(null);
    setSessionExpiresAt(null);
    setNeedsReverify(false);
    setSessionWarning(false);
    setCartLines([]);
    setStage("billing");
    setAwaitingPayment(false);
    setCheckoutError("");
    setCheckoutResult(null);
    setPaymentMode("cash");
    setIdempotencyKey(generateIdempotencyKey());
  }, []);

  const handleChangeCustomer = useCallback(() => {
    if (cartLines.length > 0) {
      const confirmed = window.confirm("Changing the customer will clear the current cart. Continue?");
      if (!confirmed) return;
    }
    resetJourney();
  }, [cartLines.length, resetJourney]);

  /* ================= HANDLERS: CART ================= */
  // showCustomerVerify (guarded via early return below) guarantees `customer`
  // is set whenever these run, so `.walletBalance` is always a real balance.

  const handleProductSelected = useCallback(async (product: FleaMarketProduct) => {
    if (!customer) return;

    const existingIndex = cartLines.findIndex((line) => line.product.variantId === product.variantId);

    if (existingIndex >= 0) {
      setCartLines((prev) =>
        clampCartLines(
          prev.map((line) =>
            line.product.variantId === product.variantId ? { ...line, quantity: line.quantity + 1 } : line,
          ),
          customer.walletBalance,
        ),
      );
      return;
    }

    // New line: always fetch reward eligibility fresh — never reuse a stale
    // value from an earlier addition, since reward rules can be time-bound
    // or promotional. The line renders as non-redeemable while this loads.
    setCartLines((prev) => [
      ...prev,
      { product, quantity: 1, pointsApplied: 0, maxRedeemablePoints: 0, canRedeem: false, eligibilityLoading: true },
    ]);

    try {
      const eligibility = await fetchRewardEligibility(product.variantId);
      bumpSessionExpiry();

      setCartLines((prev) =>
        clampCartLines(
          prev.map((line) =>
            line.product.variantId === product.variantId
              ? {
                  ...line,
                  maxRedeemablePoints: eligibility.maxRedeemablePoints,
                  canRedeem: eligibility.canRedeem,
                  eligibilityLoading: false,
                }
              : line,
          ),
          customer.walletBalance,
        ),
      );
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        handleSessionExpired();
        return;
      }

      console.error("Failed to fetch reward eligibility:", error);
      setCartLines((prev) =>
        prev.map((line) =>
          line.product.variantId === product.variantId
            ? { ...line, eligibilityLoading: false, canRedeem: false, maxRedeemablePoints: 0 }
            : line,
        ),
      );
    }
  }, [customer, cartLines, bumpSessionExpiry, handleSessionExpired]);

  const handleIncrement = useCallback(
    (variantId: number) => {
      if (!customer) return;

      setCartLines((prev) =>
        clampCartLines(
          prev.map((line) => (line.product.variantId === variantId ? { ...line, quantity: line.quantity + 1 } : line)),
          customer.walletBalance,
        ),
      );
    },
    [customer],
  );

  const handleDecrement = useCallback(
    (variantId: number) => {
      if (!customer) return;

      setCartLines((prev) =>
        clampCartLines(
          prev
            .map((line) => (line.product.variantId === variantId ? { ...line, quantity: line.quantity - 1 } : line))
            .filter((line) => line.quantity > 0),
          customer.walletBalance,
        ),
      );
    },
    [customer],
  );

  const handleRemove = useCallback((variantId: number) => {
    setCartLines((prev) => prev.filter((line) => line.product.variantId !== variantId));
  }, []);

  const handlePointsChange = useCallback(
    (variantId: number, rawValue: number) => {
      if (!customer) return;
      setCartLines((prev) => updateLinePoints(prev, variantId, rawValue, customer.walletBalance));
    },
    [customer],
  );

  /* ================= HANDLERS: CHECKOUT / PAYMENT ================= */

  const isSessionValid = useCallback(
    () => Boolean(sessionToken) && Boolean(sessionExpiresAt) && Date.now() < (sessionExpiresAt ?? 0),
    [sessionToken, sessionExpiresAt],
  );

  const checkoutMutation = useMutation({
    mutationFn: (payload: { items: { variantId: number; qty: number; pointsApplied: number }[]; key: string }) =>
      checkout(payload.items, payload.key),
  });

  const performCheckout = useCallback(() => {
    if (!customer || !sessionToken) return;

    if (!isSessionValid()) {
      handleSessionExpired();
      return;
    }

    setCheckoutError("");

    checkoutMutation.mutate(
      {
        items: cartLines.map((line) => ({
          variantId: line.product.variantId,
          qty: line.quantity,
          pointsApplied: line.pointsApplied,
        })),
        key: idempotencyKey,
      },
      {
        onSuccess: (result) => {
          setCheckoutResult(result);
          setAwaitingPayment(false);
          setStage("invoice");
          // Success — the NEXT bill needs a fresh idempotency key, not this one.
          setIdempotencyKey(generateIdempotencyKey());
          toast.success(
            result.invoices.length > 1
              ? `Checkout complete — ${result.invoices.length} invoices generated`
              : "Checkout complete",
          );
        },
        onError: (error) => {
          if (error instanceof SessionExpiredError) {
            handleSessionExpired();
            return;
          }

          console.error("Checkout failed:", error);
          const body = getCheckoutErrorBody(error);
          // idempotencyKey is intentionally left unchanged — a "Try Again" retry
          // must reuse it or the backend's duplicate-prevention is useless.
          const message = body?.message || "Checkout failed. Please try again.";
          setCheckoutError(message);
          toast.error(message);
        },
      },
    );
  }, [customer, sessionToken, isSessionValid, handleSessionExpired, cartLines, idempotencyKey, checkoutMutation]);

  const handleCheckoutClick = useCallback(() => {
    if (!customer || !sessionToken) return;

    if (!isSessionValid()) {
      handleSessionExpired();
      return;
    }

    setCheckoutError("");
    const { finalPayable } = getCartTotals(cartLines);

    if (finalPayable > 0) {
      setAwaitingPayment(true);
      return;
    }

    // Fully covered by reward points — nothing to collect at a gateway.
    performCheckout();
  }, [customer, sessionToken, isSessionValid, handleSessionExpired, cartLines, performCheckout]);

  const handleStartNewBill = useCallback(() => {
    resetJourney();
  }, [resetJourney]);

  // Stable wrapper so ProductSearch (memoized) doesn't re-render on every
  // BillingPage render just because this async handler got a fresh identity.
  const handleProductSelectedVoid = useCallback(
    (product: FleaMarketProduct) => {
      void handleProductSelected(product);
    },
    [handleProductSelected],
  );

  /* ================= HANDLERS: BARCODE SCANNER ================= */
  // Only meaningful while actively building a cart — not during customer
  // verification, payment collection, or the post-checkout invoice view.
  const scanningEnabled = Boolean(customer && sessionToken && !needsReverify && stage === "billing" && !awaitingPayment);

  useEffect(() => {
    if (!scanningEnabled) return;

    let buffer = "";
    let lastKeyTime = 0;

    const handleScannedCode = (code: string) => {
      if (!code.startsWith("FMA-")) return; // ignore barcodes from other systems

      resolveScannedBarcode(code)
        .then((product) => {
          handleProductSelectedVoid(product);
          toast.success(`Scanned: ${product.name}`);
        })
        .catch((error) => {
          if (error instanceof SessionExpiredError) {
            handleSessionExpired();
            return;
          }
          // A failed scan must be visible — silently doing nothing leaves the
          // operator unsure whether the scan registered at all.
          toast.error(describeScanError(error));
        });
    };

    // HID scanners "type" a barcode + Enter far faster than a human (<50ms
    // between characters) — a pause resets the buffer so genuine fast human
    // typing into a real input field elsewhere on the page doesn't get
    // misread as a scan. Listens at the window level since scanners fire
    // keydown wherever focus happens to be, not just inside a specific field.
    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      if (now - lastKeyTime > 50 && buffer.length > 0) {
        buffer = "";
      }
      lastKeyTime = now;

      if (event.key === "Enter") {
        if (buffer.length > 3) {
          handleScannedCode(buffer);
        }
        buffer = "";
        return;
      }
      if (event.key.length === 1) {
        buffer += event.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scanningEnabled, handleProductSelectedVoid, handleSessionExpired]);

  /* ================= RENDER: STAGE 0 (no router state — redirecting) ================= */

  if (!billingState) {
    return null;
  }

  /* ================= RENDER: STAGE 1 (unverified / expired) ================= */

  if (!customer || !sessionToken || needsReverify) {
    return (
      <CustomerVerify
        companyId={billingState.companyId}
        onVerified={handleVerified}
        reverifyCustomer={needsReverify ? customer : null}
        reverifyReason={
          needsReverify ? "Your session expired. Please re-verify to continue billing this customer." : undefined
        }
        onCancelReverify={handleChangeCustomer}
      />
    );
  }

  /* ================= RENDER: STAGE 3 (invoice) ================= */

  if (stage === "invoice" && checkoutResult) {
    return (
      <InvoiceView
        invoices={checkoutResult.invoices}
        totalPointsRedeemed={checkoutResult.totalPointsRedeemed}
        totalAmountPaid={checkoutResult.totalAmountPaid}
        newWalletBalance={checkoutResult.newWalletBalance}
        customer={{ name: customer.name, phone: customer.phone, email: customer.email }}
        onStartNewBill={handleStartNewBill}
      />
    );
  }

  /* ================= RENDER: STAGE 2 (cart / payment) ================= */

  const { finalPayable } = getCartTotals(cartLines);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
        <FiMapPin className="w-3.5 h-3.5" />
        Billing for {billingState.companyName} · {billingState.locationName}
      </div>

      {sessionWarning && (
        <div className="flex items-center gap-2 p-3 text-sm text-amber-800 border border-amber-200 rounded-xl bg-amber-50">
          <FiAlertCircle className="w-4 h-4 shrink-0" />
          Session expiring soon — complete checkout or re-verify the customer.
        </div>
      )}

      {/* Confirmed customer bar */}
      <div className="flex items-center justify-between gap-4 p-4 bg-white border border-gray-100 shadow-md rounded-2xl">
        <div className="flex items-center gap-3">
          <Avatar name={customer.name} size="md" variant="brand" />
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
              {customer.name}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                <FiCheckCircle className="w-3 h-3" />
                Verified
              </span>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {customer.phone ? maskPhone(customer.phone) : "No phone"} ·{" "}
              {customer.email ? maskEmail(customer.email) : "No email"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 text-sm font-bold text-amber-600">
              <FiAward className="w-4 h-4" />
              {customer.walletBalance}
            </p>
            <p className="text-[11px] text-gray-400">Reward points</p>
          </div>
          <button
            type="button"
            onClick={handleChangeCustomer}
            className="flex items-center gap-1 text-sm font-bold text-purple-600 transition-colors hover:text-purple-800"
          >
            <FiArrowLeft className="w-4 h-4" />
            Change Customer
          </button>
        </div>
      </div>

      {awaitingPayment ? (
        <SectionCard
          icon={FiCreditCard}
          title="Collect Payment"
          subtitle={`Amount payable beyond redeemed points: ₹${finalPayable.toLocaleString()}`}
        >
          <div className="grid grid-cols-3 gap-3">
            {PAYMENT_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPaymentMode(option.value)}
                className={`flex flex-col items-center gap-2 p-4 border rounded-xl transition-colors ${
                  paymentMode === option.value
                    ? "border-purple-300 bg-gradient-to-r from-[#852BAF]/10 to-[#FC3F78]/10"
                    : "border-gray-100 hover:bg-gray-50"
                }`}
              >
                <option.Icon className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-bold text-gray-800">{option.label}</span>
              </button>
            ))}
          </div>

          {checkoutError && <ErrorState className="mt-4" message={checkoutError} />}

          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={() => setAwaitingPayment(false)}
              disabled={checkoutMutation.isPending}
              className="flex-1 py-2.5 text-sm font-bold text-gray-700 transition-colors border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-60"
            >
              Back to Cart
            </button>
            <button
              type="button"
              onClick={performCheckout}
              disabled={checkoutMutation.isPending}
              className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60"
            >
              {checkoutMutation.isPending ? "Processing Payment..." : `Confirm Payment · ₹${finalPayable.toLocaleString()}`}
            </button>
          </div>
        </SectionCard>
      ) : (
        <>
          <ProductSearch onProductSelected={handleProductSelectedVoid} onSessionExpired={handleSessionExpired} />

          <Cart
            customer={customer}
            lines={cartLines}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            onRemove={handleRemove}
            onPointsChange={handlePointsChange}
            onCheckout={handleCheckoutClick}
            checkingOut={checkoutMutation.isPending}
            checkoutError={checkoutError}
          />
        </>
      )}
    </div>
  );
}

export default BillingPage;
