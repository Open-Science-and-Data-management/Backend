import { z } from "zod";
import type { FieldPermission } from "./field-policy.js";

/**
 * Research domains a dataset can belong to.
 *
 * This is a different axis from `type`: `type` says what the output *is*
 * (raw / software / publication), `domain` says what field it comes from. One
 * dataset carries both — raw data from the life sciences, say.
 */
export const DomainKeyEnum = z.enum([
  "generic",
  "life_sciences",
  "health_medical",
  "social_science",
  "humanities",
  "geospatial",
  "physical_sciences",
  "engineering_computing",
]);

export type DomainKey = z.infer<typeof DomainKeyEnum>;

export type DomainFieldType =
  "text" | "textarea" | "number" | "select" | "date" | "toggle";

export interface DomainField {
  key: string;
  label: string;
  type: DomainFieldType;
  required?: boolean;
  /** For `select`; the stored value must be one of these. */
  options?: string[];
  /** Shown under the input. */
  help?: string;
  /**
   * Defaults to AI-draftable. A profile marks its own policy-bearing fields
   * human-owned, so adding a domain never means editing field-policy too.
   */
  permission?: FieldPermission;
}

export interface DomainProfile {
  key: DomainKey;
  label: string;
  description: string;
  fields: DomainField[];
  /** Strict: a value from another domain's profile is a validation failure. */
  schema: z.ZodType<Record<string, unknown>>;
}

const fieldSchema = (field: DomainField): z.ZodTypeAny => {
  // A field left blank is reported by its own name, so the readiness list and
  // the input's own error say the same recognisable thing.
  const required_error = `${field.label} is required`;

  switch (field.type) {
    case "number":
      return z.coerce.number({ required_error });
    case "toggle":
      return z.boolean({ required_error });
    case "date":
      return z.coerce.date({ required_error });
    case "select":
      return field.options?.length
        ? z.enum(field.options as [string, ...string[]], { required_error })
        : z.string({ required_error });
    default:
      return field.required
        ? z.string({ required_error }).min(1, required_error)
        : z.string();
  }
};

/**
 * The profile's schema is derived from its own field list, so the two can
 * never drift: declare a field and it is both rendered and validated.
 */
const schemaFor = (fields: DomainField[]) =>
  z
    .object(
      Object.fromEntries(
        fields.map((field) => [
          field.key,
          field.required ? fieldSchema(field) : fieldSchema(field).optional(),
        ]),
      ),
    )
    .strict();

const profile = (
  key: DomainKey,
  label: string,
  description: string,
  fields: DomainField[],
): DomainProfile => ({
  key,
  label,
  description,
  fields,
  schema: schemaFor(fields) as z.ZodType<Record<string, unknown>>,
});

