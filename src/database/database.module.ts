// Postgres pool + Drizzle เดียวสำหรับทั้งแอป — inject ผ่าน DB token
import { Global, Module } from "@nestjs/common";
import { createDb } from "./client.js";

export const DB = Symbol("DB");
export const POOL = Symbol("POOL");

const { pool, db } = createDb();

@Global()
@Module({
  providers: [
    { provide: POOL, useValue: pool },
    { provide: DB, useValue: db },
  ],
  exports: [POOL, DB],
})
export class DatabaseModule {}
