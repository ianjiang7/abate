// Deletes cases created by the automated end-to-end test (is_test = true) and their photos.
// Run with: npm run e2e:cleanup
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Fill in SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false }, realtime: { transport: ws } });
const { data: cases, error } = await db.from("cases").select("id").eq("is_test", true);
if (error) throw error;
for (const c of cases) {
  const { data: photos } = await db.from("photos").select("storage_path").eq("case_id", c.id);
  if (photos?.length) await db.storage.from("photos").remove(photos.map((p) => p.storage_path));
}
if (cases.length) await db.from("cases").delete().eq("is_test", true);
console.log(`Deleted ${cases.length} test case(s).`);
