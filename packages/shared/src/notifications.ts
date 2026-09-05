/**
 * User-configurable rules that trigger OS / email notifications when the
 * day's non-productive time crosses a threshold.
 */
export interface NotificationConfig {
  /**
   * Categories whose time counts as "non-productive" for the purposes of
   * threshold alerts. Idle is counted automatically (so it doesn't need to
   * appear here).
   */
  unproductiveCategories: string[];
  /** Threshold in minutes of accumulated non-productive time per local day. */
  unproductiveThresholdMin: number;
  /** Whether OS toast notifications are enabled. */
  osEnabled: boolean;
  /** Whether SMTP email is enabled. */
  emailEnabled: boolean;
  /** SMTP server config (only used when emailEnabled). */
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  /** Stored locally — never exposed back through IPC after save. */
  smtpPassMasked: boolean;
  /** Sender email address. */
  emailFrom: string;
  /** Recipient (typically the user's own email). */
  emailTo: string;
}

export interface NotificationLogEntry {
  id: number;
  ts: number;
  kind: "unproductive_threshold" | "daily_report" | "weekly_report" | "test";
  channel: "os" | "email" | "both";
  title: string;
  body: string;
  /** Threshold-relevant metadata (actual minutes, etc.) as JSON. */
  meta: Record<string, unknown> | null;
}

export const DEFAULT_NOTIFICATION_CONFIG: Omit<
  NotificationConfig,
  "smtpPassMasked"
> & { smtpPassMasked: boolean } = {
  unproductiveCategories: ["Entertainment", "Social"],
  unproductiveThresholdMin: 180, // 3 hours
  osEnabled: true,
  emailEnabled: false,
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPassMasked: false,
  emailFrom: "",
  emailTo: "",
};
