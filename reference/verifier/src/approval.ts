/**
 * Approval first increment (DRAFT, NOT MERGED TO MAIN).
 * NRS-APPROVE-0001..0004 (spec/approval/README.md).
 *
 * Non-normative reference implementation. Not wired into the `verify` CLI
 * pipeline or any registered Record schema in this increment - there is no
 * bundle whose Record schema declares an `approval` field, so attaching one
 * is not something any real Record can do yet (see spec/approval/README.md's
 * "Record-envelope attachment mechanism" open discussion item).
 */

import type { CheckResult, Scope } from "./report-types.js";

export const APPROVAL_STATEMENT_ID =
  "urn:nomue:approval-statement:content-reviewed-responsibility-accepted:1";

/**
 * The fixed statement text NRS-APPROVE-0001 binds to APPROVAL_STATEMENT_ID,
 * in fixed English wording. Restated here only as a code comment, never as a
 * runtime string a caller could substitute:
 * "An approval records that the approver reviewed the content within the
 * specified scope and accepted responsibility for that approval. It does not
 * guarantee scientific correctness."
 */

export interface RecordReference {
  record_id: string;
  revision_id: string;
  content_digest: string;
}

export interface Approver {
  name: string;
  approver_id: string;
}

export interface Approval {
  approval_id: string;
  approver: Approver;
  scope: Scope;
  timestamp: string;
  statement: typeof APPROVAL_STATEMENT_ID;
}

export interface ApprovalScopeCheckInput {
  approval: Approval | null;
  record_reference: RecordReference;
}

export const APPROVAL_SCOPE_CHECK_ID = "urn:nomue:check:approval-scope:0.1.0-draft.1";
const APPROVAL_SCOPE_CHECK_VERSION = "0.1.0-draft.1";

/**
 * Checks whether an approval's declared scope actually identifies the
 * Record it is attached to (NRS-APPROVE-0004). A `null` approval (the field
 * is optional - absence is a legitimate, distinct case, not an error) is
 * reported as `not_run`, never silently treated as a pass. A present
 * approval's scope is accepted if its `id` matches either the record_id or
 * the revision_id it is checked against; anything else is a scope mismatch.
 */
export function checkApprovalScope(input: ApprovalScopeCheckInput): CheckResult {
  const { approval, record_reference: ref } = input;

  if (approval === null) {
    return {
      check_id: APPROVAL_SCOPE_CHECK_ID,
      check_version: APPROVAL_SCOPE_CHECK_VERSION,
      execution: "not_run",
      scope: { kind: "record", id: ref.record_id },
      reason_codes: ["NRS-APPROVAL-ABSENT"],
    };
  }

  const scope = approval.scope;
  const matches = scope.id === ref.record_id || scope.id === ref.revision_id;
  return {
    check_id: APPROVAL_SCOPE_CHECK_ID,
    check_version: APPROVAL_SCOPE_CHECK_VERSION,
    execution: "completed",
    outcome: matches ? "pass" : "fail",
    scope,
    reason_codes: matches ? [] : ["NRS-APPROVAL-SCOPE-MISMATCH"],
  };
}
