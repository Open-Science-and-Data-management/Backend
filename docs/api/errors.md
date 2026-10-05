# Errors

API ใช้ HTTP status codes ตามธรรมเนียมปกติ: `2xx` หมายถึงสำเร็จ, `4xx` หมายถึง
ผู้เรียกทำผิด (ส่งพารามิเตอร์ผิด, ยังไม่ยืนยันตัวตน, หรือไม่มีสิทธิ์),
และ `5xx` หมายถึงความผิดพลาดฝั่งเซิร์ฟเวอร์ ทุก error — ไม่ว่า status ใด —
จะถูกส่งกลับใน envelope เดียวกัน เพื่อให้ frontend เขียน error handling เพียงครั้งเดียว
ใช้ได้กับทุก endpoint ดู cross-link จากทุกหน้า resource ได้ที่ [index](index.md)

## HTTP status codes

| Code | Name | เกิดเมื่อ |
| --- | --- | --- |
| 400 | Bad Request | พารามิเตอร์ขาดหาย ผิดรูปแบบ หรือ validation ไม่ผ่าน |
| 401 | Unauthorized | ไม่ได้ส่ง token, token หมดอายุ หรือ token ไม่ถูกต้อง |
| 403 | Forbidden | ล็อกอินแล้วแต่ไม่มีสิทธิ์กับ resource นี้ (รวมถึงโควตา AI หมด) |
| 404 | Not Found | ไม่พบ resource ตาม ID ที่ระบุ หรือผู้เรียกไม่มีสิทธิ์จะรู้ว่ามีอยู่ |
| 409 | Conflict | สถานะปัจจุบันขัดแย้งกับ action เช่น duplicate member, DMP ไม่อยู่ในสถานะที่แก้ไขได้, กรรมการตัดสินซ้ำ |
| 500 | Internal Server Error | ความผิดพลาดฝั่งเซิร์ฟเวอร์ |

## Error types

| type | เกิดเมื่อ |
| --- | --- |
| `invalid_request` | validation ไม่ผ่าน — ส่งคู่กับ 400 |
| `authentication_error` | token ขาด หมดอายุ หรือไม่ถูกต้อง — ส่งคู่กับ 401 |
| `permission_error` | ไม่มีสิทธิ์ หรือโควตา AI หมด — ส่งคู่กับ 403 |
| `not_found` | ไม่พบ resource — ส่งคู่กับ 404 |
| `conflict` | สถานะขัดแย้งกับ action — ส่งคู่กับ 409 |
| `api_error` | ความผิดพลาดฝั่งเซิร์ฟเวอร์ — ส่งคู่กับ 500 |

## The error object

```json
{
  "error": {
    "type": "invalid_request",
    "message": "title is required",
    "param": "title"
  }
}
```

## Attributes

- `type` (string, value is one of the [error types](#error-types) above)
  ประเภทของ error — frontend ใช้ค่านี้แยกการจัดการ เช่น `authentication_error` ให้พาไปหน้า login, `permission_error` ให้แจ้งว่าไม่มีสิทธิ์

- `message` (string)
  ข้อความอธิบายที่อ่านได้ทันที (ภาษาอังกฤษ) เหมาะสำหรับ log หรือ debug — ไม่ได้ออกแบบให้แสดงต่อผู้ใช้ปลายทางโดยตรง

- `param` (string, nullable)
  ชื่อพารามิเตอร์ที่ทำให้เกิด error เช่น `"title"` — มีค่าเฉพาะเมื่อ error เกิดจากพารามิเตอร์ใดพารามิเตอร์หนึ่งจุดเดียว มิฉะนั้นเป็น `null`
