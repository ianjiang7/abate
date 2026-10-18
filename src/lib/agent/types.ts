import type { IsoDate } from "@/lib/domain/dates";
import type { ReplyCategory, StepId } from "@/lib/domain/ladder";

export type ReadReplyInput = {
  /** The reply as pasted by the tenant or a teammate. May include quoted earlier messages. */
  replyText: string;
  /** New York date the reply arrived, used to resolve "tomorrow" or "Monday". */
  receivedOn: IsoDate;
  /** Plain-language issue, e.g. "no heat or hot water". */
  issue: string;
  /** The last step we sent, for context. */
  lastStepSent: StepId | null;
};

export type ReplyReading = {
  category: ReplyCategory;
  /** One neutral line for the timeline and for teammates, e.g. "Says the super will come Tuesday." */
  summary: string;
  /** A repair or visit date management mentioned, resolved to a calendar date, or null. */
  mentionedDate: IsoDate | null;
  /**
   * One factual sentence the next message can quote back, written in the tenant's voice and
   * addressed to management, e.g. "On October 17 you wrote that the super would come by."
   * Null when there's nothing worth quoting.
   */
  replyReference: string | null;
  /** The model id that produced this reading, or "stand-in". */
  source: string;
};
