# Public app release settings

The Express route is `/v1/settings/app-settings`, mounted through
`server/app.js` and `routes/indexRoute.js` in this directory. The deployed public
URL is `https://rewardplanners.com/api/crm/v1/settings/app-settings`.
`routes/settingRoute.js` calls `controller/settingController.js`, which queries
the shared MySQL pool directly. There is no separate service or model.

GET remains public and returns the existing `{ success: true, data: {...} }`
response, including all Android, iOS, maintenance and company fields.
GET and updates select the lowest-ID row from `app_settings`.

PATCH and PUT on the same path require an authenticated, verified `admin` using
the existing authentication middleware. Bearer access tokens are accepted;
cookie authentication also requires the existing CSRF token for writes.
Both methods support partial updates. To update only iOS, send only
`ios_version`, `ios_version_code`, and `ios_force_update`.

Use the version and build of the confirmed public App Store release. Local
Xcode and TestFlight versions are not evidence of a public release. No automatic
App Store lookup or version promotion occurs. No stored values were changed by
this implementation.

`ios_version` is a non-null numeric dotted string with one to three components
and a maximum of 20 characters (for example `6.2` or `6.2.1`). Build numbers
must be integers from 1 to 2147483647, matching the existing signed MySQL INT.
Digit-only build strings are accepted and stored as integers, allowing callers
to pass DeviceInfo.getBuildNumber() values. GET returns the version as a string
and build as a number; the app should compare version components numerically
and convert its installed build string to a number for build comparisons.
An existing legacy build value of 0 remains readable until explicitly updated.

## SQL for the existing schema

Verified local schema: `ios_version VARCHAR(20)`, `ios_version_code INT(11)`,
`ios_force_update TINYINT(1)`. No migration is required.

```sql
SHOW COLUMNS FROM app_settings;
SELECT id, ios_version, ios_version_code, ios_force_update
FROM app_settings ORDER BY id ASC LIMIT 1;
```

Only if **6.2 / build 1 is confirmed publicly released**, this is the exact update
for the existing row with ID 1. It does not update Android or company fields
(MySQL automatically advances `updated_at`):

```sql
UPDATE app_settings
SET ios_version = '6.2',
    ios_version_code = 1,
    ios_force_update = 0
WHERE id = 1;
```

Equivalent authenticated PATCH body, under the same release condition:

```json
{"ios_version":"6.2","ios_version_code":1,"ios_force_update":0}
```

For future releases substitute the actual publicly released version and build;
do not assume build numbers simply increment by one. Omitted settings remain
unchanged. No Home Screen badge behavior is implemented by this endpoint.

Run isolated HTTP tests with a mocked MySQL pool and real authentication middleware:
`node --test tests/appSettings.test.js` from `server`.
