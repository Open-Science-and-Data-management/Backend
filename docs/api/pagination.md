# Pagination

Endpoint ที่เป็น List ทุกตัวใน API นี้ใช้ page-based offset pagination เดียวกัน
ผู้เรียกเลือกหน้าด้วย `page` และจำนวนต่อหน้าด้วย `limit` ผลลัพธ์จะถูกห่อใน envelope
`{ data, page, limit, total }` เสมอ ทำให้ frontend คำนวณจำนวนหน้าทั้งหมดจาก `total`
ได้ทันทีโดยไม่ต้องเดา ข้อมูลในระบบนี้ต่อผู้ใช้มีขนาดจำกัด (โปรเจกต์, DMP, งานต่อคน)
จึงเลือก offset ซึ่งอ่านง่ายกว่า cursor-based

## The list envelope object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

```json
{
  "data": [
    {
      "id": "6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74",
      "name": "Biodegradable Packaging Film from Cassava Starch"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 3
}
```

`data` คือ array ของ resource ตามหน้าที่ request — รูปทรงของแต่ละสมาชิกตามที่ระบุในหน้า resource นั้น

## Attributes

- `data` (array)
  รายการ object ของ resource ที่ request มา เรียงตามเกณฑ์ที่แต่ละ endpoint กำหนด (ปกติคือใหม่สุดก่อน)

- `page` (integer)
  หมายเลขหน้าปัจจุบัน เริ่มที่ 1

- `limit` (integer)
  จำนวน object สูงสุดต่อหน้า ตามค่า `limit` ที่ผู้เรียกส่งมา

- `total` (integer)
  จำนวน object ทั้งหมดที่ตรงกับเงื่อนไข ไม่ใช่เฉพาะหน้านี้ — ใช้คำนวณจำนวนหน้า: `ceil(total / limit)`

## Parameters

- `page` (optional, integer, default is 1)
  หมายเลขหน้าที่ต้องการ เริ่มที่ 1 — ข้ามหน้าที่ไม่มีข้อมูลได้ จะได้ `data` เป็น array ว่าง

- `limit` (optional, integer, default is 20)
  จำนวน object ต่อหน้า ระหว่าง 1 ถึง 100 — ค่าที่เกินช่วงถูกตัดเป็นค่าขอบ ไม่ตอบ error
