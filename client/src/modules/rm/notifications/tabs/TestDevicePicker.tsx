import type { TestDeviceUser } from "../notificationApi";
import { inputCls, labelCls } from "../components";
import { formatInZone } from "../notificationUtils";

export type TestTarget = { userId: number; deviceId: number } | null;

/**
 * Which single device "Send test" goes to. Only allow-listed test employees'
 * registered devices are offered (tokens arrive masked); one is preselected
 * only when it is the only one, so a test never silently picks between phones.
 */
export default function TestDevicePicker({ users, value, onChange, disabled }: {
  users: TestDeviceUser[] | null;
  value: TestTarget;
  onChange: (target: TestTarget) => void;
  disabled?: boolean;
}) {
  if (users === null) return <p className="text-xs text-gray-500">Loading test devices…</p>;
  const options = users.flatMap((user) => user.devices.map((device) => ({ user, device })));
  if (!options.length) {
    return <p className="text-xs text-amber-700">No test device is registered. The test employee must log in to the current app build once.</p>;
  }
  const key = value ? `${value.userId}:${value.deviceId}` : "";
  return (
    <label className="block">
      <span className={labelCls}>Test device</span>
      <select id="test-device" className={inputCls} disabled={disabled} value={key}
        onChange={(event) => {
          const [userId, deviceId] = event.target.value.split(":").map(Number);
          onChange(event.target.value ? { userId, deviceId } : null);
        }}>
        {options.length > 1 && <option value="">Choose one device…</option>}
        {options.map(({ user, device }) => (
          <option key={device.device_id} value={`${user.user_id}:${device.device_id}`}>
            {user.name} · {device.platform} #{device.device_id} · {device.token} · seen {formatInZone(device.last_seen_at)}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[11px] text-gray-500">The test goes to this one device only, once, prefixed “[TEST]”.</span>
    </label>
  );
}
