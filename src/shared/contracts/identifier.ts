import { z } from "zod";
import { IdentifierType } from "./enums.js";

export const identifierSchema = z.object({
  identifier: z.string().min(1),
  type: IdentifierType,
});
export type Identifier = z.infer<typeof identifierSchema>;
