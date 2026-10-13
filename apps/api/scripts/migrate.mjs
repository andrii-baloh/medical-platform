import { Pool } from "pg";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const dir = resolve(process.cwd(), "../../db/migrations");
await pool.query(`create table if not exists schema_migrations(
  name text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
)`);
const files = (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort();
for (const name of files) {
  const sql = await readFile(resolve(dir, name), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const existing = await pool.query("select checksum from schema_migrations where name=$1", [name]);
  if (existing.rows[0]) {
    if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
    continue;
  }
  const client = await pool.connect();
  try {
    const transactionalSql = sql
      .replace(/^\s*BEGIN;\s*/i, "")
      .replace(/\s*COMMIT;\s*$/i, "");
    await client.query("BEGIN");
    await client.query(transactionalSql);
    await client.query("insert into schema_migrations(name,checksum) values($1,$2)", [name, checksum]);
    await client.query("COMMIT");
    process.stdout.write(`applied ${name}\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
await pool.end();
