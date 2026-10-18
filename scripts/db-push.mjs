// Applies supabase/migrations to the database in DATABASE_URL (from .env.local).
// Run with: npm run db:push
import { execFileSync } from "node:child_process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is empty. Add the Supabase Session pooler connection string to .env.local.");
  process.exit(1);
}
execFileSync("npx", ["supabase", "db", "push", "--db-url", url, "--yes"], { stdio: "inherit" });
