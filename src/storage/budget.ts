export interface StorageBudgetAssessment {
  supported: boolean;
  requiredBytes: number;
  usageBytes?: number;
  quotaBytes?: number;
  availableBytes?: number;
  reserveBytes?: number;
  status: "ok" | "warning" | "blocked";
  message: string;
}

const MINIMUM_RESERVE_BYTES = 25_000_000;
const QUOTA_RESERVE_RATIO = 0.05;
const WRITE_OVERHEAD_RATIO = 0.08;

export function assessStorageBudget(
  estimate: { usage?: number; quota?: number } | undefined,
  requestedBytes: number
): StorageBudgetAssessment {
  const requiredBytes = Math.max(0, Math.ceil(requestedBytes * (1 + WRITE_OVERHEAD_RATIO)));
  const usage = estimate?.usage;
  const quota = estimate?.quota;
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || !quota || quota <= 0) {
    return {
      supported: false,
      requiredBytes,
      status: "warning",
      message: "Browser storage quota is not exposed; the write will be attempted with rollback protection."
    };
  }
  const usageBytes = Math.max(0, usage ?? 0);
  const quotaBytes = quota;
  const availableBytes = Math.max(0, quotaBytes - usageBytes);
  const reserveBytes = Math.max(MINIMUM_RESERVE_BYTES, Math.ceil(quotaBytes * QUOTA_RESERVE_RATIO));
  const afterWrite = availableBytes - requiredBytes;
  if (afterWrite < 0) {
    return {
      supported: true,
      requiredBytes,
      usageBytes,
      quotaBytes,
      availableBytes,
      reserveBytes,
      status: "blocked",
      message: `Not enough browser storage is available. This write needs about ${formatBytes(requiredBytes)}, but only ${formatBytes(availableBytes)} remains.`
    };
  }
  if (afterWrite < reserveBytes) {
    return {
      supported: true,
      requiredBytes,
      usageBytes,
      quotaBytes,
      availableBytes,
      reserveBytes,
      status: "warning",
      message: `This write would leave only ${formatBytes(afterWrite)} free, below the ${formatBytes(reserveBytes)} safety reserve.`
    };
  }
  return {
    supported: true,
    requiredBytes,
    usageBytes,
    quotaBytes,
    availableBytes,
    reserveBytes,
    status: "ok",
    message: `${formatBytes(availableBytes)} is available; the write requires about ${formatBytes(requiredBytes)}.`
  };
}

export async function checkStorageBudget(requestedBytes: number): Promise<StorageBudgetAssessment> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return assessStorageBudget(undefined, requestedBytes);
  try {
    const estimate = await navigator.storage.estimate();
    return assessStorageBudget(estimate, requestedBytes);
  } catch {
    return assessStorageBudget(undefined, requestedBytes);
  }
}

export async function assertStorageBudget(requestedBytes: number, purpose = "store this output"): Promise<StorageBudgetAssessment> {
  const assessment = await checkStorageBudget(requestedBytes);
  if (assessment.supported && assessment.status !== "ok") throw new Error(`${assessment.message} Free browser storage before trying to ${purpose}.`);
  return assessment;
}

function formatBytes(value: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = Math.max(0, value);
  let unit = 0;
  while (current >= 1000 && unit < units.length - 1) { current /= 1000; unit += 1; }
  return `${current.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
