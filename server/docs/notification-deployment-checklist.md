# RM Push Notification Manager: deployment & rollback checklist

Status on 2026-10-30: **not deployed. Do not deploy yet.** Production (`https://rewardplanners.com`)
is an older build: every `/api/crm/v1/rm/notifications/*` route returns 404
("CRM route not found"), and so does `/api/crm/v1/notification/preferences`.

## Gate 0: blockers (all must be true before anything else)
- [ ] **Employee JWT signature fix is deployed to production and verified.** Production most likely
      still contains the unconditional `jwt.decode` fallback (commit 13701b0) in
      `app/common/middlewares/auth.js`. To verify it, someone with authority must approve a forged-token
      test against production, or confirm the deployed commit includes the fix. Until then, deploy
      nothing that widens RM access (Manage Companies) or sends pushes.
- [ ] `ALLOW_UNVERIFIED_DEV_TOKENS` is **absent** from the production environment.
- [ ] Mobile release that creates `reward_planners_updates` and `reward_planners_offers` and requests
      Android 13+ permission is published, or it's accepted that older builds show every category
      on `reward_planners_general` (FCM falls back to the manifest default channel).

## Gate 1: pre-deploy review
- [ ] Code review of the working-tree diff (server and client). Nothing is committed yet.
- [ ] `server`: `npm test` passes (except the known bus-booking SRDV test) and
      `npm run test:rm-assignments:db` passes against a disposable database.
- [ ] `client`: `npm test`, `npx tsc -b`, `npx eslint src/modules/rm/notifications`, `npx vite build`.
- [ ] Migrations for campaign, media, preference and push-token tables are applied in production
      (`migrations/2026102*`). Back up `rewardplanners_db` first.
- [ ] Production env reviewed:
  - `FIREBASE_PROJECT_ID=reward-planners-2324d`.
  - Credentials via ADC or an attached identity. No JSON key files.
  - `NOTIFICATION_TEST_USER_IDS` contains only approved test accounts.
  - `NOTIFICATION_RM_GLOBAL_SENDER_IDS` is empty unless explicitly approved.
- [ ] **Read-only pending-work check in production** before the first start (the worker runs in
      production by default):
      `SELECT campaign_id, status, next_run_at, expires_at FROM notification_campaigns WHERE status IN ('scheduled','sending');`
      and `SELECT COUNT(*) FROM notification_campaign_recipients WHERE status IN ('pending','processing');`.
      Anything due will be processed within a minute of start. Cancel or approve each one.

## Gate 2: deploy
- [ ] Deploy backend first, then the dashboard build.
- [ ] Startup log shows `Firebase Admin credentials verified (project: reward-planners-2324d …)`.
      If you see `Could not reach Google…`, it retries every 60 s. Don't send until it says verified.
- [ ] As an RM: Notification Manager → Settings shows Firebase "Access token obtained" and
      Campaign worker "Running on this server" with a recent "last run".
- [ ] Unauthenticated `GET /api/crm/v1/rm/notifications/meta` returns 401 (not 404). An HR account
      gets 403.
- [ ] Campaign → Delivery check loads (200) for an RM's own campaign. Another RM's campaign returns
      404.

## Gate 3: first send (needs explicit approval of the device and message)
- [ ] One "Send test" to one approved test user. The device shows exactly one `[TEST]` notification.
- [ ] Repeat for foreground, background and killed app. A tap opens the right screen and marks it
      read.

## Rollback
- Backend: redeploy the previous build. The new tables are additive, so leave them in place.
  The old build ignores them.
- Stop RM campaign sending without a redeploy: set `NOTIFICATION_RM_SEND_ENABLED=false` and
  restart. RM campaigns that come due are then closed as `failed` (reason "creator is no longer
  allowed", audited) rather than sent. This does **not** stop admin-created campaigns: cancel those
  from the dashboard. There is no production switch that pauses the worker alone.
- RM-only access (2026-10-30): the whole Push Notification Manager (campaigns, templates,
  company assignments, history, analytics, diagnostics) is controlled by one set,
  `PUSH_NOTIFICATION_MANAGER_ROLES` in `app/common/utils/campaignRules.js`. Reverting it means
  restoring the previous build. The old policy also let admins send, see every campaign and use
  global scope, so a one-line role change is **not** a full rollback. Existing company assignments
  stay. Remove them individually (each removal is audited).
- Dashboard auth now returns 401 (not 403) for invalid or forged tokens across all CRM modules, so
  the client attempts one refresh and then signs out. Database errors during auth go to the error
  handler (503) instead of "Invalid access token".
- Channel mapping: in `notificationPayload.js`, map every category to `operational` to send
  everything on `reward_planners_general` again.
