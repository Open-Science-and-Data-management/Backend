// FileStorage port — I/O ไฟล์ผ่าน interface เดียว เผื่อสลับ S3 (QS-7, ADR-0002)
export interface FileStorage {
  /** เขียน bytes คืน path/key สำหรับอ่านภายหลัง */
  put(data: Buffer): Promise<string>;
  /** อ่าน bytes จาก path/key — null เมื่อไม่มีไฟล์อยู่ */
  get(storagePath: string): Promise<Buffer | null>;
  /** ลบไฟล์จริง — เรียกเมื่อ record ลบเท่านั้น */
  delete(storagePath: string): Promise<void>;
}

export const FILE_STORAGE = Symbol("FILE_STORAGE");
