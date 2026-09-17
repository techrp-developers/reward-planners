# XpressBees production configuration

Required environment variables:

```env
XPRESS_EMAIL=your-account-email
XPRESS_PASSWORD=your-account-password
```

Optional production settings:

```env
XPRESS_BASE_URL=https://shipment.xpressbees.com/api
XPRESS_TIMEOUT_MS=15000
RUN_SCHEDULED_JOBS=true
```

Run scheduled jobs on exactly one backend instance. Set
`RUN_SCHEDULED_JOBS=false` on web-only replicas. The cron tasks also prevent
overlap within the scheduler process.

Do not commit credentials. Configure them through the deployment platform's
secret manager or protected environment variables.

## WhatsApp shipment events

The tracking lifecycle enqueues these WhatsApp rule events:

- `order_in_transit`
- `order_place_arriving` (out for delivery)
- `order_place_delivered`
- `cancel_order`

Each event must have an active `wa_rules` entry linked to an active,
Interakt-approved `wa_templates` entry. The templates receive customer name as
`{{1}}` and order reference as `{{2}}`.
