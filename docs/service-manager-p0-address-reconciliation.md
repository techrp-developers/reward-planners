# Historical service addresses — reconciliation report

Local read-only investigation, 17 November 2026. No orders, address links or historical addresses were changed.

There are **91 orders referencing ten absent customer_addresses records**. The order-level manifest is `server/files/service-manager-p0/address-orphans.csv` (private, gitignored). It includes order ID/reference, parent order reference, customer ID, missing address ID, creation date and reconciliation status. These orders date from June/July 2026.

| Missing address ID | Orders |
| --- | ---: |
| 1 | 24 |
| 3 | 1 |
| 7 | 10 |
| 20 | 13 |
| 30 | 2 |
| 31 | 1 |
| 43 | 5 |
| 48 | 28 |
| 50 | 1 |
| 56 | 6 |
| Total | 91 |

The current database does not establish whether each address was deleted, migrated or incorrectly linked. The previous common address deletion method physically deleted records. The account purge worker also deletes addresses. These are credible mechanisms, **not proof of what happened to these records**. No historical deletion audit or authoritative old-address export was available to establish attribution.

The common deletion method now marks addresses inactive and clears their default flag. The purge worker retains accounts with service orders pending an approved retention path. Checkout locks and validates active address ownership, plus active variant/service/category and bundle status, before saving orders. These changes prevent new invalid checkout references; they cannot recover missing historical information. No foreign key was added to historical order/address links.

Reconciliation requires a separately approved record-level plan:

1. Locate dated backups, migration manifests and deletion logs covering these IDs and customers.
2. Match original order/customer/address evidence. Current customer addresses alone do not establish historical delivery or contact details.
3. Record evidence, proposed action, reviewer and approval reference for every affected order. Unproven cases remain unresolved.
4. Back up the target database and test the approved actions on a restored staging copy. Do not fabricate replacement addresses or use another customer's address.
5. After reconciliation, design immutable address snapshots and validate any proposed foreign key separately. Existing address editing still changes shared address data; soft deletion alone does not make historical content immutable.

Regenerate the manifest with `node scripts/report-service-manager-p0.js` from `server`. It reads only a local non-production database. The baseline/verification files compare order financial fields, wallet balances, ledger rows and service scopes; the post-test comparison remained unchanged. These aggregate CRC fingerprints are an accidental-change check, not a substitute for a backup or a cryptographic audit.
