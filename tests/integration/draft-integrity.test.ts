// SPEC-draft-integrity — CHECK constraint บังคับจริงบน Postgres (ADR-0031, integration)
// insert ผิดกฎ ≥ 1 กรณี/กฎ → ต้องโดน constraint; ของถูกกฎทุกกฎ → ผ่าน
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb } from "@/database/client.js";
import {
  aiThreadEntries,
  dmpVersions,
  dmps,
  users,
} from "@/database/schema/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/uni";

const { pool, db } = createDb(DATABASE_URL);

const dbReady = await db
  .execute(sql`select 1`)
  .then(
    () => true,
    () => false,
  );

const uid = "44444444-4444-7444-8444-444444444444";
const dmpId = "44444444-4444-7444-8444-444444444445";

function violation<T>(p: Promise<T>) {
  return p.then(
    () => "no-error",
    (e: unknown) => {
      let cur: unknown = e;
      let detail: string | undefined;
      while (typeof cur === "object" && cur !== null) {
        if ("constraint" in cur && typeof cur.constraint === "string") detail ??= cur.constraint;
        cur = "cause" in cur ? cur.cause : undefined;
      }
      return detail ?? (e instanceof Error ? e.message : String(e));
    },
  );
}

describe.skipIf(!dbReady)("draft integrity constraints (integration, ADR-0031)", () => {
  beforeAll(async () => {
    await db.delete(dmps).where(sql`dmp_id = ${dmpId} or created_by = ${uid}`); // กันรันค้างเก่า
    await db.delete(users).where(sql`user_id = ${uid}`);
    await db.insert(users).values({ userId: uid, username: "draft-integrity", email: "di@x.edu", name: "A", surname: "B" });
    await db.insert(dmps).values({ dmpId, title: "DI", draft: {}, createdBy: uid });
  });

  afterAll(async () => {
    await db.delete(dmps).where(sql`dmp_id = ${dmpId}`); // version/entry cascade ตาม
    await db.delete(users).where(sql`user_id = ${uid}`);
    await pool.end();
  });

  const version = (over: Partial<typeof dmpVersions.$inferInsert>) => ({
    dmpId,
    number: 900,
    snapshot: {} as unknown,
    ...over,
  });

  describe("D1 — draft/snapshot/based_on_snapshot: key ⊆ dmpSchema", () => {
    it("draft key มั่ว → โดน dmps_draft_object_keys", async () => {
      expect(await violation(db.update(dmps).set({ draft: { nope: 1 } }).where(sql`dmp_id = ${dmpId}`)))
        .toContain("dmps_draft_object_keys");
    });

    it("snapshot key มั่ว → โดน dmp_versions_snapshot_object_keys", async () => {
      expect(await violation(db.insert(dmpVersions).values(version({ number: 901, snapshot: { junk: true } }))))
        .toContain("dmp_versions_snapshot_object_keys");
    });

    it("based_on_snapshot key มั่ว → โดน; null ผ่าน", async () => {
      expect(await violation(db.insert(dmpVersions).values(version({ number: 902, basedOnSnapshot: { x: 1 } }))))
        .toContain("dmp_versions_based_on_snapshot_object_keys");
      await db.insert(dmpVersions).values(version({ number: 903, basedOnSnapshot: null }));
    });

    it("draft/snapshot {} ว่างและ key ครบชุดจริง → ผ่าน", async () => {
      await db.update(dmps).set({ draft: {} }).where(sql`dmp_id = ${dmpId}`);
      await db.insert(dmpVersions).values(version({ number: 904, snapshot: { title: "t", dataset: [], schema_version: "1.0" } }));
    });
  });

  describe("D2/D3 — FieldChange[]: null หรือ array ของ object(path,label,from,to:string)", () => {
    const withChanges = (changes: unknown) => version({ number: 910, changes: changes });

    it("element ไม่ใช่ object → โดน", async () => {
      expect(await violation(db.insert(dmpVersions).values(withChanges(["nope"]))))
        .toContain("dmp_versions_changes_field_changes");
    });

    it("ขาด to / path ไม่ใช่ string → โดน", async () => {
      expect(await violation(db.insert(dmpVersions).values(withChanges([{ path: "t", label: "l", from: "a" }]))))
        .toContain("dmp_versions_changes_field_changes");
      expect(await violation(db.insert(dmpVersions).values(withChanges([{ path: 1, label: "l", from: "a", to: "b" }]))))
        .toContain("dmp_versions_changes_field_changes");
    });

    it("รูปจริงจาก diffDraft (มี target/edit_type เกิน) → ผ่าน; null → ผ่าน", async () => {
      await db.insert(dmpVersions).values(withChanges([
        { path: "title", label: "Title", from: "a", to: "b", target: { op: "set" }, edit_type: "minor" },
      ]));
      await db.insert(dmpVersions).values(version({ number: 911, changes: null }));
    });

    it("minor_edits รูปผิด → โดน dmp_versions_minor_edits_field_changes", async () => {
      expect(await violation(db.insert(dmpVersions).values(version({ number: 912, minorEdits: [{ path: "t" }] }))))
        .toContain("dmp_versions_minor_edits_field_changes");
    });
  });

  describe("D4 — decision_approver: null หรือ object(key ⊆ APPROVER_KEYS, value:string)", () => {
    it("value ไม่ใช่ string → โดน; key มั่ว → โดน", async () => {
      expect(await violation(db.insert(dmpVersions).values(version({ number: 920, status: "approved", decisionApprover: { user_id: 5, name: "n", position: "p", mbox: "m" } }))))
        .toContain("dmp_versions_decision_approver_keys");
      expect(await violation(db.insert(dmpVersions).values(version({ number: 921, status: "approved", decisionApprover: { user_id: "u", extra: "x" } }))))
        .toContain("dmp_versions_decision_approver_keys");
    });

    it("รูปที่ decide เขียนจริง → ผ่าน; null → ผ่าน", async () => {
      await db.insert(dmpVersions).values(version({ number: 922, status: "approved", decisionApprover: { user_id: uid, name: "A", position: "researcher", mbox: "a@x.edu" } }));
      await db.insert(dmpVersions).values(version({ number: 923, status: "rejected", decisionApprover: null }));
    });
  });

  describe("D5 — ai_thread_entries.content แยกตาม kind", () => {
    const entry = (kind: "user" | "assistant" | "event", content: unknown) =>
      db.insert(aiThreadEntries).values({ dmpId, ownerId: uid, kind, content: content });

    it("ฐานร่วม — content ไม่ใช่ object → โดน", async () => {
      expect(await violation(entry("user", "plain string"))).toContain("ai_thread_entries_content_by_kind");
    });

    it("user ผสม {text,action} → โดน; 2 รูปจริง → ผ่าน", async () => {
      expect(await violation(entry("user", { text: "hi", action: "extract" })))
        .toContain("ai_thread_entries_content_by_kind");
      await entry("user", { text: "ช่วยดูหัวข้อ 3", section: "3. Data summary" });
      await entry("user", { action: "extract", direction: "สกัดหัวข้อ 3" });
    });

    it("assistant ไม่มี action → โดน; ครบ action/text/proposal → ผ่าน", async () => {
      expect(await violation(entry("assistant", { text: "hi" })))
        .toContain("ai_thread_entries_content_by_kind");
      await entry("assistant", { action: "extract", text: "ทำแล้ว", proposal: {} });
    });

    it("event ไม่มี action → โดน; {action,usage} และ {action,usage,dmp_id} → ผ่าน", async () => {
      expect(await violation(entry("event", { usage: { total_tokens: 1 } })))
        .toContain("ai_thread_entries_content_by_kind");
      await entry("event", { action: "extract", usage: { total_tokens: 10 } });
      await entry("event", { action: "analyze-proposal", usage: null, dmp_id: dmpId });
    });
  });
});
