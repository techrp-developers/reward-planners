# Ekart production configuration

Required environment variables:

```env
EKART_CLIENT_ID=client-id-from-ekart-onboarding
EKART_USERNAME=your-api-username
EKART_PASSWORD=your-api-password
```

Optional settings:

```env
EKART_BASE_URL=https://app.elite.ekartlogistics.in
EKART_TIMEOUT_MS=15000
EKART_SERVICE_TYPES=SURFACE,EXPRESS
```

`EKART_SERVICE_TYPES` accepts `SURFACE`, `EXPRESS` or both, comma separated.

## How a courier is chosen

Checkout quotes every enabled provider and uses the cheapest serviceable rate.
Ekart is enabled once its credentials are set; XpressBees is enabled unless
`XPRESS_ENABLED=false`. A provider that errors while quoting is skipped.

XpressBees keeps quoting even when the account cannot be used, so a failing
quote is not a reliable signal. Turn it off with the flag, not by waiting for
errors.

Booking starts with the courier quoted to the customer. After a failure the
next attempt uses the other provider, so a bad provider cannot use up all five
attempts. The customer's shipping charge stays as quoted.

If a booking times out, the courier may have created the shipment anyway. Retries
stop and ops is alerted, because booking elsewhere could ship the order twice.
Check the courier panel before rebooking.

## Customer delivery choice

Customers choose a speed, not a courier brand. Both checkout GET endpoints accept
`delivery_preference` (`cheapest` by default, or `fastest`) and return
`deliveryChoices`:

```json
[
  { "preference": "cheapest", "label": "Standard delivery", "shipping_total": 45,
    "payable_amount": 545, "delivery_days": 7, "estimated_delivery_date": "..." },
  { "preference": "fastest", "label": "Fastest delivery", "shipping_total": 90,
    "payable_amount": 590, "delivery_days": 3, "estimated_delivery_date": "..." }
]
```

Show the entries as options. Send the chosen `delivery_preference` with `POST
cart` or `buy-now`, with `expected_total` set to that entry's `payable_amount`.
Apps that send nothing keep today's cheapest behaviour. Fastest appears only when
it really arrives sooner.

Vendor pickup addresses are registered with Ekart automatically on first
booking, and again if the address changes.
