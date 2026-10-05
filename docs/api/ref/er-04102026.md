# Frontend data model ERD

This diagram reflects the current Zod schemas and client-side stores. It is a
logical view of the frontend model, not a claim that these are database tables
or that the indicated references are enforced by a database.

```mermaid
erDiagram
    USER ||--o{ PROJECT_MEMBER : participates_in
    PROJECT ||--o{ PROJECT_MEMBER : has_members
    PROJECT o|--o{ DMP : groups
    PROJECT ||--o{ FILE_RECORD : stores
    USER ||--o{ FILE_RECORD : uploads
    PROJECT o|--o| FILE_RECORD : selects_active_proposal
    DMP ||--o{ DMP_VERSION : has_revisions
    DMP ||--o{ TASK : produces
    DMP o|--o{ NOTIFICATION : may_reference
    PROJECT o|--o{ NOTIFICATION : may_reference
    USER ||--o{ NOTIFICATION : receives
    DMP ||--o{ DATASET : contains_in_draft
    DATASET ||--o{ DISTRIBUTION : describes
    DATASET o|--o{ TASK : may_scope
    FILE_RECORD o|--o{ TASK : may_be_attached_to
    FILE_RECORD o|--o{ DISTRIBUTION : may_back

    USER {
        string user_id PK "optional in schema"
        string title
        string name
        string surname
        string email
        UserRole role "admin | chief | committee | researcher"
        int ai_token_limit
        int ai_token_used
    }

    PROJECT {
        string project_id PK "optional in schema"
        string project_name
        string description
        string proposal_file_id FK "optional"
        ProjectStatus status "draft | active | done"
        PlanMode plan_mode "institutional | independent"
        date created_at
        date updated_at
    }

    PROJECT_MEMBER {
        string project_id PK, FK
        string user_id PK, FK
        ProjectRole project_role "researcher | committee | chief"
    }

    DMP {
        string dmp_id PK
        string project_id FK "optional"
        string title
        string description
        string language
        DmpStatus status "draft | pending | approved"
        int active_version "optional"
        date created_at
        date updated_at
        json draft "includes dataset, contributor, cost arrays"
    }

    DMP_VERSION {
        int number "per-DMP revision number"
        VersionStatus status "draft | pending | approved | rejected"
        EditType edit_type "minor | major"
        json changes
        json snapshot
        date created_at
        date decided_at
        string decided_by "optional; no FK validation"
        string note
    }

    DATASET {
        string dataset_id "optional in schema"
        string type "raw | software | publication | other"
        string title
        DatasetStatus status
        DataAccess access
        json preservation
        json domain_metadata
    }

    DISTRIBUTION {
        string distribution_id "optional in schema"
        string file_id FK "optional"
        string title
        string access_url
        string download_url
        DataAccess data_access
        string license
    }

    TASK {
        string task_id PK "optional in schema"
        string dmp_id FK
        string dataset_id FK "optional"
        string source_version_id "optional; version key is number"
        string file_id FK "optional"
        string title
        string details
        date start_date
        date end_date
        int progress_percent
        TaskStatus status "todo | in_progress | done | cancelled"
        Priority priority "low | medium | high"
        LifecycleStage lifecycle_stage
        GeneratedBy generated_by "ai | user"
        json checklist
        json evidence
        date completed_at
        string completed_by
    }

    FILE_RECORD {
        string file_id PK "optional in schema"
        string project_id FK
        string uploaded_by FK
        string filename
        FileType file_type "docx | pdf | other"
        FilePurpose purpose "proposal | task_deliverable | evidence"
        json metadata
        date uploaded_at
        date superseded_at
    }

    NOTIFICATION {
        string notification_id PK "optional in schema"
        string user_id FK
        string dmp_id FK "optional"
        string project_id FK "optional"
        NotificationType type
        string title
        string message
        string link
        date read_at
        date created_at
    }
```

`DATASET`, its `DISTRIBUTION`s, contributors, and costs are nested values in
the DMP draft, not independent records in the current client model. Likewise,
`DMP_VERSION` describes entries in `DmpRecord.versions`, embedded in each DMP
record. The ERD draws these nested structures separately to make their
relationships legible.

## Review of the proposed ERD

- **DMP cardinality:** the code allows a DMP to have no `project_id`, and one
  project can have multiple DMPs. The proposed mandatory one-to-one relationship
  does not match the schemas or seeded data.
- **Project fields:** the current schema includes `plan_mode`; the proposed
  diagram omitted it. `ProjectStatus` is `draft | active | done`.
- **DMP fields:** `DmpForm` carries `alternate_identifier`, begin/end dates,
  ethical and indigenous information, contributor/cost/dataset arrays, and
  `schema_version`. Several proposed fields are not in the schema (for example
  `current_version`, `generated_by`, `contact`, DMP-level `access` and
  protection-classification fields). In the saved client record, the active
  revision is `active_version`, and status/timestamps plus summary fields are
  held by `DmpRecord`.
- **Versions and approvals:** versions exist as nested `PlanVersion` values;
  there is no separate `version_id`, `APPROVAL` entity, reviewer ID, or approval
  comment. Review outcome is recorded on the version with `status`, optional
  `decided_at`, `decided_by`, and `note`. The `decided_by` string is not
  schema-validated as a user reference.
- **Tasks and files:** tasks include cancelled status, priority, lifecycle
  stage, checklist, evidence, completion fields, and optional dataset/file
  references. File purpose includes `task_deliverable` and `evidence`. An
  optional task `file_id` may point to a file, but evidence references are
  polymorphic strings (file, URL, or DOI) rather than guaranteed file FKs.
- **Notifications:** the actual type values are `dmp_submitted`,
  `dmp_approved`, `dmp_finalized`, `tasks_generated`, and
  `proposal_superseded`. A notification has title/message/link, optional DMP
  and project IDs, and optional `read_at`; it does not have the proposed
  generic `related_entity` or `is_read` fields.
- **AI generation:** there is no `AI_GENERATION` record with inputs, outputs,
  or token totals. AI activity is represented in a separate persisted thread
  store as user/assistant turns and lightweight events, scoped by DMP ID when
  available (or stored as unscoped activity). Its actions are
  `analyze_proposal`, `regenerate_field`, `batch_regenerate`, `generate_tasks`,
  and `redraft_steps`.
- **IDs and constraints:** many input-schema IDs are optional, and references
  are plain strings rather than validated foreign keys. `PROJECT_MEMBER` has no
  schema-level uniqueness check for `(project_id, user_id)`. Treat the PK/FK
  labels here as logical relational recommendations, not enforced constraints.
