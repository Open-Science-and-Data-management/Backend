// diffDraft — pure (CON-2): เทียบ JSON tree ยึด entity id เสมอ → FieldChange[]
// Port จาก FE plan-diff.ts (ADR-0026); delta: ลบ UI label บางส่วนไม่ได้ —
// label ใช้กับ changes_summary ของคิวกรรมการ จึงคงไว้
import type { z } from "zod";
import type { EditType } from "@shared/contracts/enums.js";
import type { DmpDraftInput } from "@shared/contracts/index.js";
import {
  datasetFieldPolicy,
  dmpFieldPolicy,
  planListPolicy,
  type FieldPolicy,
} from "@shared/domain-profiles/field-policy.js";

type Edit = z.infer<typeof EditType>;

/** Lists inside a plan, and the id that identifies an entry in each. */
const LIST_ID = {
  dataset: "dataset_id",
  contributor: "contributor_id",
  cost: "cost_id",
} as const;
export type PlanList = keyof typeof LIST_ID;

/**
 * Exactly what a change touches, by entity id rather than array position — so
 * it can be replayed onto a different version of the plan, where outputs may
 * have been reordered, added or removed.
 */
export interface ChangeTarget {
  list?: PlanList;
  id?: string;
  field?: string;
  op: "set" | "add" | "remove";
}

export interface FieldChange {
  /** Where the value lives, e.g. `dataset[0].access`. */
  path: string;
  /** Machine-readable twin of `path`; absent on changes stored before it existed. */
  target?: ChangeTarget;
  /** The same thing in words, for a person reading the list. */
  label: string;
  from: string;
  to: string;
  edit_type: Edit;
}

const LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  language: "Language",
  begin_date: "Begin date",
  end_date: "End date",
  alternate_identifier: "Alternate identifier",
  ethical_issues_exist: "Ethical issues",
  ethical_issues_description: "Ethical issues description",
  ethical_issues_report: "Ethical issues report URL",
  indigenous_considerations: "Indigenous considerations",
  access: "Access",
  personal_data: "Personal data",
  sensitive_data: "Sensitive data",
  personal_data_plan: "Personal data plan",
  protection_level: "Protection level",
  security_classification_level: "Security classification",
  data_quality_assurance: "Quality assurance",
  keyword: "Keywords",
  located_at: "Located at",
  status: "Status",
  domain: "Research domain",
  domain_metadata: "Domain details",
  preservation: "Preservation",
  distribution: "Distribution",
  schema_fields: "Schema fields",
  type: "Output type",
  is_contact: "Primary contact",
  user_id: "Linked account",
  orcid: "ORCID",
  email: "Email",
  role: "Role",
  name: "Name",
  surname: "Surname",
  value: "Amount",
  currency_code: "Currency",
  "preservation.repository": "Repository",
  "preservation.duration": "Retention period",
  "distribution.license": "Licence",
};

const humanise = (key: string) =>
  LABELS[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** How a missing value reads in a change list. */
export const NOT_SET = "Not set";

const toDateKey = (value: Date): string => value.toISOString().slice(0, 10);

/** Stable enough to compare: dates by instant, objects by shape. */
const show = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return NOT_SET;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return toDateKey(value);
  if (Array.isArray(value)) return value.length === 0 ? NOT_SET : (value as unknown[]).map((v) => show(v)).join(", ");
  if (typeof value === "object") {
    return JSON.stringify(value, (_k: string, v: unknown) =>
      v instanceof Date ? v.toISOString() : v,
    );
  }
  return NOT_SET;
};

const same = (a: unknown, b: unknown) => show(a) === show(b);

/** One part of an object, or that part of every entry of a list. */
const partOf = (value: unknown, part: string): unknown =>
  Array.isArray(value)
    ? value.map((entry) => (entry as Record<string, unknown> | null)?.[part])
    : value && typeof value === "object"
      ? (value as Record<string, unknown>)[part]
      : undefined;

/**
 * Whether changing this field means the plan has to be looked at again.
 * ตัดสินจาก field-policy เท่านั้น — diff ไม่มีความเห็นของตัวเอง; object/list
 * (preservation, distribution) ตัดสินด้วยส่วนที่ policy ให้ major จริง ๆ
 */
const editTypeFor = (
  key: string,
  policies: Record<string, { isMajorTrigger?: boolean } | undefined>,
  values?: [unknown, unknown],
): Edit => {
  if (policies[key]?.isMajorTrigger) return "major";
  const majorParts = Object.entries(policies)
    .filter(
      ([path, policy]) =>
        path.startsWith(`${key}.`) && (policy?.isMajorTrigger ?? false),
    )
    .map(([path]) => path.slice(key.length + 1));
  if (majorParts.length === 0) return "minor";
  if (!values) return "major";
  const [before, after] = values;
  return majorParts.some((part) => !same(partOf(before, part), partOf(after, part)))
    ? "major"
    : "minor";
};

