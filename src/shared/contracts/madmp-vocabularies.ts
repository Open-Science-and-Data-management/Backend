/**
 * Controlled vocabularies from the GCWG-RDA maDMP standard, v3.0.
 * Source: https://github.com/FAIRERdata/maDMP-Standard (JSON/GCWG-RDA-maDMP-schema.json).
 *
 * The form and the exporter both take their terms from here, so what a
 * researcher picks is already what the standard accepts.
 */

export const MADMP_SCHEMA_VERSION = "v3.0" as const;
export const MADMP_SCHEMA_NAME = "GCWG-RDA maDMP" as const;
export const MADMP_SCHEMA_URI =
  "https://github.com/FAIRERdata/maDMP-Standard/blob/Master/examples/JSON/PublishedSchemas/GCWG-RDA-maDMP-schema_v3.0.json";

/** As spelled in `general_info`. Distributions use lower-case "protected A". */
export const PROTECTION_LEVELS = [
  "unknown",
  "not protected",
  "Protected A",
  "Protected B",
  "Protected C",
  "other",
] as const;
export type ProtectionLevel = (typeof PROTECTION_LEVELS)[number];

export const PROTECTION_LEVEL_HINTS: Record<ProtectionLevel, string> = {
  unknown: "Not yet assessed.",
  "not protected": "Release would cause no injury.",
  "Protected A": "Release could cause injury to a person or organisation.",
  "Protected B": "Release could cause serious injury.",
  "Protected C": "Release could cause extremely grave injury.",
  other: "Your institution uses its own scheme. Name it and give the level.",
};

export const SECURITY_CLASSIFICATION_LEVELS = [
  "unclassified",
  "restricted",
  "confidential",
  "secret",
  "top secret",
  "other",
  "unknown",
] as const;
export type SecurityClassificationLevel =
  (typeof SECURITY_CLASSIFICATION_LEVELS)[number];

