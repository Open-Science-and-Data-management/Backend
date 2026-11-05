// OpenAPI registry — zod schemas register ที่นี่ เพื่อ gen spec (ADR-0010)
import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { errorEnvelopeSchema } from "./envelope.js";

extendZodWithOpenApi(z);
export const registry = new OpenAPIRegistry();

export { errorEnvelopeSchema };
