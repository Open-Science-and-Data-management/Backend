// Fixture — ตั้งใจให้ import ผิด boundary (CON-2); eslint + tsc จงใจ ignore ไฟล์นี้
// และ test วิ่ง eslint ด้วย --no-ignore เพื่อยืนยันว่า rule จับได้จริง
import { Injectable } from "@nestjs/common";
import { Pool } from "pg";
import axios from "axios";

const _forbiddenDb: Pool | null = null;
const _forbiddenHttp: typeof axios | null = null;

@Injectable()
export class BoundaryViolation {
  constructor() {
    void _forbiddenDb;
    void _forbiddenHttp;
  }
}
