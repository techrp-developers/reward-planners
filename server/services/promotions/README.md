RM Promotions
=============

Run `node scripts/migrate-rm-promotions.js` from server before deploying. This creates two additive tables and is safe to rerun. Restart the backend after deployment.

The RM-only UI is `/rm/promotions`. Campaigns can target the saved company contact, all active company employees, or selected active employees within that company. Addresses are resolved and deduplicated on the server, then saved with the campaign. Each RM can list and cancel only their own campaigns. Cancellation is available until delivery starts.

Delivery uses the existing MAIL_USER / MAIL_PASS configuration and replies go to the creating RM. Keep RUN_SCHEDULED_JOBS=true (the default). The worker runs every minute, handles up to five due campaigns and 50 recipients per campaign per tick, and uses a MySQL named lock across processes. Scheduling is stored as UTC epoch milliseconds; the UI accepts and displays local time. Overdue pending campaigns resume when the backend restarts.

Sent means SMTP accepted the email, not inbox delivery. Failed emails are not retried automatically. An interrupted in-flight email is marked unknown to avoid duplicate delivery; check the sending mailbox before creating a replacement campaign. Campaigns finish as completed_with_errors when any delivery failed or is unknown. Counts are visible in campaign history. There is no bounce/open/click tracking.

Image uploads use existing R2 storage/CDN configuration and are re-encoded as JPG (maximum 5 MB input). Media links must use HTTPS. Videos/documents are links, not inline playable videos or attachments. Uploaded campaign images are public and retained for delivered email links.

Tests: `node --test tests/rmPromotions.test.js`. Tests mock delivery and never send real email.

The composer supports up to five ordered images, arranged as a row, a column, or a collage (pairs, with a full-width leading image for odd counts). Quill editors above and below the gallery support paragraphs, headings, text sizes, colors, highlights, alignment, and emphasis. The API stores normalized text operations and generates escaped HTML with allowed inline styles, rather than trusting browser HTML. The plain-text alternative is derived on the server. Existing plain-text campaigns remain supported; no additional database migration is needed.
