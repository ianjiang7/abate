import { searchAddresses } from "@/lib/building";

/** Address suggestions for the start form, from NYC's free geocoder. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 120) return Response.json({ matches: [] });
  try {
    const matches = await searchAddresses(q);
    return Response.json({ matches }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return Response.json({ matches: [] });
  }
}
