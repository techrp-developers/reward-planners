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
          <Row label="Push sending">{firebase.enabled ? <Tag tone="green">Enabled</Tag> : <Tag tone="red">Disabled</Tag>}</Row>
          <Row label="Primary project"><span className="font-mono">{firebase.projectId || "—"}</span></Row>
          <Row label="Expected project (FIREBASE_PROJECT_ID)"><span className="font-mono">{firebase.expectedProjectId || "not enforced"}</span></Row>
          <Row label="Legacy project fallback">{firebase.legacyEnabled ? <span className="font-mono">{firebase.legacyProjectId}</span> : <span className="text-gray-500">not configured</span>}</Row>
        </dl>
        {!firebase.enabled && firebase.reason && <div className="p-4"><Notice tone="red">{firebase.reason}</Notice></div>}
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
        ) : <div className="p-4"><Notice>No test users are configured. Ask an admin to set NOTIFICATION_TEST_USER_IDS to development accounts only.</Notice></div>}
      </Card>

      <Card title="Your scope">
        <dl className="divide-y divide-gray-100">
          <Row label="Role"><span className="uppercase">{meta.role}</span></Row>
          <Row label="Company access">
            {scope.global ? "All companies" : scope.assignmentsAvailable ? `${scope.companyCount} assigned compan${scope.companyCount === 1 ? "y" : "ies"}` : "Assignments not configured (test sends only)"}
          </Row>
          <Row label="Campaign approval">{limits.selfApproval ? "Admins may approve their own campaigns" : "Approved by an admin other than the creator"}</Row>
        </dl>
      </Card>

      <Card title="Employee protections" subtitle="Applied to marketing and engagement campaigns; announcements are approval-gated.">
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
        </dl>
      </Card>
    </div>
  );
}
