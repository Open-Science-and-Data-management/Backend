# Development Dependencies — ลำดับการพัฒนาแต่ละ feature

**Date:** 2026-11-04 **Status:** Draft
**อ้างอิง:** [`arc42.md`](arc42.md) (หมวด 5.2 features, หมวด 6 runtime view)

> แผนภาพนี้ใช้สำหรับ **วางแผน dev** — ลูกศร `A → B` อ่านว่า "ต้องมี A ก่อน ถึงเริ่ม B ได้"
> จัดเป็นระลอก (wave) ตามลำดับที่เริ่มพัฒนาได้จริง ไม่ใช่แผนภาพสถาปัตยกรรม runtime

```mermaid
flowchart TD
    subgraph W0["ระลอก 0 — ฐานราก เริ่มได้ทันที"]
        DB[("database — drizzle schema + migrations 13 ตาราง")]
        CFG["shared/config"]
        CT["shared/contracts — zod source of truth"]
        EN["shared/domain-engine — pure functions"]
        DP["shared/domain-profiles + field-policy"]
        PT["shared/ports + adapters"]
    end

    subgraph W1["ระลอก 1 — บัญชี"]
        US["users — profile, provisioning, โควตา"]
        AU["auth — JWT, refresh, guards"]
    end

    subgraph W2["ระลอก 2 — โครงการและไฟล์"]
        PR["projects + members"]
        FI["files — upload, docx parse, RAG chunks"]
    end

    subgraph W3["ระลอก 3 — วงจรแผน DMP"]
        DM["dmps — draft, submit, versions, decisions"]
        TK["tasks — lifecycle, evidence, progress"]
        RV["reviews — คิวกรรมการ"]
        NO["notifications — polling"]
    end

    subgraph W4["ระลอก 4 — มูลค่าเพิ่ม"]
        AI["ai — ReAct loop + SSE"]
        EX["exports"]
    end

    US --> AU
    AU --> PR
    US -->|สมาชิกโครงการ| PR
    PR --> FI
    PT -->|DiskStorage| FI
    PR --> DM
    EN -->|diff, classify, carry, validate| DM
    CT -->|draft schema| DM
    DP -->|validate domain_metadata| DM
    DM -->|approve → เกิด tasks| TK
    EN -->|task generator| TK
    DM -->|read model dmp_versions| RV
    DM -->|แถวสร้างใน tx เดียวกับ submit/approve| NO
    FI -->|extracted text + chunks| AI
    DM -->|read_draft, thread scope| AI
    US -->|โควตา ai_token| AI
    PT -->|AiClient ไป OpenRouter| AI
    DM -->|projection| EX

    classDef deferred stroke-dasharray: 5 5
    class EX deferred
```

## ข้อสังเกตสำหรับการวางแผน

- **`shared/domain-engine` เริ่มวันแรกได้เลย ไม่รอใคร** — pure functions ห้ามแตะ DB/HTTP (CON-2) เขียน test-first ขนานกับทุกอย่าง แต่ `dmps` ต้องรอมัน
- **`users` แตกสองช่วง** — ตาราง `users`/`credentials` ต้องมีก่อน `auth` (sign-up/sign-in อ่านตารางนี้) แต่ endpoint admin provisioning / password reset มาหลัง `auth` เพราะใช้ guard
- **`notifications` ไม่ใช่ block แรก** — แถวถูกสร้างใน transaction เดียวกับ submit/approve ของ `dmps` ดังนั้น dev ระลอก 3 พร้อมกับ dmps ได้ แต่ endpoint poll อย่างเดียวเริ่มเร็วกว่านั้นได้
- **`ai` มาท้ายสุดของ chain เพราะแหกข้าม 3 feature** — ต้องมีทั้ง `files` (RAG chunks — ADR-0025), `dmps` (read_draft, thread scope), `users` (โควตา token) และ adapter `AiClient` → OpenRouter (key จาก env — TC-6)
- **`exports` deferred** — ออกจาก scope v1 แล้ว (ADR-0019, เส้นประ) FE ทำใน browser ไม่ต้องจองทีม dev
- **ของที่ทุก feature ใช้เหมือนกันและไม่วาดซ้ำใน diagram:** `database`, `shared/config`, `shared/contracts` และ auth guard ครอบทุก endpoint (mutation ระบุผู้กระทำจาก JWT subject)
- **ข้อจำกัดข้อมูล (TC-5) ปิดแล้ว (2026-11-04):** repo `Frontend` อยู่บนดิสก์ — port domain profiles และ task generator (STAGE_PLAN) ตั้งแต่ระลอก 0 ได้ทันที (ADR-0026/0027) ไม่ต้องครอบค่าชั่วคราว
