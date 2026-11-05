// DiskStorage adapter — เก็บบน volume (dev/compose); path จาก config.toml
import { Injectable } from "@nestjs/common";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { FileStorage } from "@/shared/ports/file-storage.js";
import { config } from "@/shared/config/index.js";

@Injectable()
export class DiskStorage implements FileStorage {
  private get root(): string {
    return config().files.storagePath;
  }

  async put(data: Buffer): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const key = `${randomUUID()}.bin`; // ชื่อไฟล์จริงไม่ใช้ — ป้องกัน path traversal
    await writeFile(join(this.root, key), data);
    return key;
  }

  async get(storagePath: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.root, storagePath));
    } catch {
      return null; // ENOENT — record มีแต่ไฟล์หาย
    }
  }

  async delete(storagePath: string): Promise<void> {
    await unlink(join(this.root, storagePath)).catch(() => undefined);
  }
}
