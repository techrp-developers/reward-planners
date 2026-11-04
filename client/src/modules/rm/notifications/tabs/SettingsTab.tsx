import { FiRefreshCw } from "react-icons/fi";
import type { ManagerMeta } from "../notificationTypes";
import { Card, Notice, Tag, secondaryBtn } from "../components";
import { LANGUAGE_LABELS } from "../notificationUtils";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm font-semibold text-gray-600">{label}</dt>
      <dd className="text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/**
 * Read-only: these values come from server configuration and the database,
 * so they are shown here with what changes them rather than as editable fields.
 */
export default function SettingsTab({ meta, onRefresh }: { meta: ManagerMeta; onRefresh: () => void }) {
  const { firebase, scope, limits, infrastructure } = meta;
  const projectMismatch = firebase.expectedProjectId && firebase.projectId && firebase.expectedProjectId !== firebase.projectId;

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><button type="button" className={secondaryBtn} onClick={onRefresh}><FiRefreshCw /> Refresh status</button></div>

      <Card title="Firebase" subtitle="Credentials stay on the server; the dashboard only sees their status.">
        <dl className="divide-y divide-gray-100">
          <Row label="Push sending">{!firebase.enabled ? <Tag tone="red">Disconnected</Tag> : firebase.credentialCheck === "verified" ? <Tag tone="green">Connected (credentials verified)</Tag> : <Tag tone="amber">Enabled, credentials not yet verified</Tag>}</Row>
          <Row label="Primary project"><span className="font-mono">{firebase.projectId || "—"}</span></Row>
          <Row label="Expected project (FIREBASE_PROJECT_ID)"><span className="font-mono">{firebase.expectedProjectId || "not enforced"}</span></Row>
          <Row label="Legacy project fallback">{firebase.legacyEnabled ? <span className="font-mono">{firebase.legacyProjectId}</span> : firebase.legacyReason ? <Tag tone="red">{firebase.legacyReason}</Tag> : firebase.legacyTrackedProjectId ? <span className="text-xs text-gray-600"><span className="font-mono">{firebase.legacyTrackedProjectId}</span> tracked at registration; no credentials, so old-build devices are not reached</span> : <span className="text-gray-500">not configured</span>}</Row>
          <Row label="Credentials">{firebase.credentialMode ? <span className="font-mono text-xs">{firebase.credentialMode}{firebase.serviceAccountEmail ? ` · ${firebase.serviceAccountEmail}` : ""}</span> : <span className="text-gray-500">none</span>}</Row>
          {firebase.adcSource && <Row label="ADC source"><span className="font-mono text-xs">{firebase.adcSource}</span></Row>}
          <Row label="Credential check">{firebase.credentialCheck === "verified" ? <Tag tone="green">Access token obtained</Tag> : firebase.credentialCheck === "pending" ? <Tag tone="amber">Checking…</Tag> : firebase.credentialCheck ? <Tag tone={firebase.credentialCheck === "failed" ? "red" : "amber"}>{firebase.credentialCheck === "failed" ? "Failed" : "Not verified (network)"}</Tag> : <span className="text-gray-500">not run</span>}{firebase.checkedAt && <span className="ml-2 text-xs text-gray-500">{new Date(firebase.checkedAt).toLocaleString()}</span>}</Row>
          <Row label="Campaign worker">
            {meta.scheduler?.running ? <Tag tone="green">Running on this server{meta.scheduler.mode === "campaign_worker_only" ? " (campaign worker only)" : ""}</Tag>
              : <Tag tone={meta.scheduler?.state === "error" || meta.scheduler?.state === "stalled" ? "red" : "amber"}>{meta.scheduler?.reason || "Not running on this server"}</Tag>}
            {meta.scheduler?.lastRunAt && <span className="ml-2 text-xs text-gray-500">last run {new Date(meta.scheduler.lastRunAt).toLocaleString()}</span>}
            {!meta.scheduler?.running && !meta.scheduler?.configured && <span className="mt-1 block text-xs text-gray-500">Local QA: ENABLE_LOCAL_CAMPAIGN_WORKER=true starts only this worker. Review due campaigns first: they are processed as soon as it starts.</span>}
          </Row>
        </dl>
        {firebase.reason && <div className="p-4"><Notice tone={firebase.enabled ? "amber" : "red"}>{firebase.reason}</Notice></div>}
        {projectMismatch && <div className="p-4"><Notice tone="red">Credentials do not match the expected project.</Notice></div>}
        <p className="px-5 pb-4 text-xs text-gray-500">Devices still registered with the old Firebase project are kept. Pushes to them use the legacy fallback when FIREBASE_LEGACY_SERVICE_ACCOUNT is configured.</p>
      </Card>

      <Card title="Test recipients" subtitle="Send Test and test-only campaigns go only to these accounts (NOTIFICATION_TEST_USER_IDS).">
        {meta.testUsers.length ? (
          <dl className="divide-y divide-gray-100">
            {meta.testUsers.map((user) => (
              <Row key={user.user_id} label={`${user.name} (#${user.user_id})`}>
                <span className="flex gap-1"><Tag>{LANGUAGE_LABELS[user.language] || user.language}</Tag>{user.has_device ? <Tag tone="green">Device registered</Tag> : <Tag tone="amber">No active device</Tag>}</span>
              </Row>
            ))}
          </dl>
        ) : <div className="p-4"><Notice>No test users are configured. The server configuration (NOTIFICATION_TEST_USER_IDS) must list approved development accounts only.</Notice></div>}
      </Card>

      <Card title="Your scope">
        <dl className="divide-y divide-gray-100">
          <Row label="Role"><span className="uppercase">{meta.role}</span></Row>
          <Row label="Company access">
            {scope.global ? "All companies" : scope.assignmentsAvailable ? `${scope.companyCount} assigned compan${scope.companyCount === 1 ? "y" : "ies"}` : "Assignments not configured (test sends only)"}
          </Row>
          <Row label="Sending authority">{meta.permissions.send ? "You send and schedule directly (no admin approval)" : "Not allowed to send campaigns"}</Row>
          <Row label="Large-send confirmation">More than {limits.largeSendThreshold} recipients requires confirming the exact count</Row>
        </dl>
      </Card>

      <Card title="Employee protections" subtitle="Applied to marketing and engagement campaigns; announcements still respect company scope and audit logging.">
        <dl className="divide-y divide-gray-100">
          <Row label="Consent">Only employees with a saved preference that opts in. No record means no consent.</Row>
          <Row label="Language">From the employee's app setting (notification_preferences.language); English if not approved</Row>
          <Row label="Quiet hours">Employee-defined; sends wait until quiet hours end ({limits.employeeTimezone})</Row>
          <Row label="Daily limit">{limits.promotionalDailyCap} promotional notifications per employee per day</Row>
        </dl>
      </Card>

      <Card title="Infrastructure">
        <dl className="divide-y divide-gray-100">
          <Row label="Campaign tables">{infrastructure.campaignTables ? <Tag tone="green">Installed</Tag> : <Tag tone="red">Missing (migration 20261027_01)</Tag>}</Row>
          <Row label="Push attempt log">{infrastructure.attemptsTable ? <Tag tone="green">Installed</Tag> : <Tag tone="amber">Missing (migration 20261026_02)</Tag>}</Row>
          <Row label="Image library & destinations">{infrastructure.mediaTables ? <Tag tone="green">Installed</Tag> : <Tag tone="amber">Missing (migration 20261028_01)</Tag>}</Row>
          <Row label="Approved image hosts"><span className="font-mono text-xs">{meta.imageHosts.join(", ")}</span></Row>
        </dl>
      </Card>
    </div>
  );
}
