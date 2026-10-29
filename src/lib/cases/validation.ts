import { z } from "zod";
import { isIsoDate } from "@/lib/domain/dates";
import { ISSUE_TYPES, isIssueTypeId, isReportChannelId, sortIssues, type IssueTypeId } from "@/lib/domain/issues";
import { bareUnit } from "@/lib/domain/templates";
import { isReplyCategory } from "@/lib/domain/ladder";

const isoDate = z.string().refine(isIsoDate, "Pick a date.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const newCaseSchema = z
  .object({
    address: z.string().trim().min(5, "Enter your street address.").max(200),
    // Phones autofill "Apt 4B"; letters add "Apt" themselves.
    unit: optionalText(20).transform((v) => (v ? bareUnit(v) : null)),
    borough: optionalText(40),
    bbl: z
      .string()
      .regex(/^\d{10}$/)
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null))
      .transform((v) => v ?? null),
    bin: z
      .string()
      .regex(/^\d{7}$/)
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null))
      .transform((v) => v ?? null),
    // Tenants can pick several problems; stored most serious first.
    issueTypes: z
      .array(z.string().refine(isIssueTypeId, "Choose what needs fixing."), { message: "Choose what needs fixing." })
      .min(1, "Choose what needs fixing.")
      .max(ISSUE_TYPES.length, "Choose what needs fixing.")
      .transform((ids) => sortIssues(ids as IssueTypeId[])),
    issueDescription: optionalText(500),
    startedOn: isoDate,
    // "no": they haven't told management yet, so the first notice is the first report and the
    // date question is skipped. Missing (a tab opened before this question existed) means "yes"
    // when a first-report date was sent.
    toldManagement: z.enum(["yes", "no"]).optional(),
    firstReportedOn: z.string().optional(),
    // The form stopped asking how they told management and how often they followed up (Oct 28, to
    // shorten it). Older tabs may still send both.
    firstReportedVia: z.string().optional(),
    priorFollowups: z.coerce.number().int().min(0).max(99).optional(),
    mgmtName: optionalText(120),
    mgmtEmail: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === "" || z.email().safeParse(v).success, "That email doesn't look right.")
      .transform((v) => (v === "" ? null : v)),
    tenantName: z.string().trim().min(2, "Enter the name you sign messages with.").max(120),
    monthlyRent: z.coerce.number({ message: "Enter your monthly rent." }).positive("Enter your monthly rent.").max(50_000),
    tenantContact: optionalText(120),
    sendMode: z.enum(["abate", "self"], { message: "Choose who sends the follow-ups." }),
    tenantEmail: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v ? v : null)),
    sendAuthorized: z.literal("on").optional(),
    aiConsent: z.literal("on", { message: "Please agree so we can set up your case." }),
    invite: optionalText(10),
  })
  .transform((v) => (v.sendMode === "self" ? { ...v, tenantEmail: null, sendAuthorized: undefined } : v))
  .transform(({ toldManagement, ...v }) => {
    const toldBefore = toldManagement ? toldManagement === "yes" : Boolean(v.firstReportedOn);
    return {
      ...v,
      toldBefore,
      firstReportedOn: toldBefore ? v.firstReportedOn : undefined,
      // Not asked anymore: letters leave "other" out ("first reported it to you on <date>").
      firstReportedVia: toldBefore ? v.firstReportedVia || "other" : undefined,
      priorFollowups: toldBefore ? (v.priorFollowups ?? 0) : 0,
    };
  })
  .superRefine((v, ctx) => {
    // "Something else" reads as "a repair problem" in letters, so the tenant says what it is.
    if (v.issueTypes.includes("other") && !v.issueDescription) {
      ctx.addIssue({ code: "custom", path: ["issueDescription"], message: "Say what needs fixing." });
    }
    if (v.sendMode === "abate") {
      // Abate can't send anything without management's address.
      if (!v.mgmtEmail) {
        ctx.addIssue({ code: "custom", path: ["mgmtEmail"], message: "Add management's email so we can send your follow-ups, or choose to send them yourself." });
      }
      if (!v.tenantEmail) ctx.addIssue({ code: "custom", path: ["tenantEmail"], message: "Add your email so we can copy you on every message." });
      else if (!z.email().safeParse(v.tenantEmail).success) ctx.addIssue({ code: "custom", path: ["tenantEmail"], message: "That email doesn't look right." });
      if (!v.sendAuthorized) ctx.addIssue({ code: "custom", path: ["sendAuthorized"], message: "Please confirm we can email management for you." });
    }
    if (v.toldBefore) {
      if (!v.firstReportedOn || !isIsoDate(v.firstReportedOn)) {
        ctx.addIssue({ code: "custom", path: ["firstReportedOn"], message: "Pick the date you first told them." });
      } else if (v.firstReportedOn < v.startedOn) {
        ctx.addIssue({ code: "custom", path: ["firstReportedOn"], message: "This is before the problem started." });
      }
      if (!isReportChannelId(v.firstReportedVia)) ctx.addIssue({ code: "custom", path: ["firstReportedVia"], message: "Choose how you told them." });
    }
  });

export type NewCaseInput = z.infer<typeof newCaseSchema>;

export const replySchema = z.object({
  text: z.string().trim().min(2, "Paste what management said.").max(8000, "That's too long. Paste just their reply."),
  receivedOn: isoDate,
});

export const categorySchema = z.string().refine(isReplyCategory);

export const pauseReasonSchema = z.enum(["worried", "send_myself", "other"]);

export const helpSchema = z.object({
  contact: z.string().trim().min(5, "Add a phone number or email.").max(120),
});
