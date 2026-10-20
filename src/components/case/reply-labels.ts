import type { ReplyCategory } from "@/lib/domain/ladder";

/** Plain-language choices for what a landlord's reply said (used by tenants and the team). */
export const REPLY_PLAIN: Record<ReplyCategory, string> = {
  acknowledged_no_date: "They answered but gave no repair date",
  scheduled: "They gave a repair date",
  needs_access: "They need to get into the apartment",
  disputes_or_refuses: "They pushed back or refused",
  says_fixed: "They say it's fixed",
  unclear: "Not sure what they mean",
};
