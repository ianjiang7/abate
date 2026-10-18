// Builds the mailto: link the tenant taps to send a follow-up from their own email app.

/** The team inbox with this case's code as a plus-address, e.g. team+ab12cd@gmail.com. */
export function trackingAddress(baseEmail: string | undefined | null, caseCode: string): string | null {
  const email = baseEmail?.trim();
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  return `${local}+${caseCode.toLowerCase()}@${domain}`;
}

export function buildMailto({
  to,
  cc,
  subject,
  body,
}: {
  to?: string | null;
  cc?: string | null;
  subject: string;
  body: string;
}): string {
  const params: string[] = [];
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  params.push(`subject=${encodeURIComponent(subject)}`);
  // Mail apps expect CRLF line breaks in mailto bodies.
  params.push(`body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`);
  return `mailto:${to ? encodeURIComponent(to).replace(/%40/g, "@") : ""}?${params.join("&")}`;
}
