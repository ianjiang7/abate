import { isCaseCode } from "@/lib/cases/ids";
import { findBuildingByCode } from "@/lib/cases/repo";
import { hasDatabase } from "@/lib/db/client";

/** For neighbor invites: the inviter's building address (never their unit or anything private). */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
  if (!isCaseCode(code) || !hasDatabase()) return Response.json({ building: null });
  try {
    const b = await findBuildingByCode(code);
    return Response.json({
      building: b ? { address: b.address, borough: b.borough, bbl: b.bbl, bin: b.bin } : null,
    });
  } catch {
    return Response.json({ building: null });
  }
}
