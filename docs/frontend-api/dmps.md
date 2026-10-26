# Plans (DMPs)

A **Plan** is a Data Management Plan with its full version history. It has one
author, its researcher, who writes it; the committee reads it and decides on
its versions, and never edits its content.

A decision moves a pending version to `approved` or `rejected`. It's recorded
on the version with the deciding member as its **approver**: name and email
from the session, and the position they typed. The maDMP export names that
approver.

## Endpoints

| | |
| --- | --- |
| [Retrieve a plan](#retrieve-a-plan) | `GET /v1/dmps/:dmp_id` |
| [List plans](#list-plans) | `GET /v1/dmps` |
| [Approve a version](#approve-a-version) | `POST /v1/dmps/:dmp_id/versions/:number/approve` |
| [Reject a version](#reject-a-version) | `POST /v1/dmps/:dmp_id/versions/:number/reject` |
| [Create a plan](#create-a-plan) | `POST /v1/dmps` |
| [Update a draft](#update-a-draft) | `PATCH /v1/dmps/:dmp_id/draft` |
| [Discard draft edits](#discard-draft-edits) | `POST /v1/dmps/:dmp_id/draft/discard` |
| [Restore a version](#restore-a-version) | `POST /v1/dmps/:dmp_id/draft/restore` |
| [Submit for approval](#submit-for-approval) | `POST /v1/dmps/:dmp_id/submit` |
| [Finalize a plan](#finalize-a-plan) | `POST /v1/dmps/:dmp_id/finalize` |
| [Save minor edits](#save-minor-edits) | `POST /v1/dmps/:dmp_id/minor-edits` |
| [Submit a revision](#submit-a-revision) | `POST /v1/dmps/:dmp_id/revisions` |
| [Archive a plan](#archive-a-plan) | `POST /v1/dmps/:dmp_id/archive` |
| [Unarchive a plan](#unarchive-a-plan) | `POST /v1/dmps/:dmp_id/unarchive` |

## Who works on a plan

- **One author.** A plan is written by one researcher: the one who created
  it (`researcher`). Being a member of the plan's project lets someone follow
  it, not edit it, which keeps autosave single-user (see
  [Update a draft](#update-a-draft)). Co-editing would need a deliberate
  change to both this rule and concurrency.
- The author reads and writes their plan. Another researcher gets
  `404 resource_missing`, so the plan's existence isn't confirmed.
- `committee` and `chief` read every institutional plan and decide on its
  versions ([Approve](#approve-a-version), [Reject](#reject-a-version)).
- `admin` gets `403` on every plan endpoint, reading included.

## Editing a plan in force

Once a version is in force, every edit is either **minor** (applied in place,
logged, nothing reviewed) or **major** (a new pending version that has to be
approved again). The rule is a governance decision kept in one place,
`isMajorTrigger` in [`field-policy.ts`](../../src/config/field-policy.ts), and
the server applies the same rule. A change is **major** when it alters a
data-management commitment:

- the plan's begin or end date, whether ethical issues exist, Indigenous
  considerations;
- a research output's access, personal data, personal data plan, protection
  level, security classification, **repository**, **retention period**, or a
  distribution's **licence**;
- adding or removing a research output;
- **any change to contributors**, the contact included.

Everything else is minor: wording and typo fixes, including the title,
description, the preservation statement and a distribution's title. One major
change makes the whole batch major. The full rules are the ERD's
[Versions and edit classification](../project-erd.md#versions-and-edit-classification).

## The Plan object

```json
{
  "object": "dmp",
  "dmp_id": "dmp-soil",
  "project_id": "proj-3",
  "title": "Soil Microbiome Survey DMP",
  "description": "16S amplicon reads and soil chemistry from 40 paddy plots…",
  "language": "eng",
  "status": "pending",
  "plan_mode": "institutional",
  "active_version": null,
  "created_at": "2026-10-16T03:00:00Z",
  "updated_at": "2026-10-20T03:12:00Z",
  "researcher": { "user_id": "user-1", "name": "Dr. Aran Suwannachot" },
  "review_snapshot": {
    "title": "Soil Microbiome Survey DMP",
    "begin_date": "2026-11-01",
    "end_date": "2028-10-31",
    "ethical_issues_exist": false,
    "contributor": [ { "name": "Aran", "surname": "Suwannachot", "role": "Principal investigator", "is_contact": true } ],
    "dataset": [ { "dataset_id": "ds-soil-reads", "title": "16S amplicon sequence reads", "access": "open" } ]
  },
  "versions": [
    {
      "object": "dmp_version",
      "number": 1,
      "status": "pending",
      "edit_type": "major",
      "changes": [],
      "created_at": "2026-10-20T03:12:00Z",
      "decided_at": null,
      "decided_by": null,
      "approver": null,
      "note": null,
      "minor_edits": []
    }
  ],
  "readiness": {
    "complete": true,
    "unmet_items": []
  }
}
```

### Attributes

- `object` (string, value is `"dmp"`)
  The object's type.
- `dmp_id` (string, required)
  Unique id.
- `project_id` (string, nullable)
  The project the plan belongs to.
- `title` (string, required)
  The plan's title.
- `description` (string, required)
  What the plan covers.
- `language` (string, required)
  The plan's language code, e.g. `eng`.
- `status` (enum, required)
  Possible enum values:
  - `draft`
  - `pending`
  - `approved`
- `plan_mode` (enum, nullable)
  Frozen at first submission. `null` for a plan that has never been
  submitted; it follows its project until then.
  Possible enum values:
  - `institutional`
  - `independent`
- `active_version` (integer, nullable)
  The version in force.
- `created_at` (date-time, required)
  When the plan was created.
- `updated_at` (date-time, required)
  When the plan last changed.
- `researcher` (object, required)
  The plan's author: the researcher who created it. Set once and never
  changed (see [Who works on a plan](#who-works-on-a-plan)).
  - `user_id` (string, required)
    The researcher's user id.
  - `name` (string, required)
    Display name.
- `review_snapshot` (object, required)
  The plan content under review. Same shape as the DMP form: dates, ethics,
  contributors, costs, research outputs.
  `required` below holds once a version has been submitted. A plan that has
  never been submitted shows its draft, which may be missing any attribute.
  - `dmp_id` (string, nullable)
    The plan's id.
  - `project_id` (string, nullable)
    The project's id.
  - `title` (string, required)
    The plan's title.
  - `description` (string, required)
    What the plan covers.
  - `language` (string, required)
    Language code, at least 2 characters.
  - `alternate_identifier` (object, nullable)
    Another identifier for the plan.
    - `identifier` (string, required)
      The identifier itself.
    - `type` (enum, required)
      Possible enum values:
      - `doi`
      - `handle`
      - `url`
      - `orcid`
      - `ror`
      - `other`
  - `begin_date` (date, required)
    When the plan's work starts.
  - `end_date` (date, required)
    When it ends. Can't be before `begin_date`.
  - `ethical_issues_exist` (boolean, required)
    Whether the plan has ethical issues.
  - `ethical_issues_description` (string, nullable)
    Required when `ethical_issues_exist` is `true`.
  - `ethical_issues_report` (string, nullable)
    A URL to the ethics report.
  - `indigenous_considerations` (string, nullable)
    Indigenous considerations, if any.
  - `contributor` (array of objects, required)
    The people named in the plan. At least one; exactly one is the contact,
    and no two are linked to the same account.
    - `contributor_id` (string, nullable)
      Unique within the plan.
    - `title` (string, nullable)
      Honorific.
    - `name` (string, required)
      First name.
    - `surname` (string, nullable)
      Last name.
    - `role` (string, required)
      Their role in the work, e.g. "Principal investigator".
    - `email` (string, nullable)
      Required for the contact.
    - `orcid` (string, nullable)
      ORCID iD, four groups of four digits; the last may end in `X`.
    - `is_contact` (boolean, required)
      Whether this person is the plan's contact.
    - `user_id` (string, nullable)
      The person's account, when they have one.
  - `cost` (array of objects, required)
    The plan's budget lines. May be empty.
    - `cost_id` (string, nullable)
      Unique within the plan.
    - `title` (string, required)
      What the cost is for.
    - `description` (string, nullable)
      More detail.
    - `value` (number, required)
      The amount. Not negative.
    - `currency_code` (string, required)
      ISO 4217 code. Defaults to `THB`.
  - `dataset` (array of objects, required)
    The research outputs. At least one.
    - `dataset_id` (string, nullable)
      Unique within the plan.
    - `type` (enum, required)
      Possible enum values:
      - `raw`
      - `software`
      - `publication`
      - `other`
    - `title` (string, required)
      The output's title.
    - `description` (string, nullable)
      What it contains.
    - `status` (enum, required)
      Defaults to `planned`.
      Possible enum values:
      - `planned`
      - `collected`
      - `processed`
      - `preserved`
      - `shared`
    - `located_at` (string, nullable)
      Where the output is held.
    - `access` (enum, required)
      Possible enum values:
      - `open`
      - `shared`
      - `closed`
    - `personal_data` (enum, required)
      Possible enum values:
      - `yes`
      - `no`
      - `unknown`
    - `sensitive_data` (enum, required)
      Possible enum values:
      - `yes`
      - `no`
      - `unknown`
    - `personal_data_plan` (string, nullable)
      How personal data is handled.
    - `protection_level` (string, required)
      A maDMP v3.0 protection level, or `other`.
    - `protection_level_other_nomenclature` (string, nullable)
      When `other`: the scheme's name.
    - `protection_level_other` (string, nullable)
      When `other`: the level within that scheme.
    - `security_classification_level` (string, required)
      A maDMP v3.0 security classification, or `other`.
    - `security_classification_level_other_nomenclature` (string, nullable)
      When `other`: the scheme's name.
    - `security_classification_level_other` (string, nullable)
      When `other`: the level within that scheme.
    - `data_quality_assurance` (string, nullable)
      How data quality is assured.
    - `keyword` (array of strings, required)
      Keywords. May be empty.
    - `domain` (enum, required)
      The research domain; it selects the profile that validates
      `domain_metadata`. Defaults to `generic`.
      Possible enum values:
      - `generic`
      - `life_sciences`
      - `health_medical`
      - `social_science`
      - `humanities`
      - `geospatial`
      - `physical_sciences`
      - `engineering_computing`
    - `domain_metadata` (object, required)
      Domain-specific fields, validated by the domain's profile
      (`src/schemas/dataset/domain-profiles.ts`). May be empty.
    - `language` (string, nullable)
      The output's language.
    - `preservation` (object, required)
      How the output is kept.
      - `repository` (string, nullable)
        Where it is deposited.
      - `duration` (string, nullable)
        How long it is kept.
      - `format` (string, nullable)
        The preservation format.
      - `doi_requested` (boolean, required)
        Whether a DOI is requested. Defaults to `false`.
      - `statement` (string, nullable)
        A preservation statement.
    - `distribution` (array of objects, required)
      How the output is made available. May be empty.
      - `distribution_id` (string, nullable)
        Unique within the output.
      - `file_id` (string, nullable)
        An uploaded [File](./files.md#the-file-object) backing it.
      - `title` (string, required)
        The distribution's title.
      - `access_url` (string, nullable)
        A URL to access it.
      - `download_url` (string, nullable)
        A URL to download it.
      - `format` (string, nullable)
        Its format.
      - `byte_size` (integer, nullable)
        Its size in bytes.
      - `data_access` (enum, required)
        Possible enum values:
        - `open`
        - `shared`
        - `closed`
      - `license` (string, nullable)
        Required when `data_access` is `open`.
    - `schema_fields` (array of objects, nullable)
      Only when `type` is `raw`: the data's fields.
      - `name` (string, required)
        Field name.
      - `type` (string, required)
        Field type.
      - `description` (string, nullable)
        What the field holds.
    - `repository_url` (string, nullable)
      Only when `type` is `software`: the code repository URL.
    - `software_version` (string, nullable)
      Only when `type` is `software`: the version.
  - `schema_version` (string, required)
    The maDMP schema version. Defaults to `v3.0`.
- `versions` (array of objects, includable)
  Every [Version](#the-version-object), newest first. Returned only with
  `include=versions`.
- `draft` (object, includable)
  The author's working draft, unsaved and unsubmitted edits included.
  Returned only to the author, only with `include=draft`. Same shape as
  [`dmpDraftSchema`](../../src/schemas/dmp/dmp.schema.ts).
- `draft_revision` (integer, required)
  Increases with every saved change to the draft. Sent back with
  [Update a draft](#update-a-draft) so two saves can't overwrite each other.
- `archived_at` (date-time, nullable)
  When the plan was [archived](#archive-a-plan), or `null`.
- `readiness` (object, includable)
  Whether the reviewed content passes the plan rules. Returned only with
  `include=readiness`.
  - `complete` (boolean, required)
    `true` when every rule passes.
  - `unmet_items` (array of objects, required)
    The items that don't pass.
    - `label` (string, required)
      What to fix, as the editor words it, e.g. "Add a title".
    - `section` (enum, required)
      The editor section that holds the field.
      Possible enum values:
      - `general`
      - `dataset`
      - `ethical`
      - `people`
      - `system`

## The Version object

A numbered revision of a plan (`DMP_VERSION` in the ERD).

```json
{
  "object": "dmp_version",
  "dmp_id": "dmp-soil",
  "number": 1,
  "status": "approved",
  "edit_type": "major",
  "changes": [],
  "created_at": "2026-10-20T03:12:00Z",
  "decided_at": "2026-10-22T08:41:00Z",
  "decided_by": "user-2",
  "approver": {
    "user_id": "user-2",
    "name": "Prof. Mali Chaiyasit",
    "position": "Committee chair",
    "mbox": "mali@example.edu"
  },
  "note": "Clear plan. Please confirm the repository before data collection starts.",
  "minor_edits": [],
  "carried_minor_edits": null,
  "dropped_minor_edits": null
}
```

### Attributes

- `object` (string, value is `"dmp_version"`)
  The object's type.
- `dmp_id` (string, required)
  The plan this version belongs to.
- `number` (integer, required)
  Per plan; a rejected number is never reused.
- `status` (enum, required)
  Possible enum values:
  - `pending`
  - `approved`
  - `rejected`
- `edit_type` (enum, required)
  Possible enum values:
  - `minor`
  - `major`
- `changes` (array of objects, required)
  What the revision changes against the version in force. A first submission
  has none.
  - `path` (string, required)
    Where the value lives, e.g. `dataset[0].access`.
  - `label` (string, required)
    The same thing in words.
  - `from` (string, required)
    The value before.
  - `to` (string, required)
    The value after.
  - `edit_type` (enum, required)
    `minor` or `major`.
- `created_at` (date-time, required)
  Submitted.
- `decided_at` (date-time, nullable)
  When the version was decided.
- `decided_by` (string, nullable)
  The deciding reviewer's `user_id`. Older records may hold the bare value
  `committee` instead of an id.
- `approver` (object, nullable)
  The deciding member as they were at decision time. A later change of
  committee doesn't rewrite it.
  - `user_id` (string, nullable)
    The member's user id, when the approver is a project committee member.
  - `name` (string, required)
    Display name, from the session.
  - `position` (string, required)
    The position they typed.
  - `mbox` (string, nullable)
    Email, from the session.
- `note` (string, nullable)
  The reviewer's comment.
- `minor_edits` (array of objects, required)
  Minor edits folded into this version without review. May be empty.
  - `at` (date-time, required)
    When the edit was saved.
  - `by` (string, required)
    The `user_id` of who saved it.
  - `changes` (array of objects, required)
    Same attributes as an item in `changes`.
  - `restored_from` (integer, nullable)
    Set when the edit brought back an earlier version's content.
- `carried_minor_edits` (array of objects, nullable)
  Fixes merged into an approved revision. Each has the same attributes as an
  item in `changes`.
- `dropped_minor_edits` (array of objects, nullable)
  Fixes that couldn't be merged. Each has the same attributes as an item in
  `changes`.
- `plan_status` (enum, nullable)
  Response-only: returned by [Reject a version](#reject-a-version) only. The
  plan's status afterwards.
  Possible enum values:
  - `draft`: a returned first submission.
  - `approved`: a version stays in force.

### Retrieve a plan

`GET /v1/dmps/:dmp_id`

Returns a plan as a reviewer sees it on the **Review** page. `review_snapshot`
is the content under review: the pending version as submitted (never the
researcher's later, unsubmitted edits), else the version in force, else the
draft.

**Who can call:** `committee`, `chief`; `researcher` for plans they wrote

**Frontend today:** `useDmpLibrary().find(...)` with `reviewedSnapshot(record)`
and `computeReadiness(snapshot)`.

**Request**

```bash
curl "https://api.example.ac.th/v1/dmps/dmp-soil?include=versions,readiness" \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{
  "object": "dmp",
  "dmp_id": "dmp-soil",
  "project_id": "proj-3",
  "title": "Soil Microbiome Survey DMP",
  "description": "16S amplicon reads and soil chemistry from 40 paddy plots…",
  "language": "eng",
  "status": "pending",
  "plan_mode": "institutional",
  "active_version": null,
  "created_at": "2026-10-16T03:00:00Z",
  "updated_at": "2026-10-20T03:12:00Z",
  "researcher": { "user_id": "user-1", "name": "Dr. Aran Suwannachot" },
  "review_snapshot": {
    "title": "Soil Microbiome Survey DMP",
    "begin_date": "2026-11-01",
    "end_date": "2028-10-31",
    "ethical_issues_exist": false,
    "contributor": [ { "name": "Aran", "surname": "Suwannachot", "role": "Principal investigator", "is_contact": true } ],
    "dataset": [ { "dataset_id": "ds-soil-reads", "title": "16S amplicon sequence reads", "access": "open" } ]
  },
  "versions": [
    {
      "object": "dmp_version",
      "number": 1,
      "status": "pending",
      "edit_type": "major",
      "changes": [],
      "created_at": "2026-10-20T03:12:00Z",
      "decided_at": null,
      "decided_by": null,
      "approver": null,
      "note": null,
      "minor_edits": []
    }
  ],
  "readiness": {
    "complete": true,
    "unmet_items": []
  }
}
```

**Parameters**

- `include` (array of enums, optional)
  Extra fields to return. Possible enum values:
  - `versions`: every [Version](#the-version-object), newest first.
  - `readiness`: whether the reviewed content passes the plan rules, and
    which items don't (`unmet_items`, each with `label` and `section`).
  - `draft`: the working draft, for the plan's author only.

**Returns** a [Plan](#the-plan-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 403 | `plan_not_reviewable` | The plan is independent; the committee has no part in it. |
| 404 | `dmp_not_found` | No plan with that id. |

### List plans

`GET /v1/dmps`

Lists a project's plans for the **Project** page, newest activity first.
Archived plans are left out.

**Who can call:** `committee`, `chief`; `researcher` for plans they wrote

**Frontend today:** `useDmpLibrary().filter((d) => d.project_id === id)`

**Request**

```bash
curl "https://api.example.ac.th/v1/dmps?project_id=proj-1&include=versions" \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{
  "object": "list",
  "data": [
    {
      "object": "dmp",
      "dmp_id": "dmp-pollinator",
      "project_id": "proj-1",
      "title": "Urban Pollinator Genomics Data Management Plan",
      "description": "Sequencing and trait data for bee populations across three city districts, shared under CC-BY once the embargo lifts.",
      "language": "eng",
      "status": "approved",
      "plan_mode": "institutional",
      "active_version": 1,
      "created_at": "2026-07-18T03:00:00Z",
      "updated_at": "2026-10-10T03:00:00Z",
      "researcher": { "user_id": "user-1", "name": "Dr. Aran Suwannachot" },
      "versions": [
        {
          "object": "dmp_version",
          "number": 1,
          "status": "approved",
          "edit_type": "major",
          "changes": [],
          "created_at": "2026-07-18T03:00:00Z",
          "decided_at": "2026-10-10T03:00:00Z",
          "decided_by": null,
          "approver": null,
          "note": null,
          "minor_edits": []
        }
      ]
    }
  ],
  "has_more": false,
  "total_count": 1
}
```

Each plan is returned without `review_snapshot`, and without `versions` or
`readiness` unless asked for with `include`. Drafts are included: the page lists every plan that isn't
archived.

**Parameters**

- `project_id` (string, **required** for committee members)
  The project whose plans to list. Optional for a researcher: without it,
  every plan they wrote is listed (**My DMPs**).
- `archived` (boolean, optional, researcher only)
  `true` lists archived plans instead (My DMPs' *Archived* filter). Archived
  plans are left out otherwise.
- `status` (array of enums, optional)
  Only plans in these statuses.
- `q` (string, optional)
  Matches the title and description.
- `sort` (enum, optional)
  `updated` (default, newest first), `title`, or `status`.
- `include` (array of enums, optional)
  As in [Retrieve a plan](#retrieve-a-plan).

**Returns** a list of [Plans](#the-plan-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `project_id_required` | `project_id` wasn't sent. |

### Approve a version

`POST /v1/dmps/:dmp_id/versions/:number/approve`

Approves the pending version. It comes into force (`active_version` becomes
`number`), and the researcher is notified (`dmp_approved`). For a revision:

- minor fixes the researcher made to the version in force while it waited are
  merged into it (`carried_minor_edits`); fixes to an output the revision
  removed are kept in `dropped_minor_edits`;
- tasks of any research output the new version removes are cancelled, and the
  researcher is notified (`tasks_cancelled`).

**Who can call:** `committee`, `chief`

**Frontend today:** `useDmpStore.approveDmp(dmp_id, approver, note)`, which runs
the same path as `approve(approver)` (`activate` in `dmpStore.ts`).

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-soil/versions/1/approve \
  -H "Authorization: Bearer <access_token>" \
  --json '{
    "position": "Committee chair",
    "note": "Clear plan. Please confirm the repository before data collection starts."
  }'
```

**Response**

```json
{
  "object": "dmp_version",
  "dmp_id": "dmp-soil",
  "number": 1,
  "status": "approved",
  "edit_type": "major",
  "created_at": "2026-10-20T03:12:00Z",
  "decided_at": "2026-10-22T08:41:00Z",
  "decided_by": "user-2",
  "approver": {
    "user_id": "user-2",
    "name": "Prof. Mali Chaiyasit",
    "position": "Committee chair",
    "mbox": "mali@example.edu"
  },
  "note": "Clear plan. Please confirm the repository before data collection starts.",
  "minor_edits": [],
  "carried_minor_edits": null,
  "dropped_minor_edits": null
}
```

**Parameters**

- `position` (string, **required**)
  The deciding member's role, e.g. "Committee member" or "Committee chair".
  The page pre-fills "Committee member".
- `note` (string, optional)
  A comment for the researcher, trimmed. Stored on the version when it isn't
  blank. The approval notification doesn't include it.

**Returns** the decided [Version](#the-version-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `position_required` | `position` is missing or blank. |
| 404 | `version_not_found` | The plan has no version with that number. |
| 409 | `version_not_pending` | That version was already decided, so there is nothing to approve. |

### Reject a version

`POST /v1/dmps/:dmp_id/versions/:number/reject`

Sends the pending version back to the researcher with a reason, and notifies
them (`dmp_returned`). What happens to the plan depends on the version:

- **A first submission** (nothing in force): the plan goes back to `draft` for
  the researcher to revise. Their next submission is numbered after this one.
- **A revision**: the version in force keeps running, with its tasks. Minor
  fixes made to it while the revision waited stay on it.

The page calls this **Send back**; the stored status is `rejected`.

**Who can call:** `committee`, `chief`

**Frontend today:** `useDmpStore.returnDmp(dmp_id, approver, note)`, which runs
`rejectRevision(note, approver)`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-soil/versions/1/reject \
  -H "Authorization: Bearer <access_token>" \
  --json '{
    "position": "Committee member",
    "note": "Add a preservation statement for the sequence reads."
  }'
```

**Response**

```json
{
  "object": "dmp_version",
  "dmp_id": "dmp-soil",
  "number": 1,
  "status": "rejected",
  "edit_type": "major",
  "created_at": "2026-10-20T03:12:00Z",
  "decided_at": "2026-10-22T08:45:00Z",
  "decided_by": "user-2",
  "approver": {
    "user_id": "user-2",
    "name": "Prof. Mali Chaiyasit",
    "position": "Committee member",
    "mbox": "mali@example.edu"
  },
  "note": "Add a preservation statement for the sequence reads.",
  "minor_edits": [],
  "plan_status": "draft"
}
```

**Parameters**

- `position` (string, **required**)
  As in [Approve a version](#approve-a-version).
- `note` (string, **required**)
  What needs to change. The researcher sees it on their Status page and in
  the editor.

**Returns** the decided [Version](#the-version-object), plus `plan_status`:
the plan's status afterwards (`draft` for a returned first submission,
`approved` when a version stays in force).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `position_required` | `position` is missing or blank. |
| 400 | `note_required` | `note` is missing or blank. A version can't be sent back without a reason. |
| 404 | `version_not_found` | The plan has no version with that number. |
| 409 | `version_not_pending` | That version was already decided. |

### Create a plan

`POST /v1/dmps`

Starts an empty plan, for a researcher who isn't drafting from a proposal.
Drafting from one is [Analyze a proposal](./ai.md#analyze-a-proposal), which
creates the plan itself.

- The caller becomes the plan's author.
- An optional `project_id` must be a project they're a member of. Without one
  the plan is unfiled until it gets one.
- The plan starts as a `draft` with no versions and `draft_revision: 0`. Its
  plan mode follows its project until it's first submitted, then it's frozen
  on the plan.

**Who can call:** `researcher`

**Frontend today:** `useDmpStore.startManual(projectId)`. The browser keeps a
blank plan out of My DMPs until it has content; the server can do the same
by listing only plans with content.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "project_id": "proj-1" }'
```

**Response**

A [Plan](#the-plan-object) with `include=draft` applied: status `draft`, an
empty draft, `draft_revision: 0`.

**Parameters**

- `project_id` (string, optional)
  One of the caller's projects.

**Returns** the new [Plan](#the-plan-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 404 | `project_not_found` | No project of yours with that id. |

### Update a draft

`PATCH /v1/dmps/:dmp_id/draft`

Saves changes to the working draft. The editor autosaves field by field, so
this is the endpoint the app calls most.

- **Partial update.** The body is a JSON merge patch
  ([RFC 7396](https://www.rfc-editor.org/rfc/rfc7396)) over the draft. Lists
  (`dataset`, `contributor`, `cost`) are sent whole, each entry with its id,
  so adding, editing, reordering and removing an output, contributor or cost
  item all go through this one endpoint.
- **Optimistic concurrency.** The request carries `draft_revision`, the
  revision the client last saw. If the draft has moved on since (another tab,
  another device, an accepted AI proposal), the server answers
  `409 draft_conflict` with **the current server draft and its revision**;
  the client rebases its own change onto that draft and sends it again. This
  is what stops field-by-field autosaves from overwriting each other.
- **No completeness check here.** A draft may be incomplete; values are only
  checked for type and format. Completeness is checked when the plan is
  [submitted](#submit-for-approval).
- **Field policy is enforced by the server**
  ([`field-policy.ts`](../../src/config/field-policy.ts)): a `locked` field
  (e.g. `schema_version`) is refused; begin and end dates can be changed until
  the plan is approved.
- **Editing a plan in force changes nothing in force.** The edits stay in the
  draft until they're [saved as minor](#save-minor-edits) or
  [submitted as a revision](#submit-a-revision). Removing a research output is
  therefore only proposed: its tasks keep running.
- Editing a field retires its AI provenance. Switching an output's domain
  drops the `domain_metadata` keys the new profile has no place for.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `setField`, `addContributor`, `updateContributor`,
`removeContributor`, `setPrimaryContact`, `addCost`, `updateCost`,
`removeCost`, `addDataset`, `updateDataset`, `removeDataset`,
`changeDatasetType` and `changeDatasetDomain` on `useDmpStore`. The client
doesn't track a draft revision yet; it will need to keep the last
`draft_revision` it received.

**Request**

```bash
curl -X PATCH https://api.example.ac.th/v1/dmps/dmp-soil/draft \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "draft_revision": 41, "patch": { "title": "Soil Microbiome DMP" } }'
```

The `patch` is a merge patch over [`dmpDraftSchema`](../../src/schemas/dmp/dmp.schema.ts), with outputs as
[`dataset.schema.ts`](../../src/schemas/dataset/dataset.schema.ts),
contributors as
[`contributor.schema.ts`](../../src/schemas/contributor/contributor.schema.ts)
and costs as [`cost.schema.ts`](../../src/schemas/contributor/cost.schema.ts).

**Response**

```json
{ "object": "dmp_draft", "dmp_id": "dmp-soil", "draft_revision": 42, "draft": { } }
```

The saved `draft` ([`dmpDraftSchema`](../../src/schemas/dmp/dmp.schema.ts)) and its new `draft_revision`.

**Parameters**

- `draft_revision` (integer, **required**)
  The revision this change was made against.
- `patch` (object, **required**)
  The merge patch.

**Returns** the saved draft and its revision.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `field_invalid` | A value doesn't fit its field. `param` names it. |
| 400 | `field_locked` | The patch changes a locked field. |
| 409 | `draft_conflict` | `draft_revision` is out of date. The error carries the current `draft` and `draft_revision` to rebase onto. |

### Discard draft edits

`POST /v1/dmps/:dmp_id/draft/discard`

Throws away the draft's unsaved, unsubmitted edits: the editor's **Cancel**
for a plan that has been submitted.

- A plan in force goes back to the version in force. A plan waiting for its
  first decision keeps its submission exactly as submitted. Nothing in force
  or under review changes.
- An unsubmitted plan has nothing to go back to: Cancel
  [archives it](#archive-a-plan) instead. Nothing is ever deleted.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useDmpStore.closeDraft()` (returns `discarded`, `kept`,
`archived` or `cleared`).

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-soil/draft/discard \
  -H "Authorization: Bearer <access_token>"
```

**Response**

The [Plan](#the-plan-object) with `include=draft`: the draft is back to the
version in force, or to the submission.

**Parameters** none.

**Returns** the [Plan](#the-plan-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `never_submitted` | The plan has no submission to go back to. Archive it instead. |

### Restore a version

`POST /v1/dmps/:dmp_id/draft/restore`

Loads a version's snapshot into the working draft.

- Restoring the version in force discards unsubmitted edits and records
  nothing.
- Restoring any other version (an earlier approved one, or one that was sent
  back) is from then on an ordinary edit: compared with the version in force
  and saved as minor or submitted as a revision like any other, so a rollback
  can't skip approval. What it produces records `restored_from`.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useDmpStore.restoreVersion(number)`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-soil/draft/restore \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "number": 1, "draft_revision": 42 }'
```

**Response**

The [Plan](#the-plan-object) with `include=draft`, the draft now holding the
restored snapshot and a new `draft_revision`.

**Parameters**

- `number` (integer, **required**)
  The version to restore.
- `draft_revision` (integer, **required**)
  As in [Update a draft](#update-a-draft).

**Returns** the [Plan](#the-plan-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 404 | `version_not_found` | No version with that number. |
| 409 | `version_pending` | That version is still waiting on a decision. |
| 409 | `draft_conflict` | As in Update a draft. |

### Submit for approval

`POST /v1/dmps/:dmp_id/submit`

Sends an institutional plan to the committee for its first decision.

- The draft must pass `dmpSchema` and the submission checklist
  ([Plan rules](../project-erd.md#plan-rules-the-schema-enforces)). The error
  lists every unmet item with its field path: the same list the readiness
  checklist shows. This is the only gate, and nothing from the AI takes part.
- `draft_revision` names the draft the researcher reviewed. If the draft has
  changed since, the submission is refused, so what's submitted is what they
  saw.
- Freezes the plan's `plan_mode`, creates version 1 as `pending`, and
  notifies the committee and chief (`review_requested`) and the author
  (`dmp_submitted`).
- Independent plans don't go to the committee: they use
  [Finalize a plan](#finalize-a-plan).

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useDmpStore.submitForApproval()`, from Review & submit.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-soil/submit \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "draft_revision": 42 }'
```

**Response**

The [Plan](#the-plan-object), status `pending`, with its new pending
[Version](#the-version-object) under `versions`.

**Parameters**

- `draft_revision` (integer, **required**)
  The draft the researcher reviewed.

**Returns** the [Plan](#the-plan-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `already_submitted` | The plan already has a version. Changes go through Submit a revision. |
| 409 | `plan_is_independent` | Independent plans are finalized by their author. |
| 409 | `draft_conflict` | The draft changed after it was reviewed. |
| 422 | `plan_incomplete` | The checklist has unmet items; each is listed with its `param`. |

### Finalize a plan

`POST /v1/dmps/:dmp_id/finalize`

Puts an independent plan's draft in force, with its author as approver. Used
for the first version and for any later change that includes a major edit:
an independent plan has no committee, so its author signs off.

- Same completeness check and `draft_revision` rule as
  [Submit for approval](#submit-for-approval).
- Lands where an approval lands: the version is in force, tasks can be
  generated, and the export names the author as approver. The plan's mode is
  frozen as `independent`.
- Notifies the author (`dmp_finalized`).

**Who can call:** `researcher`, the plan's author, on an independent plan

**Frontend today:** `useDmpStore.finalize()`, from Review & submit and from
the editor's changes panel.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-river/finalize \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "draft_revision": 17 }'
```

**Response**

The [Plan](#the-plan-object), status `approved`, with the new version in
force.

**Parameters**

- `draft_revision` (integer, **required**)
  As in Submit for approval.

**Returns** the [Plan](#the-plan-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `plan_is_institutional` | Institutional plans are decided by the committee. |
| 409 | `draft_conflict` | The draft changed after it was reviewed. |
| 422 | `plan_incomplete` | As in Submit for approval. |

### Save minor edits

`POST /v1/dmps/:dmp_id/minor-edits`

Applies the draft's edits to the version in force when every one of them is
minor (see [Editing a plan in force](#editing-a-plan-in-force)). No new
version, nothing to review.

- The server classifies the edits with the same rule; the client's
  classification is never trusted.
- The edits are logged in the version's `minor_edits`.
- Works while a revision waits: the fixes go onto the version in force and
  the pending snapshot stays frozen. When the revision is approved they're
  carried into it (`carried_minor_edits`), or recorded in
  `dropped_minor_edits` when they touch an output the revision removed.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useDmpStore.saveMinorEdits()`, from the editor's changes
panel.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-soil/minor-edits \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "draft_revision": 43 }'
```

**Response**

The version in force ([Version](#the-version-object)), its `minor_edits`
including the new ones.

**Parameters**

- `draft_revision` (integer, **required**)
  As in Update a draft.

**Returns** the [Version](#the-version-object) in force.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `plan_not_in_force` | The plan has no version in force yet. |
| 409 | `no_new_edits` | Nothing to save. |
| 409 | `edits_include_major` | At least one edit is major. It needs Submit a revision, or Finalize for an independent plan. |
| 409 | `draft_conflict` | As in Update a draft. |

### Submit a revision

`POST /v1/dmps/:dmp_id/revisions`

Submits a change that includes a major edit as the next numbered version,
`pending`. The version in force keeps running until the committee decides.

- **One revision waits at a time.** Refused while another version is pending,
  since a second would be built on a version that may never be approved.
- The version records its changes, its snapshot, and `based_on`: the version
  in force it was made against.
- Same completeness check and `draft_revision` rule as
  [Submit for approval](#submit-for-approval).
- Notifies the committee and chief (`review_requested`) and the author
  (`dmp_submitted`).

**Who can call:** `researcher`, the plan's author, on an institutional plan

**Frontend today:** `useDmpStore.submitRevision()`, from the editor's changes
panel.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-soil/revisions \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "draft_revision": 44 }'
```

**Response**

The new pending [Version](#the-version-object).

**Parameters**

- `draft_revision` (integer, **required**)
  As in Submit for approval.

**Returns** the new [Version](#the-version-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `revision_pending` | Another version is waiting on a decision. |
| 409 | `no_new_edits` | Nothing has changed since the version in force. |
| 409 | `plan_is_independent` | Use Finalize a plan. |
| 409 | `draft_conflict` | As in Submit for approval. |
| 422 | `plan_incomplete` | As in Submit for approval. |

### Archive a plan

`POST /v1/dmps/:dmp_id/archive`

Sets a plan aside. There's no way to delete a plan.

- Refused while the plan is in force: its tasks and evidence are the record
  of work done.
- An archived plan keeps everything it held, drops out of My DMPs, Tasks and
  project views, and is listed with `archived=true`.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useDmpStore.archiveDmp(id)`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-old/archive \
  -H "Authorization: Bearer <access_token>"
```

**Response**

The [Plan](#the-plan-object) with `archived_at` set.

**Parameters** none.

**Returns** the [Plan](#the-plan-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `plan_in_force` | A plan in force can't be archived. |

### Unarchive a plan

`POST /v1/dmps/:dmp_id/unarchive`

Brings an archived plan back, unchanged.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useDmpStore.unarchiveDmp(id)`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-old/unarchive \
  -H "Authorization: Bearer <access_token>"
```

**Response**

The [Plan](#the-plan-object) with `archived_at: null`.

**Parameters** none.

**Returns** the [Plan](#the-plan-object).

**Error codes**

Only the common errors listed in [README](./README.md#errors).
