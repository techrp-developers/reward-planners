# Product cover image processing

Set `POOF_API_KEY=<your actual secret>` in `server/.env`, then restart the backend.
Never put this key in client configuration. Node 18+ with native fetch, FormData,
Blob and AbortController is required (verified locally on Node 22).
Multer, Sharp and express-rate-limit are already dependencies.

Authenticated vendors can POST one static JPG/JPEG, PNG or WebP (up to 10 MB,
36 megapixels) in multipart field `images` to `/product/process-cover-image`.
The route is also mounted at `/api/crm/product/process-cover-image`.
Cookie authentication requires the existing CSRF token; bearer authentication
uses the same rules as product creation.

The service uses @poof-bg/js (official SDK) once with format=png, channels=rgba,
crop=true and padding=0. Sharp trims transparent borders, fits the visible subject
within 1620 x 1620, then adds 90 transparent pixels on every side.
Sharp validates the transparent provider PNG and encodes an exact 1800 x 1800
WebP at quality 90 with alphaQuality 100. Final metadata is validated. No preview is written to R2 or MySQL.

The per-user limit remains 10 attempts per 10 minutes. A separate shared
rolling budget allows at most four provider starts in any 60-second window
across all users. Invalid inputs and missing configuration do not use that
budget; failures after a provider start do. Rejections include Retry-After.
Authenticated vendor IDs must be positive safe integers (numeric strings are
normalized) before rate-limit keys and concurrency locks are used.

Both budgets and locks are in memory. Deploy exactly one cover-processing Node
instance per Poof account to enforce this account-wide limit. Multiple workers,
replicas, restarts, or other applications using the same key require a shared
external rolling-window store/gateway; this implementation does not coordinate
those processes.

The SDK has a 60-second request timeout and no automatic retries. The controller
limits response waiting to 65 seconds. Its timeout does not cover SDK response
body download. The SDK buffers the body before the service checks its 25 MB limit.
A disconnect does not release a lock while processing is still active; ordinary
settlement, including SDK timeout rejection, releases it. Each lock has a
120-second lease so a promise that never settles cannot permanently block the
user. Old promise settlement cannot release a newer request's lock.

The SDK exposes no cancellation for body download. After lease expiry, a hung
original provider request could still be running remotely; the cooldown reduces
unnecessary overlap but cannot guarantee provider cancellation. No client retry
is automatic. Provider requests accepted before disconnect may consume credits.

Errors use { success: false, code, message }. Invalid uploads return 400,
oversized uploads 413, missing configuration/provider credentials 503,
exhausted credits 402, rate limits 429, timeout 504 and upstream failures 502.
Provider response bodies and credentials are never logged.

Frontend integration: request responseType="blob", preview the returned WebP,
and wrap it in a File with type image/webp. Submit that File under `images` to
the existing create/update endpoint. Do not call processing again on submission.
The endpoint does not prove an arbitrary uploaded WebP was processed by Poof;
it preserves any decodable static 1800 x 1800 WebP with an alpha channel.
Direct callers of create/update can bypass frontend-only background removal by
sending original images. Those endpoints do not enforce Poof processing or
consume background-removal credits. This behavior is intentionally unchanged.
Other main image inputs retain the existing resize/quality behavior.
Video, documents, variants, R2 paths and database writes are unchanged.

Test (replace token and input filename):

```sh
curl --fail-with-body \
  -H "Authorization: Bearer $VENDOR_TOKEN" \
  -F 'images=@/absolute/path/product.jpg' \
  http://localhost:5000/product/process-cover-image \
  -o /tmp/product-cover.webp
```

From server/, verify the result:

```sh
node - <<'JS'
const sharp = require('sharp');
(async () => {
  const image = sharp('/tmp/product-cover.webp');
  const m = await image.metadata();
  const s = await image.stats();
  console.log({ format: m.format, width: m.width, height: m.height,
    hasAlpha: m.hasAlpha, isOpaque: s.isOpaque });
  if (m.format !== 'webp' || m.width !== 1800 || m.height !== 1800 ||
      !m.hasAlpha || s.isOpaque) process.exitCode = 1;
})();
JS
```

Expected: webp, 1800, 1800, hasAlpha=true, isOpaque=false.
Check the image against a checkerboard to inspect product edges and centering.
Run `node --test tests/coverImage.test.js` for mocked provider integration tests.


## Free manual fallback

`POST /product/prepare-cover-image` uses the same vendor authentication,
per-user upload limiter, one `images` file, 10 MB limit and 36-megapixel content
validation. It reuses Sharp encoding to return an exact 1800 x 1800 WebP with
transparent outer padding. Transparent inputs are trimmed to visible bounds;
opaque photos retain their background. It makes no Poof call, consumes no
provider request budget or credits, and writes nothing to R2 or MySQL.

ProductAdd defaults to AI Mode. Only a JSON error with HTTP 402 and code
BG_CREDITS_EXHAUSTED opens Manual Mode with the same original File. Network,
authentication, timeout and 429 errors do not trigger exhaustion fallback.
Manual Mode can also be selected before uploading. No automatic Poof retry is
made. Mode state lasts for the mounted form; no cross-process exhaustion cache
was added. Cancel the editor and explicitly choose AI Mode to try renewed credits.

The browser editor supports alpha erase, original-pixel restore, brush size,
zoom, drag panning, four undo/redo steps, reset and a live checkerboard preview.
It caps editing resolution to 1800 pixels on the longest side to bound history
memory; smaller images are not enlarged for editing. Apply exports PNG to the
free endpoint, then stores only its returned WebP in product.productImages.
Selecting a new file clears any old submitted cover. Original photo backgrounds
are not automatically removed by manual preparation; users must erase them or
upload a previously prepared transparent image. The success label says prepared
manually instead of asserting AI removal. Both modes use the existing create
endpoint, R2 storage paths and product_images.image_url.

Automated tests mock the provider and verify alpha edits, fallback classification,
mode switching, replacements, binary manual output and zero manual provider calls.
Pointer/touch interaction, visual edge quality, zoom/pan and live end-to-end
submission should also be checked in a browser; automated tests are not a browser
visual acceptance test.
