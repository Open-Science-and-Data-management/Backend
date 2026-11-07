# Errors

API คืน error ทุกกรณีในรูปแบบเดียว (Stripe-style envelope) ผ่าน global exception filter — ไม่มีจุด throw ใด format เอง (ADR-0014)

## The error object

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "field_invalid",
    "message": "title is required",
    "param": "/title"
  }
}
```

> [!NOTE] Reconstructed from code

### Attributes

- **type** (string) ประเภท error หลัก อนุมานจาก HTTP status

  | Value | Status |
  | --- | --- |
  | `invalid_request_error` | 400 |
  | `authentication_error` | 401 |
  | `permission_error` | 403 |
  | `not_found_error` | 404 |
  | `conflict_error` | 409 |
  | `unprocessable_error` | 422 |
  | `api_error` | อื่น ๆ รวมถึง 500 |

- **code** (string) รหัส machine-readable ของ error (เช่น `not_signed_in`, `draft_conflict`) — ใช้ branch ใน client แทนการอ่าน message
- **message** (string) คำอธิบายสำหรับ developer อ่าน
- **param** (string, optional) JSON pointer ชี้ field ที่มีปัญหา เช่น `/title` — มีเฉพาะ error ที่ผูกกับ field

## Validation errors

Body ที่ไม่ผ่าน Zod กลายเป็น 400 `field_invalid` — issue แรกของ Zod ถูกแปลงเป็น JSON pointer ใน `param` และ message ของ issue นั้นกลายเป็น `message`

## Upload size limit

Request ที่เกินขนาดไฟล์อนุญาตได้ 413 `file_too_large`

## Handling advice

- อ่าน `code` เป็นหลัก `param` ใช้ highlight field ใน UI
- 404 ถูกใช้เพื่อ **ซ่อนการมีอยู่ของ resource** (ไม่แยก 403 กับ 404 ให้คนนอกโปรเจกต์เห็น) — อย่าใช้ 404 สรุปว่า resource ไม่มีจริง
- 409 `draft_conflict` แนบ field เพิ่มเติมใน `error` object (เช่น `draft_revision` ปัจจุบัน) เพื่อให้ client rebase ได้

## Where it applies

ทุก endpoint ใน API ใช้ envelope นี้ — ตาราง error ราย endpoint อยู่ในแต่ละหน้า resource (เช่น [DMPs](dmps.md), [Tasks](tasks.md))