export const domainProfiles: Record<DomainKey, DomainProfile> = {
  generic: profile(
    "generic",
    "Generic",
    "Core fields only. Nothing domain-specific to record.",
    [],
  ),

  life_sciences: profile(
    "life_sciences",
    "Life sciences",
    "Organisms, samples and the instruments that read them.",
    [
      {
        key: "organism",
        label: "Organism",
        type: "text",
        required: true,
        help: "Species or cultivar the data describes, e.g. Oryza sativa IR64.",
      },
      {
        key: "sequencing_platform",
        label: "Sequencing platform",
        type: "select",
        options: ["Illumina", "Oxford Nanopore", "PacBio", "Sanger", "Other"],
      },
      {
        key: "assay_type",
        label: "Assay type",
        type: "select",
        options: ["WGS", "RNA-seq", "Amplicon / 16S", "Genotyping", "Other"],
      },
      { key: "sample_count", label: "Number of samples", type: "number" },
      {
        key: "collection_site",
        label: "Collection site",
        type: "text",
        help: "Where the material came from: a field, plot or facility.",
      },
      {
        key: "collection_date",
        label: "Collected on",
        type: "date",
        help: "When the samples were taken.",
      },
      {
        key: "protocol_notes",
        label: "Protocol notes",
        type: "textarea",
        help: "Extraction, library prep, anything a reuser would need.",
      },
      {
        key: "biosafety_reviewed",
        label: "Biosafety reviewed",
        type: "toggle",
        // A compliance claim: the researcher says this, never the model.
        permission: "human",
        help: "Tick only once the biosafety review has actually happened.",
      },
      {
        key: "material_transfer_terms",
        label: "Material transfer terms",
        type: "textarea",
        permission: "human",
        help: "Any MTA, ABS or permit that limits who may receive the material.",
      },
    ],
  ),

  health_medical: profile(
    "health_medical",
    "Health & medical",
    "Studies on people, where the paperwork is part of the data.",
    [
      {
        key: "study_type",
        label: "Study type",
        type: "select",
        required: true,
        options: [
          "Observational",
          "Interventional / clinical trial",
          "Registry",
          "Secondary analysis",
          "Case report",
          "Other",
        ],
      },
      { key: "condition_studied", label: "Condition studied", type: "text" },
      { key: "participant_count", label: "Participants", type: "number" },
      {
        key: "age_range",
        label: "Age range",
        type: "text",
        help: "e.g. 18–65, or “paediatric, under 12”.",
      },
      {
        key: "trial_registration",
        label: "Trial registration",
        type: "text",
        help: "Registry number if there is one, e.g. TCTR20250101000001.",
      },
      {
        key: "ethics_approval_ref",
        label: "Ethics approval reference",
        type: "text",
        permission: "human",
        help: "The IRB/EC number. Add it before submitting, since AI can't vouch for an approval.",
      },
      {
        key: "deidentification",
        label: "De-identification",
        type: "select",
        permission: "human",
        options: [
          "Fully anonymised",
          "Pseudonymised",
          "Identifiable",
          "Not applicable",
        ],
        help: "How re-identifiable the records are once shared.",
      },
      {
        key: "sharing_restrictions",
        label: "Sharing restrictions",
        type: "textarea",
        permission: "human",
        help: "What consent or regulation stops this being shared openly.",
      },
    ],
  ),

  social_science: profile(
    "social_science",
    "Social science",
    "Who the data is about and how it was gathered.",
    [
      {
        key: "population",
        label: "Population studied",
        type: "text",
        required: true,
        help: "Who the data describes, e.g. smallholder rice farmers in Nan.",
      },
      { key: "sample_size", label: "Sample size", type: "number" },
      {
        key: "collection_instrument",
        label: "Collection instrument",
        type: "select",
        options: [
          "Survey",
          "Interview",
          "Focus group",
          "Observation",
          "Administrative records",
          "Other",
        ],
      },
      {
        key: "sampling_method",
        label: "Sampling method",
        type: "select",
        options: [
          "Random",
          "Stratified",
          "Cluster",
          "Convenience",
          "Purposive",
          "Census",
          "Other",
        ],
      },
      {
        key: "geographic_coverage",
        label: "Geographic coverage",
        type: "text",
        help: "Where fieldwork happened, e.g. Nan province, Thailand.",
      },
      {
        key: "fieldwork_start",
        label: "Fieldwork started",
        type: "date",
      },
      {
        key: "instrument_language",
        label: "Language of instrument",
        type: "text",
        help: "What language participants answered in.",
      },
      {
        key: "anonymisation",
        label: "Anonymisation",
        type: "select",
        permission: "human",
        options: ["Fully anonymised", "Pseudonymised", "Identifiable"],
        help: "Disclosure risk is a judgement about your own data.",
      },
      {
        key: "consent_obtained",
        label: "Participant consent obtained",
        type: "toggle",
        permission: "human",
      },
      {
        key: "ethics_approval_ref",
        label: "Ethics approval reference",
        type: "text",
        permission: "human",
      },
    ],
  ),

  humanities: profile(
    "humanities",
    "Humanities",
    "Sources, where they came from, and who holds rights in them.",
    [
      {
        key: "source_type",
        label: "Source type",
        type: "select",
        required: true,
        options: [
          "Manuscript",
          "Printed text",
          "Photograph",
          "Audio recording",
          "Video",
          "Artefact",
          "Oral history",
          "Other",
        ],
      },
      {
        key: "period_covered",
        label: "Period covered",
        type: "text",
        help: "e.g. Ayutthaya period, 1351–1767.",
      },
      {
        key: "source_language",
        label: "Language of sources",
        type: "text",
      },
      {
        key: "archive_or_collection",
        label: "Archive or collection",
        type: "text",
        help: "Where the originals are held, and their reference if there is one.",
      },
      {
        key: "transcription_standard",
        label: "Transcription standard",
        type: "text",
        help: "e.g. TEI P5, or the romanisation scheme used.",
      },
      {
        key: "item_count",
        label: "Items digitised",
        type: "number",
      },
      {
        key: "rights_holder",
        label: "Rights holder",
        type: "text",
        permission: "human",
        help: "Who owns copyright in the originals. State it; don't infer it.",
      },
      {
        key: "cultural_sensitivity",
        label: "Cultural sensitivity",
        type: "textarea",
        permission: "human",
        help: "Community or Indigenous restrictions on access, display or reuse.",
      },
    ],
  ),

  geospatial: profile(
    "geospatial",
    "Geospatial",
    "Where the data sits on the ground, and how precisely.",
    [
      {
        key: "coordinate_system",
        label: "Coordinate system",
        type: "text",
        required: true,
        help: "EPSG code or CRS name, e.g. EPSG:4326.",
      },
      {
        key: "geometry_type",
        label: "Geometry type",
        type: "select",
        options: ["Point", "Line", "Polygon", "Raster", "Mixed"],
      },
      {
        key: "bounding_box",
        label: "Bounding box",
        type: "text",
        help: "minLon, minLat, maxLon, maxLat.",
      },
      {
        key: "spatial_resolution",
        label: "Spatial resolution",
        type: "text",
        help: "e.g. 10 m, or 1:50,000.",
      },
      {
        key: "positional_accuracy",
        label: "Positional accuracy",
        type: "text",
        help: "e.g. ±2 m horizontal.",
      },
      {
        key: "acquisition_source",
        label: "Acquisition source",
        type: "select",
        options: [
          "Field survey",
          "GNSS",
          "Satellite imagery",
          "Aerial / drone",
          "Digitised map",
          "Modelled",
          "Other",
        ],
      },
      { key: "survey_date", label: "Surveyed on", type: "date" },
      {
        key: "location_sensitive",
        label: "Locations are sensitive",
        type: "toggle",
        permission: "human",
        help: "Whether precise coordinates must be withheld, for example for nest sites, private land or protected places.",
      },
    ],
  ),

  physical_sciences: profile(
    "physical_sciences",
    "Physical sciences",
    "What measured it, and under what conditions.",
    [
      {
        key: "measurement_technique",
        label: "Measurement technique",
        type: "select",
        required: true,
        options: [
          "Spectroscopy",
          "Diffraction",
          "Microscopy",
          "Chromatography",
          "Simulation",
          "Other",
        ],
      },
      { key: "instrument", label: "Instrument", type: "text" },
      {
        key: "facility",
        label: "Facility or beamline",
        type: "text",
        help: "Where the measurement was taken, if it wasn't your own lab.",
      },
      { key: "sample_material", label: "Sample material", type: "text" },
      {
        key: "measurement_conditions",
        label: "Measurement conditions",
        type: "textarea",
        help: "Whatever the reading depends on, such as temperature, pressure or calibration.",
      },
      {
        key: "uncertainty",
        label: "Reported uncertainty",
        type: "text",
        help: "e.g. ±0.5 K, or the confidence interval used.",
      },
      {
        key: "calibration_reference",
        label: "Calibration reference",
        type: "text",
      },
      { key: "measurement_date", label: "Measured on", type: "date" },
    ],
  ),

  engineering_computing: profile(
    "engineering_computing",
    "Engineering & computing",
    "What it ran on, and what someone needs to run it again.",
    [
      {
        key: "computing_environment",
        label: "Computing environment",
        type: "text",
        required: true,
        help: "What it ran on: 4 × NVIDIA A100, a cloud instance or a standard laptop.",
      },
      {
        key: "model_or_algorithm",
        label: "Model or algorithm",
        type: "text",
      },
      {
        key: "training_data_source",
        label: "Training data source",
        type: "text",
        help: "Where the inputs came from, if this is a trained artefact.",
      },
      {
        key: "benchmark",
        label: "Benchmark used",
        type: "text",
      },
      { key: "compute_hours", label: "Compute hours", type: "number" },
      {
        key: "software_dependencies",
        label: "Software dependencies",
        type: "textarea",
        help: "Languages, frameworks and versions a reuser would have to match.",
      },
      {
        key: "reproducibility_notes",
        label: "Reproducibility notes",
        type: "textarea",
        help: "Seeds, configs, anything that makes a run repeatable.",
      },
      {
        key: "third_party_terms",
        label: "Third-party terms",
        type: "textarea",
        permission: "human",
        help: "Licences on models or data you reused that limit redistribution.",
      },
    ],
  ),
};

/** Always resolves: anything unrecognised is treated as generic. */
export const getDomainProfile = (domain?: string): DomainProfile =>
  (domainProfiles as Record<string, DomainProfile>)[domain ?? "generic"] ??
  domainProfiles.generic;

export const validateDomainMetadata = (
  domain: string | undefined,
  metadata: unknown,
) => getDomainProfile(domain).schema.safeParse(metadata ?? {});

/** Keys the given domain has no field for — what a domain switch must drop. */
export const foreignDomainKeys = (
  domain: string | undefined,
  metadata: Record<string, unknown> = {},
): string[] => {
  const known = new Set(getDomainProfile(domain).fields.map((f) => f.key));
  return Object.keys(metadata).filter((key) => !known.has(key));
};
