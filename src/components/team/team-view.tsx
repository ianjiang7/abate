import { CircleCheck, CircleDashed, CircleX, Inbox, MailCheck, MessageSquareText, Send, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, Notice } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { teamOverview, type TeamCase } from "@/lib/cases/service";
import { PASS, type Metrics } from "@/lib/cases/metrics";
import { hasDatabase } from "@/lib/db/client";
import { formatShortDate, nyDate } from "@/lib/domain/dates";
import { getIssueType } from "@/lib/domain/issues";
import { STEP_LABELS } from "@/lib/domain/ladder";
import { isTeamKey } from "@/lib/team/auth";
import { ClassifyForm, CopyCaseLink, LogReplyForm, SendItem } from "./team-items";

const pct = (r: number | null) => (r === null ? "–" : `${Math.round(r * 100)}%`);

export async function TeamView({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { key } = await params;
  if (!isTeamKey(key)) notFound();
  if (!hasDatabase()) return <Notice tone="warn">The database isn&apos;t connected.</Notice>;
  const includeTest = (await searchParams).test === "1";
  const o = await teamOverview({ includeTest });
  const today = nyDate();

  return (
    <div className="space-y-6">
      {includeTest ? <Notice tone="warn">Showing test cases too (?test=1).</Notice> : null}

      <MetricsPanel m={o.metrics} invites={o.invites} helpRequests={o.helpRequests} />

      <Card>
        <CardHeader icon={<Send className="size-5" />} title={`To send (${o.toSend.length})`} subtitle="Approved by the tenant. Send each from the team Gmail, then tap Mark sent." />
        {o.toSend.length === 0 ? <Empty>Nothing waiting. Nice.</Empty> : null}
        <ol className="space-y-6">
          {o.toSend.map(({ record, message }) => (
            <li key={message.id} className="border-t border-line/70 pt-5 first:border-0 first:pt-0">
              <CaseLine record={record} extra={`${message.step ? STEP_LABELS[message.step] : "Message"} · approved ${message.approvedAt ? formatShortDate(nyDate(message.approvedAt), today) : ""}`} />
              <div className="mt-3">
                <SendItem teamKey={key} messageId={message.id} to={record.mgmtEmail} cc={record.tenantEmail} subject={message.subject ?? ""} body={message.body ?? ""} />
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader icon={<MessageSquareText className="size-5" />} title={`Replies to read (${o.toRead.length})`} subtitle="Pasted in by tenants. Read each and pick what it said; the tenant's next step follows." />
        {o.toRead.length === 0 ? <Empty>No unread replies.</Empty> : null}
        <ol className="space-y-6">
          {o.toRead.map(({ record, message }) => (
            <li key={message.id} className="border-t border-line/70 pt-5 first:border-0 first:pt-0">
              <CaseLine record={record} extra={`received ${formatShortDate(nyDate(message.receivedAt ?? message.createdAt), today)}`} />
              <blockquote className="mt-3 whitespace-pre-wrap rounded-2xl bg-mist p-4 text-sm leading-relaxed">{message.body}</blockquote>
              <div className="mt-4">
                <ClassifyForm teamKey={key} messageId={message.id} />
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader icon={<Inbox className="size-5" />} title="Log a reply from the team inbox" subtitle="Management usually replies to the team address. Paste it here with your reading." />
        {o.open.length === 0 ? (
          <Empty>No open cases.</Empty>
        ) : (
          <LogReplyForm
            teamKey={key}
            cases={o.open.map((c) => ({ code: c.record.code, label: `${c.record.code} · ${c.record.tenantName} · ${c.record.address}` }))}
          />
        )}
      </Card>

      <Card>
        <CardHeader icon={<Users className="size-5" />} title={`Waiting on tenants (${o.waitingOnTenant.length})`} subtitle="Text them their case link so they can act." />
        {o.waitingOnTenant.length === 0 ? <Empty>Nobody to nudge right now.</Empty> : null}
        <ul className="space-y-3">
          {o.waitingOnTenant.map((c) => (
            <li key={c.record.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-mist px-4 py-3">
              <div className="min-w-0">
                <CaseLine record={c.record} extra={waitingLabel(c)} />
                <p className="mt-1 text-sm text-slate">{c.record.tenantContact ?? c.record.tenantEmail ?? "No contact on file"}</p>
              </div>
              <CopyCaseLink token={c.record.token} />
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader icon={<MailCheck className="size-5" />} title={`Open cases (${o.open.length})`} />
        <ul className="divide-y divide-line/70">
          {o.open.map((c) => (
            <li key={c.record.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <CaseLine record={c.record} extra={stateLabel(c)} />
              <CopyCaseLink token={c.record.token} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function CaseLine({ record, extra }: { record: TeamCase["record"]; extra?: string }) {
  return (
    <p className="text-[15px]">
      <span className="font-bold">{record.code}</span> · {record.tenantName} · <span className="text-slate">{getIssueType(record.issueType).label}</span>{" "}
      <Badge tone={record.sendMode === "abate" ? "brand" : "neutral"} className="ml-1 align-middle">
        {record.sendMode === "abate" ? "Abate sends" : "Sends own"}
      </Badge>
      {record.pausedAt ? (
        <Badge tone="warn" className="ml-1 align-middle">
          Paused
        </Badge>
      ) : null}
      {extra ? <span className="block text-sm text-slate">{extra}</span> : null}
    </p>
  );
}

function waitingLabel(c: TeamCase): string {
  const n = c.next;
  if (n.kind === "send") return `${c.record.sendMode === "abate" ? "Approve" : "Send"}: ${STEP_LABELS[n.step]} (ready ${n.dueOn})`;
  if (n.kind === "confirm_fixed") return "Confirm whether it's really fixed";
  if (n.kind === "checkin") return `Check in: was it fixed on ${n.scheduledFor}?`;
  return "";
}

function stateLabel(c: TeamCase): string {
  const n = c.next;
  switch (n.kind) {
    case "send":
      return `Next: ${STEP_LABELS[n.step]} · ready ${n.dueOn}`;
    case "awaiting_send":
      return `Team to send: ${STEP_LABELS[n.step]}`;
    case "team_review":
      return "Team to read a reply";
    case "waiting_for_repair":
      return `Repair scheduled ${n.scheduledFor}`;
    case "paused":
      return `Paused (${c.record.pauseReason ?? "no reason"})`;
    default:
      return n.kind.replace(/_/g, " ");
  }
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-mist px-4 py-3 text-sm text-slate">{children}</p>;
}

function MetricsPanel({ m, invites, helpRequests }: { m: Metrics; invites: number; helpRequests: number }) {
  const replySteps = Object.entries(m.h1.firstReplyAfterStep)
    .map(([step, n]) => `${STEP_LABELS[step as keyof typeof STEP_LABELS]} ${n}`)
    .join(", ");
  const reasons = Object.entries(m.h2.pauseReasons)
    .map(([r, n]) => `${r.replace(/_/g, " ")} ${n}`)
    .join(", ");
  return (
    <Card>
      <CardHeader title={`Live results · ${m.cases} ${m.cases === 1 ? "case" : "cases"}`} subtitle="Updated on every page load." />
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate">Hypothesis 1 · landlords respond faster to Abate</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Tile
          label="Reply or repair scheduled within 7 days of the first follow-up"
          value={`${m.h1.responded} of ${m.h1.judged}`}
          note={`${pct(m.h1.rate)} · pass at ${pct(PASS.respondedWithin7)}${m.h1.waiting ? ` · ${m.h1.waiting} still in week one` : ""}`}
          pass={m.h1.pass}
        />
        <Tile label="Median days waited before Abate" value={m.h1.medianBaselineDays === null ? "–" : `${m.h1.medianBaselineDays}`} note="From first telling management to Abate's first follow-up" />
        <Tile label="Median days to first reply after Abate" value={m.h1.medianDaysToReply === null ? "–" : `${m.h1.medianDaysToReply}`} note={replySteps ? `First reply came after: ${replySteps}` : "No replies yet"} />
      </div>

      <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-slate">Hypothesis 2 · tenants let Abate contact their landlord</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Tile label="Chose Abate to send for them" value={`${m.h2.authorized} of ${m.cases}`} note={`${pct(m.h2.rate)} · pass at ${pct(PASS.authorized)}`} pass={m.h2.authorizedPass} />
        <Tile label="Drafts approved within a day" value={`${m.h2.approvedWithinDay} of ${m.h2.approvals}`} note={`${pct(m.h2.approvalRate)} · pass at ${pct(PASS.approvedWithinDay)}`} pass={m.h2.approvalPass} />
        <Tile label="Paused or switched to sending themselves" value={`${m.h2.backedOut}`} note={reasons ? `Reasons: ${reasons}` : `Pass at ${PASS.maxBackedOut} or fewer`} pass={m.cases > 0 ? m.h2.backedOutPass : null} />
      </div>

      <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-slate">Side signals</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Tile label="Repairs marked fixed" value={`${m.h1.fixed}`} />
        <Tile label="Neighbor invites sent" value={`${invites}`} />
        <Tile label="“Recover this for 25%” interest" value={`${helpRequests}`} />
        <Tile label="AI agreed with our team (shadow)" value={m.shadow.compared ? `${m.shadow.agreed} of ${m.shadow.compared}` : "–"} note={m.shadow.compared ? pct(m.shadow.rate) : "Compared once the team reads replies"} />
      </div>
    </Card>
  );
}

function Tile({ label, value, note, pass }: { label: string; value: string; note?: string; pass?: boolean | null }) {
  const Icon = pass === true ? CircleCheck : pass === false ? CircleX : CircleDashed;
  return (
    <div className={cn("rounded-2xl p-4", pass === true ? "bg-good-soft" : pass === false ? "bg-warn-soft" : "bg-mist")}>
      <p className="flex items-start justify-between gap-2 text-[13px] font-semibold text-slate">
        {label}
        {pass !== undefined ? <Icon className={cn("size-4 shrink-0", pass === true ? "text-good" : pass === false ? "text-warn" : "text-slate")} aria-label={pass === true ? "Passing" : pass === false ? "Not passing yet" : "Not enough data"} /> : null}
      </p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-slate">{note}</p> : null}
    </div>
  );
}
