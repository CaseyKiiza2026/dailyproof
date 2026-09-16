import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
export async function p0Database() {
  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync("tests/fixtures/base-schema.sql", "utf8"));
    await db.exec(`alter default privileges in schema public grant all on tables to anon,authenticated;
      grant select,insert,update,delete on public.habits,public.habit_logs to authenticated;
      create role service_role bypassrls;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,delete on storage.objects to authenticated;`);
    for (const f of fs
      .readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(fs.readFileSync("supabase/migrations/" + f, "utf8"));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
