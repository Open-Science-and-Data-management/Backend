# Pagination

List endpoints ใช้ cursor-based pagination แบบ Stripe ผ่าน `ListEnvelope` — ไม่มี page/offset (ADR-0015)

## The list envelope

```json
{
  "object": "list",
  "data": [ ... ],
  "has_more": true,
  "total_count": 42
}
```

> [!NOTE] Reconstructed from code

### Attributes

- **object** (string) ค่าคงที่ `"list"`
- **data** (array) รายการ object ของ resource นั้น ๆ
- **has_more** (boolean) `true` ถ้ายังมีรายการหลังหน้านี้ — server probe ด้วย `limit + 1` รายการ
- **total_count** (number) จำนวนรายการทั้งหมดโดยไม่สน cursor/limit — ใช้ทำ stat card

## Parameters

- **limit** (integer, optional) จำนวนรายการต่อหน้า มี default และ ceiling ต่อ resource เช่น default 20, cap 100 — เกิน cap หรือไม่ใช่ integer ≥1 จะถูก validate ด้วย Zod
- **starting_after** (string, optional) cursor: id ของรายการสุดท้ายในหน้าก่อน — คืนรายการถัดจาก id นี้ id ที่ไม่รู้จัก → 400 `field_invalid`

## Fetching all pages

วนซ้ำโดยใช้ id ตัวสุดท้ายของ `data` เป็น `starting_after` จนกว่า `has_more` เป็น `false`:

```curl
curl "http://localhost:3000/notifications?limit=20&starting_after=01900000-0000-7000-8000-000000000000" \
  -H "Authorization: Bearer <access token>"
```

> [!NOTE] Reconstructed from code

## Where it applies

- [DMPs](dmps.md) — `GET /dmps` (filters + `limit`)
- [Reviews](reviews.md) — `GET /reviews` (default 20, cap 100)
- [Notifications](notifications.md) — `GET /notifications` (default 20, cap 100, envelope เสริม `unread_count`)