const listEdit = (policy: FieldPolicy): Edit =>
  policy.isMajorTrigger ? "major" : "minor";

const compare = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[],
  policies: Record<string, { isMajorTrigger?: boolean }>,
  prefix: string,
  labelPrefix: string,
  entity?: { list: PlanList; id: string },
): FieldChange[] =>
  keys
    .filter((key) => !same(before[key], after[key]))
    .map((key) => ({
      path: `${prefix}${key}`,
      target: { ...entity, field: key, op: "set" as const },
      label: `${labelPrefix}${humanise(key)}`,
      from: show(before[key]),
      to: show(after[key]),
      edit_type: editTypeFor(key, policies, [before[key], after[key]]),
    }));

const DMP_KEYS = Object.keys(dmpFieldPolicy).filter((key) => key !== "schema_version");

/** Descriptive fields compared even though no policy names them. */
const DESCRIPTIVE_DATASET_KEYS = [
  "type",
  "status",
  "located_at",
  "data_quality_assurance",
  "language",
  "domain",
  "domain_metadata",
  "preservation",
  "distribution",
  "protection_level_other_nomenclature",
  "protection_level_other",
  "security_classification_level_other_nomenclature",
  "security_classification_level_other",
];

const DATASET_KEYS = [
  ...new Set([
    ...Object.keys(datasetFieldPolicy).map((key) => key.split(".")[0]),
    ...DESCRIPTIVE_DATASET_KEYS,
  ]),
];

/** Exposed for the test that holds the diff to the policy. */
export const COMPARED_KEYS = { dmp: DMP_KEYS, dataset: DATASET_KEYS };

const outputLabel = (index: number) => `Research output ${String(index + 1)}: `;

/**
 * Contributors and costs: added, removed, or any field changed. Each entry is
 * matched by id, so reordering isn't a change. Severity is the list's policy.
 */
const compareList = <T extends Record<string, unknown>>(
  before: T[],
  after: T[],
  idKey: string,
  noun: string,
  nameOf: (entry: T) => string,
  path: string,
  policy: FieldPolicy,
): FieldChange[] => {
  const edit_type = listEdit(policy);
  const id = (entry: T, index: number) => {
  const v = entry[idKey];
  return typeof v === "string" ? v : `#${String(index)}`;
};
  const beforeById = new Map(before.map((e, i) => [id(e, i), e]));
  const afterIds = new Set(after.map((e, i) => id(e, i)));
  const changes: FieldChange[] = [];

  after.forEach((entry, index) => {
    const previous = beforeById.get(id(entry, index));
    if (!previous) {
      changes.push({
        path: `${path}[${String(index)}]`,
        target: { list: path as PlanList, id: id(entry, index), op: "add" },
        label: `${noun} added: ${nameOf(entry)}`,
        from: NOT_SET,
        to: nameOf(entry),
        edit_type,
      });
      return;
    }
    const keys = [...new Set([...Object.keys(previous), ...Object.keys(entry)])]
      .filter((key) => key !== idKey)
      .filter((key) => !same(previous[key], entry[key]));
    keys.forEach((key) => {
      changes.push({
        path: `${path}[${String(index)}].${key}`,
        target: { list: path as PlanList, id: id(entry, index), field: key, op: "set" },
        label: `${noun} ${String(index + 1)}: ${humanise(key)}`,
        from: show(previous[key]),
        to: show(entry[key]),
        edit_type,
      });
    });
  });

  before.forEach((entry, index) => {
    if (afterIds.has(id(entry, index))) return;
    changes.push({
      path: `${path}[${id(entry, index)}]`,
      target: { list: path as PlanList, id: id(entry, index), op: "remove" },
      label: `${noun} removed: ${nameOf(entry)}`,
      from: nameOf(entry),
      to: NOT_SET,
      edit_type,
    });
  });

  return changes;
};

/**
 * สิ่งที่ขยับระหว่าง version in force กับ draft ที่กำลังแก้ — สนใจแค่สองปลาย
 * (draft, baseSnapshot) โดย entity id เป็นตัวจับคู่เสมอ (ไม่ใช่ตำแหน่ง array)
 */
