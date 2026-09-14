import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { sample, surfaces } from "../src/lib/data";
const db = new PGlite();
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const creativeId = "00000000-0000-4000-8000-000000000003";
async function asUser(id: string) {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated;");
}
beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
    grant usage on schema storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
    insert into auth.users values ('${alice}'), ('${bob}');
  `);
  for (const name of [
    "202609140001_creatives.sql",
    "202609140002_assets.sql",
    "202609140003_asset_delete.sql",
  ]) {
    const sql = readFileSync(
      new URL(`../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql); // Rerunning our migrations must be safe.
  }
}, 30000);
afterAll(() => db.close());
describe.sequential("Postgres ownership policies", () => {
  it("lets an owner create and read their creative", async () => {
    await asUser(alice);
    await db.query(
      "insert into public.creatives(id,user_id,name,creative,surface) values ($1,$2,$3,$4,$5)",
      [creativeId, alice, "Private creative", sample, surfaces[0]],
    );
    const result = await db.query("select name from public.creatives");
    expect(result.rows).toEqual([{ name: "Private creative" }]);
  });
  it("prevents another user reading, changing, deleting, or forging the owner", async () => {
    await asUser(bob);
    expect((await db.query("select * from public.creatives")).rows).toEqual([]);
    expect(
      (
        await db.query(
          "update public.creatives set favorite=true where id=$1 returning id",
          [creativeId],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await db.query(
          "delete from public.creatives where id=$1 returning id",
          [creativeId],
        )
      ).rows,
    ).toEqual([]);
    await expect(
      db.query(
        "insert into public.creatives(id,user_id,name,creative,surface) values ($1,$2,$3,$4,$5)",
        [
          "00000000-0000-4000-8000-000000000004",
          alice,
          "Forged",
          sample,
          surfaces[0],
        ],
      ),
    ).rejects.toThrow();
  });
  it("prevents an owner transferring a row to another user", async () => {
    await asUser(alice);
    await expect(
      db.query("update public.creatives set user_id=$1 where id=$2", [
        bob,
        creativeId,
      ]),
    ).rejects.toThrow();
    expect(
      (await db.query("select name from public.creatives")).rows,
    ).toHaveLength(1);
  });
  it("denies anonymous access to private creative rows", async () => {
    await db.exec("reset role; set role anon;");
    await expect(db.query("select * from public.creatives")).rejects.toThrow();
  });
  it("isolates private storage paths by user and bucket", async () => {
    await asUser(alice);
    await db.query(
      "insert into storage.objects(id,bucket_id,name) values ($1,$2,$3)",
      [creativeId, "creative-assets", `${alice}/product.webp`],
    );
    await expect(
      db.query(
        "insert into storage.objects(id,bucket_id,name) values ($1,$2,$3)",
        [bob, "creative-assets", `${bob}/product.webp`],
      ),
    ).rejects.toThrow();
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      1,
    );
    await asUser(bob);
    expect((await db.query("select * from storage.objects")).rows).toEqual([]);
  });
  it("lets only the owner delete a stored image", async () => {
    await asUser(bob);
    expect(
      (
        await db.query(
          "delete from storage.objects where id=$1 returning id",
          [creativeId],
        )
      ).rows,
    ).toEqual([]);
    await asUser(alice);
    expect(
      (
        await db.query(
          "delete from storage.objects where id=$1 returning id",
          [creativeId],
        )
      ).rows,
    ).toHaveLength(1);
  });
});
