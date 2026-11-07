// Content-Disposition ตาม RFC 6266/5987 — ชื่อไฟล์ non-ASCII (ไทย) ต้องอยู่ใน `filename*=UTF-8''…`
// `filename=` เป็น ASCII fallback เท่านั้น: ฝัง UTF-8 ดิบไม่ได้ (Node ปฏิเสธ header) และ `"` `\` ต้องห้ามใน quoted-string
export function attachmentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
