// Issue types and the abatement percentages used by the estimate.
// The percentages are team placeholders, not legal standards (see AGENTS.md).

export const ISSUE_TYPES = [
  { id: "heat", label: "No heat or hot water", short: "no heat or hot water", low: 0.2, high: 0.5 },
  { id: "leak", label: "Leak, sewage or ceiling damage", short: "a leak and water damage", low: 0.2, high: 0.4 },
  { id: "mold", label: "Mold", short: "mold", low: 0.1, high: 0.3 },
  { id: "pests", label: "Mice, rats, roaches or bedbugs", short: "pests", low: 0.1, high: 0.3 },
  { id: "window_door", label: "Broken window, door or lock", short: "a broken window, door or lock", low: 0.1, high: 0.25 },
  { id: "plumbing", label: "Sink, toilet or drain", short: "a plumbing problem", low: 0.1, high: 0.25 },
  { id: "electrical", label: "Electrical or lights", short: "an electrical problem", low: 0.05, high: 0.2 },
  { id: "other", label: "Something else", short: "a repair problem", low: 0, high: 0.1 },
] as const;

export type IssueTypeId = (typeof ISSUE_TYPES)[number]["id"];
export type IssueType = (typeof ISSUE_TYPES)[number];

export function isIssueTypeId(value: unknown): value is IssueTypeId {
  return ISSUE_TYPES.some((t) => t.id === value);
}

export function getIssueType(id: IssueTypeId): IssueType {
  const found = ISSUE_TYPES.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown issue type: ${id}`);
  return found;
}

export const REPORT_CHANNELS = [
  { id: "text", label: "Text message" },
  { id: "email", label: "Email" },
  { id: "call", label: "Phone call" },
  { id: "in_person", label: "In person" },
  { id: "portal", label: "Online portal or app" },
  { id: "other", label: "Other" },
] as const;

export type ReportChannelId = (typeof REPORT_CHANNELS)[number]["id"];

export function isReportChannelId(value: unknown): value is ReportChannelId {
  return REPORT_CHANNELS.some((c) => c.id === value);
}

export function reportChannelPhrase(id: ReportChannelId): string {
  const phrases: Record<ReportChannelId, string> = {
    text: "by text message",
    email: "by email",
    call: "by phone",
    in_person: "in person",
    portal: "through the online portal",
    other: "directly",
  };
  return phrases[id];
}
