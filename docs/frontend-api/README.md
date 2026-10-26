# Frontend API docs

The API each side of the DMP Researcher frontend needs: every page, how many
inputs it asks for, and the endpoints behind it. The format follows the
[Stripe API reference](https://docs.stripe.com/api/v2/core/accounts): one page
per resource, with an endpoint list, the object it returns, then each endpoint
with its request, response, parameters, return value and error codes.

> **Status: proposed contract.** There is no backend yet. The frontend does all
> of this today with browser-held Zustand stores. Each endpoint names the store
> call it replaces (**Frontend today**), so it can be swapped for a request
> without changing what the page does.

Field names follow the frontend schemas and [the ERD](../project-erd.md)
(`snake_case`), so a response can be stored without renaming.

---

## Contents

1. [Page maps](#page-maps)
2. [Resources](#resources)
3. [Conventions](#conventions)
4. [Decisions and open items](#decisions-and-open-items)

---

## Page maps

What each role fills in on each page, and which endpoints the page calls.

| Role | Page map | Status |
| --- | --- | --- |
| Committee | [pages/committee.md](./pages/committee.md) | Done |
| Researcher | [pages/researcher.md](./pages/researcher.md) | Done |

## Resources

| Resource | Page | Objects | Endpoints |
| --- | --- | --- | --- |
| Authentication and profile | [auth.md](./auth.md) | User | Sign in, Refresh a session, Sign out, Retrieve the current user, Update the current user, Register, Check a username |
| Reviews | [reviews.md](./reviews.md) | Review | List reviews |
| Plans (DMPs) | [dmps.md](./dmps.md) | Plan, Version | Retrieve a plan, List plans, Approve a version, Reject a version, Create a plan, Update a draft, Discard draft edits, Restore a version, Submit for approval, Finalize a plan, Save minor edits, Submit a revision, Archive a plan, Unarchive a plan |
| Projects | [projects.md](./projects.md) | Project, Progress | List projects, Retrieve a project, List project members, Create a project |
| Tasks | [tasks.md](./tasks.md) | Task | List tasks, Create a task, Create generated tasks, Update a task, Complete a task, Reopen a task, Cancel a task, Delete a task, checklist steps (add, update, delete, replace), evidence (set, clear), reopen offers (list, accept, dismiss) |
| Files | [files.md](./files.md) | File | List files, Download a file, Upload a file, Archive a file, Delete a file |
| AI | [ai.md](./ai.md) | Thread entry | Retrieve the AI quota, Analyze a proposal, Regenerate a field, Send a chat message, Suggest changes, Generate tasks, Draft a task checklist, thread (list, update, clear, adopt) |
| Notifications | [notifications.md](./notifications.md) | Notification | List notifications, Mark a notification read, Mark all notifications read, Delete a notification, Delete all notifications |

---

## Conventions

### Base URL

`https://api.example.ac.th/v1` (placeholder).

### Authentication

JWT bearer. [Sign in](./auth.md#sign-in) returns a short-lived access token
and sets a rotating refresh-token cookie. Send the access token on every
other request:

```http
Authorization: Bearer <access_token>
```

When it expires (`401 token_expired`), [refresh it](./auth.md#refresh-a-session)
and repeat the request. Lifetimes, storage and rotation are in
[Tokens](./auth.md#tokens).

### Who may call

Each endpoint lists its roles under **Who can call**. Across the API:

| Role | May |
| --- | --- |
| `researcher` | Author their own plans (one author per plan; project membership is for following, not co-editing), and work with their own projects, tasks, files and AI thread. Another researcher's plan answers `404`, so its existence isn't confirmed. |
| `committee`, `chief` | Review: read every **institutional** project and plan, and approve or reject versions. Never the AI thread. Independent plans are finalized by their author and never reach the committee. |
| `admin` | Operational: users, project members and AI quotas, through admin endpoints that come with the admin screens and aren't in this contract yet. **`403` on every plan endpoint**: no approve or reject, and no plan reads. If support ever needs to see a plan, that will be a narrow, explicit, logged read added on purpose. |
| anyone | [Sign in](./auth.md#sign-in), [Refresh a session](./auth.md#refresh-a-session), [Register](./auth.md#register), [Check a username](./auth.md#check-a-username). |

Committee-only endpoints answer `403 not_a_reviewer` to anyone else, and
researcher-only endpoints answer `403 not_a_researcher` to other roles.

**Frontend today:** matches. `isReviewer` in `src/config/roles.ts` is
`committee` and `chief` only, `isResearcher` guards the authoring side, and
admin is on neither: it lands on a holding page and can't open plans or
projects. Review requests (`review_requested`) go to `committee` and `chief`
only (`getReviewers`).

### How the researcher endpoints use the template

They follow the same layout as the committee endpoints: description and
rules, **Who can call**, **Frontend today**, **Request**, **Response**,
**Parameters**, **Returns**, **Error codes**. One difference: the backend
(NestJS) generates its typed contract from the frontend's `zod` schemas
through OpenAPI, and `zod` is the single source of truth for shapes. So
their **Request** and **Response** show the call and link to the schema or
type instead of repeating its fields, and **Parameters** lists only values
the schema doesn't hold (such as `draft_revision`).

### Requests and responses

Requests and responses are JSON. Timestamps are `date-time` strings and
calendar dates without a time (plan begin/end, task due dates) are `date`
strings, as defined below.

### Types

The type names used in every **Attributes** and **Parameters** list:

| Type | Meaning |
| --- | --- |
| `string` | A JSON string. |
| `integer` | A JSON number with no fractional part. |
| `number` | A JSON number that may have a fractional part (cost `value`). |
| `boolean` | `true` or `false`. |
| `enum` | A string from a fixed list, given under "Possible enum values". |
| `array of enums` | A list of enum values. In a query string, send them comma-separated. |
| `array of strings` | A list of strings. |
| `array of objects` | A list of objects, with their attributes listed underneath. |
| `object` | A JSON object, with its attributes listed underneath. |
| `date-time` | A timestamp in [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) format, e.g. `2026-10-22T08:41:00Z`. |
| `date` | A calendar date with no time, `YYYY-MM-DD`, e.g. `2026-11-01`. |

An attribute marked `nullable` can be `null`; one marked `required` is always
present and never `null`. One marked `includable` is returned only when asked
for with the endpoint's `include` parameter; otherwise it is left out of the
response, not sent as `null`.

### Lists and pagination

Lists share one shape and are paged with `limit` (1–100, default 20) and
`starting_after` (the last `id` of the previous page):

```json
{
  "object": "list",
  "data": [],
  "has_more": false,
  "total_count": 0
}
```

`total_count` counts every match, not just this page. The dashboard's stat
cards are built from it.

This is the Stripe **v1** list shape (`object: "list"`, `data`, `has_more`,
`total_count`, paged with `starting_after`), not Stripe v2's `next_page_url`.
The dashboard's stat cards read `total_count` directly (see
[List reviews](./reviews.md#list-reviews)), and v2 lists don't return a total.

### Errors

Errors return a non-2xx status and one shape:

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "note_required",
    "message": "A note is required when sending a version back.",
    "param": "note"
  }
}
```

These codes can come from any endpoint:

| HTTP status code | Code | Description |
| --- | --- | --- |
| 401 | `not_signed_in` | No access token. |
| 401 | `token_expired` | The access token has expired. [Refresh it](./auth.md#refresh-a-session) and repeat the request. |
| 403 | `not_a_reviewer` | The signed-in user isn't committee or chief. |
| 404 | `resource_missing` | No object with that id. |
| 429 | `rate_limited` | Too many requests; retry later. |

Each endpoint's **Error codes** table lists only the codes specific to it.

---

## Decisions and open items

### Decided

| Decision | Where it's applied |
| --- | --- |
| Draft saves are one partial `PATCH` with `draft_revision`; a stale revision gets `409` with the current draft to rebase onto. | [Update a draft](./dmps.md#update-a-draft) |
| A plan has one author; project membership is for following. | [Who works on a plan](./dmps.md#who-works-on-a-plan) |
| Exports (maDMP, RDA) stay in the browser, out of the API. | not in the API |
| Admin gets `403` on every plan endpoint. | [Who may call](#who-may-call) |
| JWT bearer: 15-minute access token, rotating 14-day refresh cookie. | [Tokens](./auth.md#tokens) |
| Major edits: the existing triggers plus repository, retention, licence and contributors. | [Editing a plan in force](./dmps.md#editing-a-plan-in-force) |
| AI actions stream `delta`, `proposal`, `done`, `error`; abort cancels upstream; retries are idempotent. | [Streaming](./ai.md#streaming) |
| Tasks are drafted from the version in force. | [Generate tasks](./ai.md#generate-tasks) |
| A file used as evidence is archived, never hard-deleted. | [Delete a file](./files.md#delete-a-file), [Archive a file](./files.md#archive-a-file) |
| A finished task's evidence can't be cleared or replaced until it's reopened. | [Clear evidence](./tasks.md#clear-evidence) |
| Quota counts output plus uncached input, cached input discounted, reset monthly (tunable default). | [Retrieve the AI quota](./ai.md#retrieve-the-ai-quota) |
| Uploads: 20 MB cap, `.docx` proposals checked by MIME type; an unreadable proposal is `422` and creates no plan. | [Upload a file](./files.md#upload-a-file), [Analyze a proposal](./ai.md#analyze-a-proposal) |
| Evidence is an uploaded file or an external link or DOI. | [Set evidence](./tasks.md#set-evidence) |
| Notifications are polled; no push. | [Delivery](./notifications.md#delivery) |

### Deferred

| Item | Interim behaviour |
| --- | --- |
| **Admin screens and landing page.** A frontend UX decision, not part of this contract. Suggested: land admin on a users, projects and quota area. | Admin lands on a holding page with no plan access. |
| **Grounded advice in the chat** ("which repository should I use?"). A backend design track tied to the RAG decision: retrieval over a repository and guidance source. | The chat says plainly that it can't recommend a repository, tool, licence or format yet, and points to the institution's data steward or library. |

### Frontend changes still to make

The contract is ahead of the frontend on these; each endpoint's
**Frontend today** says so too.

- Add the two new fields to the schemas: `draft_revision` on the plan, and
  `archived_at` on files.
- Track `draft_revision` and rebase on `409 draft_conflict`
  ([Update a draft](./dmps.md#update-a-draft)).
- Refuse clearing or replacing a finished task's evidence
  ([Clear evidence](./tasks.md#clear-evidence), [Set evidence](./tasks.md#set-evidence)).
- Archive, instead of delete, a file used as evidence
  ([Delete a file](./files.md#delete-a-file)).
- Charge the quota by the policy above and give a monthly `resets_at`
  ([Retrieve the AI quota](./ai.md#retrieve-the-ai-quota)); the mock still
  charges input + output with no reset date.
