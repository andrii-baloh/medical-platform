/**
 * Audit event catalogue.
 *
 * `audit_events.action` is a free-form text column, so the catalogue is the
 * single place that names events. Existing modules already emit literals; new
 * code should use these constants so a typo cannot silently create a new
 * action that no report will ever match.
 *
 * Rules that apply to every event:
 *  - actor + action + resource + timestamp + outcome are mandatory;
 *  - metadata never contains clinical free text, tokens or document contents;
 *  - a denied action is recorded with `outcome: "denied"`, not as success.
 */
export const AUDIT_EVENT = {
  /** Patient or doctor opened a consultation. */
  CONSULTATION_OPENED: "consultation.opened",
  /** Trusted role set of an account changed after token verification. */
  USER_ROLE_CHANGED: "user.role.changed",
  /** Authorization refusals; always written with outcome "denied". */
  DOCUMENT_ACCESS_DENIED: "document.access.denied",
  CONSULTATION_ACCESS_DENIED: "consultation.access.denied",
  TELEMEDICINE_ACCESS_DENIED: "telemedicine.access.denied",
  ADMIN_ACCESS_DENIED: "admin.access.denied",
} as const;

export type AuditEventName = (typeof AUDIT_EVENT)[keyof typeof AUDIT_EVENT];
