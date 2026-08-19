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
