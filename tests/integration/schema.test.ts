// QS-1 — Postgres ปฏิเสธเอง: ยิง violation ตรง ๆ ทุก constraint ก่อนผ่าน
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb } from "@/database/client.js";
import {
  credentials,
  dmpVersions,
  dmps,
  fileRecords,
  projectMembers,
  projects,
  refreshTokens,
  users,
} from "@/database/schema/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/uni";

const { pool, db } = createDb(DATABASE_URL);

// ต้องมี Postgres ก่อน — `docker compose -f docker-compose.dev.yml up -d && pnpm db:migrate`
// ไม่มี DB → ข้าม suite (unit test ยังวิ่งเต็มชุด)
const dbReady = await db
  .execute(sql`select 1`)
  .then(
    () => true,
    () => false,
  );

describe.skipIf(!dbReady)("schema constraints (integration, QS-1)", () => {
  beforeAll(async () => {
    // เริ่มสะอาดทุกรัน — ลบข้อมูลเก่าจากรันก่อน
    await db.execute(sql`truncate table reopen_offers, idempotency_keys, ai_thread_entries,
      notifications, file_chunks, tasks, dmp_versions, dmps, project_members, projects,
      refresh_tokens, credentials, file_records, users cascade`);
  });

afterAll(async () => {
  await pool.end();
});

async function seedUser(id: string) {
  await db.insert(users).values({ userId: id, username: `u-${id.slice(0, 8)}`, email: `${id}@x.edu`, name: "A", surname: "B" });
}

function violation<T>(p: Promise<T>) {
  return p.then(
    () => "no-error",
    (e: unknown) => {
      // drizzle ครอบ pg error ไว้ใน cause — ไล่หา SQLSTATE ที่ `code`
      let cur: unknown = e;
      let detail: string | undefined;
      while (typeof cur === "object" && cur !== null) {
        if ("constraint" in cur && typeof cur.constraint === "string") detail ??= cur.constraint;
        const msg = "message" in cur && typeof cur.message === "string" ? cur.message : "";
        if (msg.includes("violates foreign key")) detail ??= "violates foreign key constraint";
        cur = "cause" in cur ? cur.cause : undefined;
      }
      return detail ?? (e instanceof Error ? e.message : String(e));
    },
  );
}

describe("users", () => {
  it("ยอมรับ email ต่างเคส/ช่องว่างเพราะ index จับที่ normalize ค่าเดิม", async () => {
    await seedUser("11111111-1111-7111-8111-111111111111");
    const dup = await violation(
      db.insert(users).values({
        userId: "11111111-1111-7111-8111-111111111112",
        username: "u-case",
        email: "  11111111-1111-7111-8111-111111111111@X.EDU ",
        name: "A",
        surname: "B",
      }),
    );
    expect(dup).toContain("users_email_normalized_uq");
  });
});

describe("project_members", () => {
  it("PK คู่ (project_id, user_id) — สมาชิกซ้ำถูกปฏิเสธ", async () => {
    const pid = "22222222-2222-7222-8222-222222222221";
    const uid = "11111111-1111-7111-8111-111111111111";
    await db.insert(projects).values({ projectId: pid, projectName: "P", createdBy: uid });
    await db.insert(projectMembers).values({ projectId: pid, userId: uid, projectRole: "researcher" });
    const dup = await violation(
      db.insert(projectMembers).values({ projectId: pid, userId: uid, projectRole: "chief" }),
    );
    expect(dup).toContain("project_members_project_id_user_id_pk");
  });
});

describe("dmp_versions", () => {
  let dmpId: string;

  beforeAll(async () => {
    dmpId = "33333333-3333-7333-8333-333333333331";
    const pid = "22222222-2222-7222-8222-222222222221";
    await db.insert(dmps).values({ dmpId, projectId: pid, title: "T", draft: {} });
    await db.insert(dmpVersions).values({ dmpId, number: 1, status: "approved", snapshot: {} });
  });

  it("UNIQUE (dmp_id, number) — เลขเวอร์ชันซ้ำถูกปฏิเสธ", async () => {
    const dup = await violation(
      db.insert(dmpVersions).values({ dmpId, number: 1, status: "rejected", snapshot: {} }),
    );
    expect(dup).toContain("dmp_versions_dmp_number_uq");
  });

  it("partial unique — หนึ่ง pending ต่อแผน", async () => {
    await db.insert(dmpVersions).values({ dmpId, number: 2, status: "pending", snapshot: {} });
    const dup = await violation(
      db.insert(dmpVersions).values({ dmpId, number: 3, status: "pending", snapshot: {} }),
    );
    expect(dup).toContain("dmp_versions_one_pending_uq");

    // แผนอื่นมี pending ได้อิสระ
    const otherDmp = "33333333-3333-7333-8333-333333333332";
    await db.insert(dmps).values({
      dmpId: otherDmp,
      projectId: "22222222-2222-7222-8222-222222222221",
      title: "T2",
      draft: {},
    });
    const ok = await db
      .insert(dmpVersions)
      .values({ dmpId: otherDmp, number: 1, status: "pending", snapshot: {} })
      .returning({ id: dmpVersions.versionId });
    expect(ok).toHaveLength(1);
  });

  it("หลาย draft/rejected ต่อแผนยังอนุญาต", async () => {
    const ok = await db
      .insert(dmpVersions)
      .values([
        { dmpId, number: 4, status: "rejected", snapshot: {} },
        { dmpId, number: 5, status: "rejected", snapshot: {} },
      ])
      .returning({ id: dmpVersions.versionId });
    expect(ok).toHaveLength(2);
  });
});

describe("credentials", () => {
  it("PK username อ้าง users.username — ซ้ำถูกปฏิเสธ", async () => {
    const uid = "11111111-1111-7111-8111-111111111111";
    const username = `u-${uid.slice(0, 8)}`;
    await db.insert(credentials).values({ username, passwordHash: "h" });
    const dup = await violation(db.insert(credentials).values({ username, passwordHash: "h2" }));
    expect(dup).toContain("credentials_pkey");
  });
});

describe("refresh_tokens", () => {
  it("token_hash ซ้ำถูกปฏิเสธ (rotation family)", async () => {
    const uid = "11111111-1111-7111-8111-111111111111";
    const family = "44444444-4444-7444-8444-444444444441";
    const hash = "sha256-of-token";
    await db.insert(refreshTokens).values({
      userId: uid,
      tokenHash: hash,
      familyId: family,
      expiresAt: new Date("2030-01-01"),
    });
    const dup = await violation(
      db.insert(refreshTokens).values({
        userId: uid,
        tokenHash: hash,
        familyId: family,
        expiresAt: new Date("2030-01-01"),
      }),
    );
    expect(dup).toContain("refresh_tokens_hash_uq");
  });
});

describe("file_records / tasks FK", () => {
  it("file ของ project ที่ไม่มีจริงถูก FK ปฏิเสธผ่าน uploaded_by", async () => {
    const noUser = await violation(
      db.insert(fileRecords).values({
        uploadedBy: "99999999-9999-7999-8999-999999999999",
        filename: "a.docx",
        fileType: "docx",
        purpose: "proposal",
        storagePath: "data/files/a.docx",
      }),
    );
    expect(noUser).toContain("uploaded_by");
  });
});

});