export const diffDraft = (
  draft: DmpDraftInput,
  baseSnapshot: DmpDraftInput,
): FieldChange[] => {
  const active = baseSnapshot;
  const working = draft;
  const changes: FieldChange[] = [
    ...compare(
      active,
      working,
      DMP_KEYS,
      dmpFieldPolicy,
      "",
      "",
    ),
  ];

  const before = active.dataset ?? [];
  const after = working.dataset ?? [];
  const byId = (list: { dataset_id?: string | undefined }[]) => new Map(list.map((d) => [d.dataset_id as string, d]));
  const beforeById = byId(before);
  const afterById = byId(after);

  after.forEach((dataset, index) => {
    const previous = beforeById.get(dataset.dataset_id as string);

    // Adding a whole output is judged by the list policy, like removing one.
    if (!previous) {
      changes.push({
        path: `dataset[${String(index)}]`,
        target: { list: "dataset", id: dataset.dataset_id as string, op: "add" },
        label: `Research output added: ${typeof dataset.title === "string" && dataset.title !== "" ? dataset.title : "Untitled"}`,
        from: NOT_SET,
        to: dataset.title || "Untitled",
        edit_type: listEdit(planListPolicy.dataset),
      });
      return;
    }

    changes.push(
      ...compare(
        previous,
        dataset,
        DATASET_KEYS,
        datasetFieldPolicy,
        `dataset[${String(index)}].`,
        outputLabel(index),
        { list: "dataset", id: dataset.dataset_id as string },
      ),
    );
  });

  before.forEach((dataset) => {
    if (afterById.has(dataset.dataset_id as string)) return;
    changes.push({
      path: `dataset[${String(dataset.dataset_id)}]`,
      target: { list: "dataset", id: dataset.dataset_id as string, op: "remove" },
      label: `Research output removed: ${typeof dataset.title === "string" && dataset.title !== "" ? dataset.title : "Untitled"}`,
      from: dataset.title || "Untitled",
      to: NOT_SET,
      edit_type: listEdit(planListPolicy.dataset),
    });
  });

  changes.push(
    ...compareList(
      (active.contributor ?? []) as Record<string, unknown>[],
      (working.contributor ?? []) as Record<string, unknown>[],
      "contributor_id",
      "Contributor",
      (c) => [c.title, c.name, c.surname].filter(Boolean).join(" ") || "Unnamed",
      "contributor",
      planListPolicy.contributor,
    ),
    ...compareList(
      (active.cost ?? []) as Record<string, unknown>[],
      (working.cost ?? []) as Record<string, unknown>[],
      "cost_id",
      "Cost item",
      (c) => (typeof c.title === "string" && c.title !== "" ? c.title : "Untitled"),
      "cost",
      planListPolicy.cost,
    ),
  );

  return changes;
};

/** One major anywhere makes the whole revision major. */
export const editTypeOf = (changes: FieldChange[]): Edit =>
  changes.some((c) => c.edit_type === "major") ? "major" : "minor";

export const countBy = (changes: FieldChange[]) => ({
  minor: changes.filter((c) => c.edit_type === "minor").length,
  major: changes.filter((c) => c.edit_type === "major").length,
});

type Entity = Record<string, unknown>;
const entries = (plan: DmpDraftInput, list: PlanList) =>
  ((plan as Record<string, unknown>)[list] ?? []) as Entity[];
const entityIn = (plan: DmpDraftInput, list: PlanList, id?: string) =>
  entries(plan, list).find((e) => String(e[LIST_ID[list]]) === id);

/** The raw value a change target points at, or the whole entry for add/remove. */
export const valueAt = (plan: DmpDraftInput, target: ChangeTarget): unknown => {
  if (!target.list) return (plan as Record<string, unknown>)[target.field ?? ""];
  const entity = entityIn(plan, target.list, target.id);
  return target.op === "set" ? entity?.[target.field ?? ""] : entity;
};

/** Whether two plans hold the same thing at a target. */
export const sameAt = (a: DmpDraftInput, b: DmpDraftInput, target: ChangeTarget) =>
  same(valueAt(a, target), valueAt(b, target));

/**
 * Replays `changes` onto `base`, taking each value from `source` and finding
 * entries by id. A change whose entry no longer exists in `base` can't land,
 * and is returned as skipped rather than dropped silently. Neither input is
 * modified.
 */
export const applyChanges = (
  base: DmpDraftInput,
  source: DmpDraftInput,
  changes: FieldChange[],
): { plan: DmpDraftInput; applied: FieldChange[]; skipped: FieldChange[] } => {
  const plan = structuredClone(base) as Record<string, unknown>;
  const applied: FieldChange[] = [];
  const skipped: FieldChange[] = [];

  changes.forEach((change) => {
    const t = change.target;
    if (!t) {
      skipped.push(change);
      return;
    }

    if (!t.list) {
      plan[t.field ?? ""] = structuredClone(valueAt(source, t));
      applied.push(change);
      return;
    }

    const list = (plan[t.list] ??= []) as Entity[];
    const key = LIST_ID[t.list];
    const index = list.findIndex((e) => String(e[key]) === t.id);

    if (t.op === "remove") {
      if (index >= 0) list.splice(index, 1);
      applied.push(change);
      return;
    }
    if (t.op === "add") {
      const added = entityIn(source, t.list, t.id);
      if (index < 0 && added) list.push(structuredClone(added));
      applied.push(change);
      return;
    }
    if (index < 0) {
      skipped.push(change);
      return;
    }
    list[index] = {
      ...list[index],
      [t.field ?? ""]: structuredClone(valueAt(source, t)),
    };
    applied.push(change);
  });

  return { plan: plan, applied, skipped };
};