export const APPROVAL_STATUSES = [
  "approved",
  "rejected",
  "submitted",
  "not submitted",
  "not applicable",
  "unknown",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const CONTACT_ROLES = [
  "resourceProvider",
  "custodian",
  "owner",
  "user",
  "distributor",
  "originator",
  "pointOfContact",
  "principalInvestigator",
  "processor",
  "publisher",
  "author",
  "collaborator",
  "editor",
  "mediator",
  "rightsHolder",
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

/**
 * v3.0 expresses languages in ISO 639-3 and lists individual languages only —
 * no macrolanguage codes such as zho or ara — so each ISO 639-1 code the form
 * offers maps to its principal individual language (zh → cmn, ar → arb).
 * Constructed languages v3.0 omits (ia, ie, io, vo) map to `mis`, "uncoded".
 * Every value here is checked against the vendored schema in mapper.test.ts.
 */
export const ISO_639_1_TO_3: Record<string, string> = {
  aa: "aar",
  ab: "abk",
  ae: "ave",
  af: "afr",
  ak: "aka",
  am: "amh",
  an: "arg",
  ar: "arb",
  as: "asm",
  av: "ava",
  ay: "ayr",
  az: "azj",
  ba: "bak",
  be: "bel",
  bg: "bul",
  bh: "bho",
  bi: "bis",
  bm: "bam",
  bn: "ben",
  bo: "bod",
  br: "bre",
  bs: "bos",
  ca: "cat",
  ce: "che",
  ch: "cha",
  co: "cos",
  cr: "crk",
  cs: "ces",
  cu: "chu",
  cv: "chv",
  cy: "cym",
  da: "dan",
  de: "deu",
  dv: "div",
  dz: "dzo",
  ee: "ewe",
  el: "ell",
  en: "eng",
  eo: "epo",
  es: "spa",
  et: "ekk",
  eu: "eus",
  fa: "pes",
  ff: "fuv",
  fi: "fin",
  fj: "fij",
  fo: "fao",
  fr: "fra",
  fy: "fry",
  ga: "gle",
  gd: "gla",
  gl: "glg",
  gn: "gug",
  gu: "guj",
  gv: "glv",
  ha: "hau",
  he: "heb",
  hi: "hin",
  ho: "hmo",
  hr: "hrv",
  ht: "hat",
  hu: "hun",
  hy: "hye",
  hz: "her",
  ia: "mis",
  id: "ind",
  ie: "mis",
  ig: "ibo",
  ii: "iii",
  ik: "esi",
  io: "mis",
  is: "isl",
  it: "ita",
  iu: "ike",
  ja: "jpn",
  jv: "jav",
  ka: "kat",
  kg: "kng",
  ki: "kik",
  kj: "kua",
  kk: "kaz",
  kl: "kal",
  km: "khm",
  kn: "kan",
  ko: "kor",
  kr: "knc",
  ks: "kas",
  ku: "kmr",
  kv: "kpv",
  kw: "cor",
  ky: "kir",
  la: "lat",
  lb: "ltz",
  lg: "lug",
  li: "lim",
  ln: "lin",
  lo: "lao",
  lt: "lit",
  lu: "lub",
  lv: "lvs",
  mg: "plt",
  mh: "mah",
  mi: "mri",
  mk: "mkd",
  ml: "mal",
  mn: "khk",
  mr: "mar",
  ms: "zsm",
  mt: "mlt",
  my: "mya",
  na: "nau",
  nb: "nor",
  nd: "nde",
  ne: "npi",
  ng: "ndo",
  nl: "nld",
  nn: "nor",
  no: "nor",
  nr: "nbl",
  nv: "nav",
  ny: "nya",
  oc: "oci",
  oj: "ojg",
  om: "gaz",
  or: "ory",
  os: "oss",
  pa: "pan",
  pi: "pli",
  pl: "pol",
  ps: "pbu",
  pt: "por",
  qu: "quz",
  rm: "roh",
  rn: "run",
  ro: "ron",
  ru: "rus",
  rw: "kin",
  sa: "san",
  sc: "src",
  sd: "snd",
  se: "sme",
  sg: "sag",
  si: "sin",
  sk: "slk",
  sl: "slv",
  sm: "smo",
  sn: "sna",
  so: "som",
  sq: "als",
  sr: "srp",
  ss: "ssw",
  st: "sot",
  su: "sun",
  sv: "swe",
  sw: "swh",
  ta: "tam",
  te: "tel",
  tg: "tgk",
  th: "tha",
  ti: "tir",
  tk: "tuk",
  tl: "tgl",
  tn: "tsn",
  to: "ton",
  tr: "tur",
  ts: "tso",
  tt: "tat",
  tw: "aka",
  ty: "tah",
  ug: "uig",
  uk: "ukr",
  ur: "urd",
  uz: "uzn",
  ve: "ven",
  vi: "vie",
  vo: "mis",
  wa: "wln",
  wo: "wol",
  xh: "xho",
  yi: "ydd",
  yo: "yor",
  za: "zyb",
  zh: "cmn",
  zu: "zul",
};

/** Accepts either form the app stores; anything unrecognised is `und`. */
export const toIso6393 = (code?: string): string => {
  const value = code?.trim().toLowerCase();
  if (!value) return "und";
  if (value.length === 3) return value;
  return ISO_639_1_TO_3[value] ?? "und";
};

const match = <T extends string>(options: readonly T[], value: string) =>
  options.find((o) => o.toLowerCase() === value.trim().toLowerCase());

export interface ClassificationOut<T extends string> {
  level: T;
  /** Required by the standard whenever `level` is "other". */
  nomenclature?: string;
  otherLevel?: string;
}

/**
 * Plans written before v3.0 hold free-form values ("Standard", "Internal").
 * Rather than guess which v3.0 level they meant, they export as "other" with
 * the original text kept as the level — lossless, and visibly so.
 */
const LEGACY_SCHEME = "DMP-Researcher (pre-v3.0 value)";

export const toProtectionLevel = (
  value?: string,
  other?: { nomenclature?: string; level?: string },
): ClassificationOut<ProtectionLevel> | undefined => {
  if (!value?.trim()) return undefined;
  const known = match(PROTECTION_LEVELS, value);
  if (known && known !== "other") return { level: known };
  if (/^(none|public|public repository)$/i.test(value.trim()))
    return { level: "not protected" };
  return {
    level: "other",
    nomenclature: other?.nomenclature?.trim() || LEGACY_SCHEME,
    otherLevel: known ? other?.level?.trim() || "unspecified" : value.trim(),
  };
};

export const toSecurityClassificationLevel = (
  value?: string,
  other?: { nomenclature?: string; level?: string },
): ClassificationOut<SecurityClassificationLevel> | undefined => {
  if (!value?.trim()) return undefined;
  const known = match(SECURITY_CLASSIFICATION_LEVELS, value);
  if (known && known !== "other") return { level: known };
  if (/^public$/i.test(value.trim())) return { level: "unclassified" };
  return {
    level: "other",
    nomenclature: other?.nomenclature?.trim() || LEGACY_SCHEME,
    otherLevel: known ? other?.level?.trim() || "unspecified" : value.trim(),
  };
};

/** Most restrictive first, for rolling dataset levels up to the plan. */
export const PROTECTION_ORDER: ProtectionLevel[] = [
  "Protected C",
  "Protected B",
  "Protected A",
  "other",
  "not protected",
  "unknown",
];
export const SECURITY_ORDER: SecurityClassificationLevel[] = [
  "top secret",
  "secret",
  "confidential",
  "restricted",
  "other",
  "unclassified",
  "unknown",
];
