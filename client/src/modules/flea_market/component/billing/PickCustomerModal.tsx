import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FiSearch, FiX, FiPhone, FiMail } from "react-icons/fi";
import { useDebounce } from "../../../../common/hooks/useDebounce";
import { searchFleaMarketCustomers, type FleaMarketCustomerSearchResult } from "../../api/fleaMarketUsersApi";
import { selectCustomer, getOtpErrorBody, type FleaMarketCustomer } from "../../api/fleaMarketOtpApi";
import Avatar from "../ui/Avatar";
import Spinner from "../ui/Spinner";
import { ErrorState } from "../ui/EmptyState";
import Drawer from "../ui/Drawer";

/* ================= TYPES ================= */

interface PickCustomerModalProps {
  open: boolean;
  // Scopes customer search to the company selected on SchedulePage — carried
  // through BillingPage's router state, not read from any env config.
  companyId: number;
  reason?: string;
  // Fires as soon as a customer is picked from search — no OTP required at
  // this point (see otpService.selectCustomer). The resulting session can
  // build a cart and check out for cash/card, but redemption requires a
  // separate OTP step, handled by VerifyIdentityModal (BillingPage chains
  // straight into it when the pick was triggered by a redeem request).
  onSelected: (customer: FleaMarketCustomer, sessionToken: string) => void;
  onCancel: () => void;
}

const MIN_SEARCH_LENGTH = 3;

/* ================= COMPONENT ================= */
// A popup, not a gate — product search and cart-building never require a
// customer at all (see requireFleaMarketLocation on the backend). This only
// ever shows when something that DOES need a customer was requested: a
// redemption or finalizing checkout.
function PickCustomerModal({ open, companyId, reason, onSelected, onCancel }: PickCustomerModalProps) {
  const [search, setSearch] = useState("");
  const debouncedUserSearch = useDebounce(search, 400);
  const trimmedSearch = debouncedUserSearch.trim();
  const searchEnabled = trimmedSearch.length >= MIN_SEARCH_LENGTH;

  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectError, setSelectError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setHighlightedIndex(0);
    setSelectError("");
  }, [open]);

  /* ================= SEARCH EXISTING CUSTOMERS ================= */
  const {
    data: users = [],
    isFetching: usersLoading,
    error: usersError,
    refetch: retryUsersSearch,
  } = useQuery({
    queryKey: ["flea-market", "customers", "search", companyId, trimmedSearch],
    queryFn: () => searchFleaMarketCustomers(companyId, trimmedSearch),
    enabled: open && searchEnabled,
  });

  useEffect(() => {
    setHighlightedIndex(0);
  }, [trimmedSearch]);

  /* ================= MUTATION: SELECT CUSTOMER ================= */

  const selectCustomerMutation = useMutation({
    mutationFn: (customer: FleaMarketCustomerSearchResult) => selectCustomer(customer.userId),
  });

  const handleSelect = (customer: FleaMarketCustomerSearchResult) => {
    setSelectError("");

    selectCustomerMutation.mutate(customer, {
      onSuccess: (result) => {
        onSelected(result.customer, result.sessionToken);
      },
      onError: (error) => {
        console.error("Failed to select customer:", error);
        const body = getOtpErrorBody(error);
        const message = body?.message || "Unable to select this customer right now. Please try again.";
        setSelectError(message);
        toast.error(message);
      },
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (users.length === 0) return;
      setHighlightedIndex((prev) => (prev + 1) % users.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (users.length === 0) return;
      setHighlightedIndex((prev) => (prev - 1 + users.length) % users.length);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (users.length === 0) return;

      const user = users[highlightedIndex] ?? users[0];
      handleSelect(user);
      return;
    }

    if (e.key === "Escape") {
      setSearch("");
    }
  };

  const showNoResults = !usersLoading && !usersError && searchEnabled && users.length === 0;

  return (
    <Drawer open={open} title="Select Customer" onClose={onCancel}>
      {reason && (
        <div className="flex items-center gap-2 p-3 mb-4 text-sm text-amber-700 border border-amber-200 rounded-xl bg-amber-50">
          {reason}
        </div>
      )}

      {/* Search Field */}
      <div
        className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl bg-white
        border border-slate-200 shadow-sm transition-all duration-300
        focus-within:border-transparent focus-within:ring-4 focus-within:ring-[#852BAF]/15"
      >
        <FiSearch className="w-5 h-5 text-gray-400 shrink-0" />
        <input
          type="text"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by name, mobile number or email"
          className="w-full text-gray-800 bg-transparent outline-none placeholder:text-gray-400"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 shrink-0">
            <FiX className="w-4 h-4" />
          </button>
        )}
      </div>

      {search.trim().length > 0 && search.trim().length < MIN_SEARCH_LENGTH && (
        <p className="mt-2 text-xs text-gray-400">Type at least {MIN_SEARCH_LENGTH} characters to search.</p>
      )}

      {users.length > 0 && <p className="mt-2 text-xs text-gray-400">Use ↑ ↓ to navigate, Enter to select.</p>}

      {selectError && <ErrorState className="mt-3" message={selectError} />}

      {/* Results */}
      <div className="mt-4 space-y-2">
        {usersLoading && (
          <div className="py-6">
            <Spinner label="Searching customers..." />
          </div>
        )}

        {!usersLoading && usersError && (
          <ErrorState message="Unable to load customers right now." onRetry={() => void retryUsersSearch()} />
        )}

        {!usersLoading &&
          !usersError &&
          users.map((user, index) => {
            const isHighlighted = index === highlightedIndex;
            const isSelecting = selectCustomerMutation.isPending && selectCustomerMutation.variables?.userId === user.userId;

            return (
              <button
                key={user.userId}
                type="button"
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => handleSelect(user)}
                disabled={selectCustomerMutation.isPending}
                className={`flex items-center justify-between w-full gap-4 p-3 text-left transition-colors border rounded-xl disabled:opacity-60 ${
                  isHighlighted
                    ? "bg-gradient-to-r from-[#852BAF]/10 to-[#FC3F78]/10 border-purple-200"
                    : "border-gray-100 hover:bg-gray-50 hover:border-purple-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={user.name} />
                  <div>
                    <p className="text-sm font-bold text-gray-800">{user.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                      {user.phone && (
                        <span className="flex items-center gap-1">
                          <FiPhone className="w-3 h-3" />
                          {user.phone}
                        </span>
                      )}
                      {user.email && (
                        <span className="flex items-center gap-1">
                          <FiMail className="w-3 h-3" />
                          {user.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {isSelecting && <Spinner />}
              </button>
            );
          })}

        {showNoResults && (
          <p className="py-6 text-sm text-center text-gray-500">No customer found for "{trimmedSearch}".</p>
        )}
      </div>
    </Drawer>
  );
}

export default PickCustomerModal;
