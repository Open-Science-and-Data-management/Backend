export type FieldPermission = "ai" | "human" | "locked";

export type FieldKind =
  "prose" | "choice" | "date" | "number" | "identifier" | "boolean" | "list";

export interface FieldPolicy {
  permission: FieldPermission;
  kind: FieldKind;
  isMajorTrigger?: boolean;
  editableBeforeApproval?: boolean;
  /**
   * The assistant stays out of this field entirely: no rewrite, no polish,
   * no chat suggestion. For text whose substance has to come from people
   * and process, not from a model.
   */
  noAiAssist?: boolean;
}

/**
 * How far a rewrite may go. Either way it comes back as a suggestion the
 * researcher accepts or rejects; nothing is written in on its own.
 * `rewrite`: the AI owns the wording, so any direction, even from blank.
 * `polish`: the words are the researcher's, so wording changes only, and
 * only once they've written something.
 */
export type RegenerateMode = "rewrite" | "polish";

/** The one rule for "Regenerate with AI": free text, and never a locked field. */
export const regenerateMode = (policy?: FieldPolicy): RegenerateMode | null => {
  if (!policy || policy.kind !== "prose" || policy.noAiAssist) return null;
  if (policy.permission === "ai") return "rewrite";
  if (policy.permission === "human") return "polish";
  return null;
};

/**
 * The directions that change wording only. A rewrite of the researcher's own
 * text is limited to these: "emphasise X" or a free instruction can put
 * something in their mouth they never said.
 */
export const isWordingOnly = (direction: { kind: string }) =>
  direction.kind === "shorter" || direction.kind === "formal";

export const canRegenerate = (policy?: FieldPolicy): boolean =>
  regenerateMode(policy) !== null;

export const dmpFieldPolicy: Record<string, FieldPolicy> = {
  title: { permission: "ai", kind: "prose" },
  description: { permission: "ai", kind: "prose" },
  language: { permission: "ai", kind: "choice" },
  alternate_identifier: { permission: "human", kind: "identifier" },
  // Locked to the AI throughout. People can change the timeline after
  // approval too, but that is a change to what was agreed.
  begin_date: {
    permission: "locked",
    kind: "date",
    editableBeforeApproval: true,
    isMajorTrigger: true,
  },
  end_date: {
    permission: "locked",
    kind: "date",
    editableBeforeApproval: true,
    isMajorTrigger: true,
  },
  ethical_issues_exist: {
    permission: "human",
    kind: "boolean",
    isMajorTrigger: true,
  },
  ethical_issues_description: { permission: "human", kind: "prose" },
  // A link to the ethics report (maDMP: a URI), not text to phrase.
  ethical_issues_report: { permission: "human", kind: "identifier" },
  // Indigenous data sovereignty: what goes here comes out of consultation
  // with the community. Wording from a model would read as if it had.
  indigenous_considerations: {
    permission: "human",
    kind: "prose",
    isMajorTrigger: true,
    noAiAssist: true,
  },
  schema_version: { permission: "locked", kind: "identifier" },
};

export const datasetFieldPolicy: Record<string, FieldPolicy> = {
  title: { permission: "ai", kind: "prose" },
  description: { permission: "ai", kind: "prose" },
  keyword: { permission: "ai", kind: "list" },
  schema_fields: { permission: "ai", kind: "list" },
  access: { permission: "human", kind: "choice", isMajorTrigger: true },
  personal_data: { permission: "human", kind: "choice", isMajorTrigger: true },
  sensitive_data: { permission: "human", kind: "choice" },
  personal_data_plan: {
    permission: "human",
    kind: "prose",
    isMajorTrigger: true,
  },
  protection_level: {
    permission: "human",
    kind: "choice",
    isMajorTrigger: true,
  },
  security_classification_level: {
    permission: "human",
    kind: "choice",
    isMajorTrigger: true,
  },
  "preservation.statement": { permission: "human", kind: "prose" },
  // Where the output is kept, for how long, and on what terms it's shared
  // are commitments, so changing one goes back for sign-off. The diff judges
  // preservation and distribution by these parts, so rewording the statement
  // above stays minor.
  "preservation.repository": {
    permission: "human",
    kind: "identifier",
    isMajorTrigger: true,
  },
  "preservation.duration": {
    permission: "human",
    kind: "choice",
    isMajorTrigger: true,
  },
  "distribution.license": {
    permission: "human",
    kind: "identifier",
    isMajorTrigger: true,
  },
};

/**
 * The lists inside a plan, judged per entry: adding one, removing one, or
 * changing any field of one. For research outputs, a change *within* an
 * existing output is judged field by field by `datasetFieldPolicy`; adding or
 * removing a whole output is judged here.
 *
 * Together with the two maps above, this is the only place `isMajorTrigger`
 * is set — plan-diff and the "needs sign-off again" list both read it.
 */
export const planListPolicy: Record<
  "dataset" | "contributor" | "cost",
  FieldPolicy
> = {
  dataset: { permission: "human", kind: "list", isMajorTrigger: true },
  // Who is responsible for the data is a commitment: adding, removing or
  // changing a contributor, the contact included, goes back for sign-off.
  contributor: { permission: "human", kind: "list", isMajorTrigger: true },
  cost: { permission: "human", kind: "list" },
};
