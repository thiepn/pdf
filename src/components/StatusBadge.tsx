import type { CheckStatus } from "../lab/types";

export function StatusBadge({ status }: { status: CheckStatus }) {
  return <span className={`status status--${status}`}>{status.replace("-", " ")}</span>;
}
