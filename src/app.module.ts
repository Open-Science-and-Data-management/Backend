import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ErrorEnvelopeFilter } from "./shared/http/error-envelope.js";

@Module({
  providers: [{ provide: APP_FILTER, useClass: ErrorEnvelopeFilter }],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS contract
export class AppModule {}
