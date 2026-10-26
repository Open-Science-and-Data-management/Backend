# Tasks

The work a plan in force has been broken into. The plan's author creates, works
through and closes them; committee members see tasks to follow a project's
progress, and can't tick, move, or edit them. Admin gets `403`.

Tasks are the record of work actually done, so the ERD's
[Preservation](../project-erd.md#preservation-nothing-that-records-work-is-destroyed)
rules hold throughout: a task with recorded work is never deleted, a finished
task is never cancelled or stripped of its evidence, and nothing is reopened
without the researcher choosing it.

## Endpoints

| | |
| --- | --- |
| [List tasks](#list-tasks) | `GET /v1/tasks` |
| [Create a task](#create-a-task) | `POST /v1/tasks` |
| [Create generated tasks](#create-generated-tasks) | `POST /v1/dmps/:dmp_id/tasks/generated` |
| [Update a task](#update-a-task) | `PATCH /v1/tasks/:task_id` |
| [Complete a task](#complete-a-task) | `POST /v1/tasks/:task_id/complete` |
| [Reopen a task](#reopen-a-task) | `POST /v1/tasks/:task_id/reopen` |
| [Cancel a task](#cancel-a-task) | `POST /v1/tasks/:task_id/cancel` |
| [Delete a task](#delete-a-task) | `DELETE /v1/tasks/:task_id` |
| [Add a checklist step](#add-a-checklist-step) | `POST /v1/tasks/:task_id/checklist` |
| [Update a checklist step](#update-a-checklist-step) | `PATCH /v1/tasks/:task_id/checklist/:item_id` |
| [Delete a checklist step](#delete-a-checklist-step) | `DELETE /v1/tasks/:task_id/checklist/:item_id` |
| [Replace the checklist](#replace-the-checklist) | `PUT /v1/tasks/:task_id/checklist` |
| [Set evidence](#set-evidence) | `PUT /v1/tasks/:task_id/evidence` |
| [Clear evidence](#clear-evidence) | `DELETE /v1/tasks/:task_id/evidence` |
| [List reopen offers](#list-reopen-offers) | `GET /v1/dmps/:dmp_id/reopen-offers` |
| [Accept a reopen offer](#accept-a-reopen-offer) | `POST /v1/reopen-offers/:offer_id/accept` |
| [Dismiss a reopen offer](#dismiss-a-reopen-offer) | `POST /v1/reopen-offers/:offer_id/dismiss` |

## The Task object

```json
{
  "object": "task",
  "task_id": "2",
  "dmp_id": "dmp-pollinator",
  "dataset_id": "ds-pollinator-reads",
  "dataset_title": "Pollinator genomic sequence reads",
  "title": "Run QC on the sequencing batch",
  "details": "Check read quality and record the failures.",
  "lifecycle_stage": "process",
  "status": "in_progress",
  "priority": "medium",
  "progress_percent": 50,
  "start_date": null,
  "end_date": "2026-10-09",
  "evidence": { "type": "none" },
  "completed_at": null,
  "completed_by": null
}
```

### Attributes

- `object` (string, value is `"task"`)
  The object's type.
- `task_id` (string, required)
  Unique id.
- `dmp_id` (string, required)
  The plan the task belongs to.
- `dataset_id` (string, nullable)
  The research output the task is for.
- `dataset_title` (string, nullable)
  The research output's title, for display.
- `title` (string, required)
  What the task is.
- `details` (string, nullable)
  More detail.
- `lifecycle_stage` (enum, required)
  Possible enum values:
  - `collect`
  - `process`
  - `analyse`
  - `preserve`
  - `share`
- `status` (enum, required)
  Possible enum values:
  - `todo`
  - `in_progress`
  - `done`
  - `cancelled`
- `priority` (enum, required)
  Possible enum values:
  - `low`
  - `medium`
  - `high`
- `progress_percent` (integer, required)
  Derived from the checklist.
- `start_date` (date, nullable)
  When the task starts.
- `end_date` (date, nullable)
  When the task is due.
- `evidence` (object, required)
  What shows the work was done.
  - `type` (enum, required)
    Possible enum values:
    - `none`
    - `file`
    - `url`
    - `rdm_deposit`
  - `ref` (string, nullable)
    File id, URL, or DOI, depending on `type`.
  - `label` (string, nullable)
    Shown in place of `ref` in the task table, so the file doesn't need
    looking up.
  - `attached_at` (date-time, nullable)
    When it was attached.
- `completed_at` (date-time, nullable)
  When the task was completed.
- `completed_by` (string, nullable)
  Who completed it.

### List tasks

`GET /v1/tasks`

Lists a project's tasks for the read-only task table on the **Project** page:
task, stage, status, progress, due date, evidence.

**Who can call:** `committee`, `chief`; `researcher` for tasks of plans they wrote

**Frontend today:** `useTaskStore.tasks` filtered to the project's plans,
shown by `TaskReadOnlyList`.

**Request**

```bash
curl "https://api.example.ac.th/v1/tasks?project_id=proj-1" \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{
  "object": "list",
  "data": [
    {
      "object": "task",
      "task_id": "2",
      "dmp_id": "dmp-pollinator",
      "dataset_id": "ds-pollinator-reads",
      "dataset_title": "Pollinator genomic sequence reads",
      "title": "Run QC on the sequencing batch",
      "details": "Check read quality and record the failures.",
      "lifecycle_stage": "process",
      "status": "in_progress",
      "priority": "medium",
      "progress_percent": 50,
      "end_date": "2026-10-09",
      "evidence": { "type": "none" }
    }
  ],
  "has_more": false,
  "total_count": 4
}
```

**Parameters**

- `project_id` (string, one of `project_id` or `dmp_id` **required**)
  Tasks of the project's plans.
- `dmp_id` (string, one of `project_id` or `dmp_id` **required**)
  Tasks of one plan.
- `status` (enum, optional)
  Possible enum values:
  - `todo`
  - `in_progress`
  - `done`
  - `cancelled`

**Returns** a list of [Tasks](#the-task-object), ordered by lifecycle stage,
then title.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `filter_required` | Neither `project_id` nor `dmp_id` was sent. |
| 400 | `invalid_status` | `status` holds a value other than the four above. |

### Create a task

`POST /v1/tasks`

Adds a task by hand to a plan in force.

- `generated_by` is `user`, whatever is sent.
- An optional `dataset_id` must be an output of the **version in force**. It
  decides what closing the task needs (see [Complete a task](#complete-a-task)).
- Only a plan with a version in force has tasks.

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.addTask(task)` from `TaskFormDialog`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/tasks \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "dmp_id": "dmp-soil", "title": "Back up the raw reads", "lifecycle_stage": "collect" }'
```

The body is a task as [`taskSchema.ts`](../../src/schemas/task/taskSchema.ts) defines it.

**Response**

The new [Task](#the-task-object).

**Returns** the [Task](#the-task-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `plan_not_in_force` | The plan has no version in force. |
| 400 | `dataset_not_in_force` | `dataset_id` isn't an output of the version in force. |

### Create generated tasks

`POST /v1/dmps/:dmp_id/tasks/generated`

Saves the tasks [Generate tasks](./ai.md#generate-tasks) drafted, once the
researcher has confirmed them.

- Every task must be for an output of the **version in force**. Tasks execute
  the approved plan; an output added in the working copy or in a revision
  still waiting on a decision gets no tasks yet.
- `mode: add` adds them alongside the plan's tasks (the "only outputs without
  tasks yet" choice). `mode: replace` swaps out the plan's untouched AI tasks
  (`generated_by: ai`, `todo`, 0% progress, no evidence) for the new ones.
  Anything worked on, and anything a person created, is kept.
- Marks the plan as having its tasks generated.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useTaskStore.addGeneratedTasks(tasks)` or
`replaceGeneratedTasks(dmpId, tasks)`, then `useDmpStore.markTasksGenerated`.
The outputs come from `outputsInForce(record)`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-soil/tasks/generated \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "mode": "add", "tasks": [] }'
```

`tasks` are the drafted tasks as `GenerateTasksResult` returns them
([`aiApi.ts`](../../src/api/aiApi.ts)).

**Response**

```json
{ "object": "generated_tasks", "added": 6, "removed": 0, "kept": 3, "data": [] }
```

**Parameters**

- `mode` (enum, **required**)
  `add` or `replace`.
- `tasks` (array of objects, **required**)
  The confirmed drafts.

**Returns** the counts and the created [Task](#the-task-object)s.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `plan_not_in_force` | The plan has no version in force. |
| 400 | `dataset_not_in_force` | A task names an output that isn't in the version in force. |

### Update a task

`PATCH /v1/tasks/:task_id`

Edits a task's title, details, priority, stage, output, dates, or board column.

- A finished task's `dataset_id` can't change until it's reopened: it was
  judged against the evidence its output required, and re-pointing it would
  rewrite that judgement.
- Moving a task to `done` goes through [Complete a task](#complete-a-task), so
  its evidence is checked (the board does this today); `status: done` here is
  refused.

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.updateTask(id, patch)`.

**Request**

```bash
curl -X PATCH https://api.example.ac.th/v1/tasks/task-12 \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "status": "in_progress" }'
```

Any fields of a task as [`taskSchema.ts`](../../src/schemas/task/taskSchema.ts) defines it.

**Response**

The updated [Task](#the-task-object).

**Returns** the [Task](#the-task-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `use_complete` | `status: done` must go through Complete a task. |
| 409 | `output_locked` | A finished task's output can't change until it's reopened. |

### Complete a task

`POST /v1/tasks/:task_id/complete`

Closes a task if its evidence meets what its work requires
([`task-evidence.ts`](../../src/config/task-evidence.ts)):

- A task with no output: the researcher's word is enough (`declared`).
- Collect, process or analyse on an output: an uploaded file or a link to the
  output (`evidence_linked`).
- Preserve or share on an output: a DOI or URL issued by the repository
  (`system_verified`). On an independent plan, with no committee reading it,
  this has to be the repository's own record, not just a typed link.

Completing ticks every step, records `completed_at` and `completed_by`, and
moves the task's output forward along its lifecycle (planned → collected →
processed → preserved → shared, never backwards).

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.completeTask(taskId)`, which calls
`useDmpStore.advanceDatasetStatus`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/tasks/task-12/complete \
  -H "Authorization: Bearer <access_token>"
```

**Response**

The finished [Task](#the-task-object).

**Parameters** none.

**Returns** the [Task](#the-task-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `evidence_required` | The evidence doesn't meet the task's requirement, which is named in the error. |

### Reopen a task

`POST /v1/tasks/:task_id/reopen`

Takes a finished task back to work: the explicit way to change a finished
task's evidence. Its evidence and ticked steps stay; `completed_at` and
`completed_by` are cleared, and it returns to `in_progress` (or `todo` if no
step is ticked).

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.reopenTask(taskId)`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/tasks/task-12/reopen \
  -H "Authorization: Bearer <access_token>"
```

**Response**

The reopened [Task](#the-task-object).

**Parameters** none.

**Returns** the [Task](#the-task-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `task_not_done` | Only a finished task can be reopened. |

### Cancel a task

`POST /v1/tasks/:task_id/cancel`

Stops a task without deleting it. A finished task can't be cancelled, since
that would overwrite the record of its completion; reopen it instead. A
cancellation records the status it replaced (`cancelled_from`),
`cancel_reason: manual` and when, and keeps the evidence.

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.cancelTask(taskId)` (leaves a finished task
as it is).

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/tasks/task-12/cancel \
  -H "Authorization: Bearer <access_token>"
```

**Response**

The cancelled [Task](#the-task-object).

**Parameters** none.

**Returns** the [Task](#the-task-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `task_done` | A finished task can't be cancelled. |

### Delete a task

`DELETE /v1/tasks/:task_id`

Removes a task nobody has started. Refused for a task with recorded work
(evidence attached, a ticked step, or a completion): cancel it instead.

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.deleteTask(id)`, which returns `false` when
refused (`hasRecordedWork`).

**Request**

```bash
curl -X DELETE https://api.example.ac.th/v1/tasks/task-12 \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{ "object": "task", "task_id": "task-12", "deleted": true }
```

**Parameters** none.

**Returns** a deletion confirmation.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `task_has_recorded_work` | The task has evidence, a ticked step or a completion. |

### Add a checklist step

`POST /v1/tasks/:task_id/checklist`

Adds a step to a task's checklist.

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.addChecklistItem(taskId, label)`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/tasks/task-12/checklist \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "label": "Record the sampling sites" }'
```

**Response**

The [Task](#the-task-object) with its checklist.

**Parameters**

- `label` (string, **required**)
  The step.

**Returns** the [Task](#the-task-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `label_required` | `label` is blank. |

### Update a checklist step

`PATCH /v1/tasks/:task_id/checklist/:item_id`

Renames a step or ticks it. The task's progress follows the share of steps
ticked.

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.renameChecklistItem` /
`toggleChecklistItem`.

**Request**

```bash
curl -X PATCH https://api.example.ac.th/v1/tasks/task-12/checklist/item-3 \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "done": true }'
```

**Response**

The [Task](#the-task-object) with its checklist and progress.

**Parameters**

- `label` (string, optional)
  The new wording.
- `done` (boolean, optional)
  Ticked or not.

**Returns** the [Task](#the-task-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 404 | `item_not_found` | The task has no step with that id. |

### Delete a checklist step

`DELETE /v1/tasks/:task_id/checklist/:item_id`

Removes a step.

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.removeChecklistItem`.

**Request**

```bash
curl -X DELETE https://api.example.ac.th/v1/tasks/task-12/checklist/item-3 \
  -H "Authorization: Bearer <access_token>"
```

**Response**

The [Task](#the-task-object) with its checklist.

**Parameters** none.

**Returns** the [Task](#the-task-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 404 | `item_not_found` | The task has no step with that id. |

### Replace the checklist

`PUT /v1/tasks/:task_id/checklist`

Swaps in a redrafted list of steps, usually from
[Draft a task checklist](./ai.md#draft-a-task-checklist). Ticked steps
survive; only unticked ones are replaced.

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.replaceChecklist(taskId, labels)`.

**Request**

```bash
curl -X PUT https://api.example.ac.th/v1/tasks/task-12/checklist \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "labels": ["Write the README", "Deposit in Zenodo"] }'
```

**Response**

The [Task](#the-task-object) with its new checklist.

**Parameters**

- `labels` (array of strings, **required**)
  The new steps, in order.

**Returns** the [Task](#the-task-object).

**Error codes**

Only the common errors listed in [README](./README.md#errors).

### Set evidence

`PUT /v1/tasks/:task_id/evidence`

Attaches a task's evidence. Both kinds are accepted:

- **an uploaded file** (`type: file`, `ref` is the `file_id`), uploaded first
  with [Upload a file](./files.md#upload-a-file) (`purpose: evidence`);
- **an external link** (`type: url`), or **a DOI or deposit record** from a
  repository or other research data management system
  (`type: rdm_deposit`). A pasted DOI is recognised as one
  (`classifyPastedEvidence`).

Whether it's enough to close the task is checked at
[Complete a task](#complete-a-task). A finished task's evidence can't be
replaced: reopen it first.

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.setEvidence(taskId, evidence)`. It doesn't
refuse on a finished task yet.

**Request**

```bash
curl -X PUT https://api.example.ac.th/v1/tasks/task-12/evidence \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "type": "rdm_deposit", "ref": "10.5281/zenodo.1234567" }'
```

The body is `taskEvidenceSchema` in [`taskSchema.ts`](../../src/schemas/task/taskSchema.ts).

**Response**

The [Task](#the-task-object) with its evidence.

**Returns** the [Task](#the-task-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 404 | `file_not_found` | No file with that `file_id` on the plan's project. |
| 409 | `task_done` | A finished task's evidence can't change. Reopen it first. |

### Clear evidence

`DELETE /v1/tasks/:task_id/evidence`

Removes a task's evidence. **Refused on a finished task:** a completed task
is a locked record, and [reopening it](#reopen-a-task) is the explicit way to
change its evidence.

**Who can call:** `researcher`, the author of the task's plan

**Frontend today:** `useTaskStore.clearEvidence(taskId)`. It doesn't refuse
on a finished task yet; that's a frontend change to make.

**Request**

```bash
curl -X DELETE https://api.example.ac.th/v1/tasks/task-12/evidence \
  -H "Authorization: Bearer <access_token>"
```

**Response**

The [Task](#the-task-object) with no evidence.

**Parameters** none.

**Returns** the [Task](#the-task-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `task_done` | A finished task's evidence can't be removed. Reopen it first. |

### List reopen offers

`GET /v1/dmps/:dmp_id/reopen-offers`

Tasks the plan could reopen because a version brought back the output whose
removal cancelled them. The server makes these offers when a version comes
into force; nothing is reopened without the researcher choosing it. Tasks
cancelled by hand are never offered.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useTaskStore.reopenOffers`, created by `offerReopen` in
[`planEffects.ts`](../../src/store/planEffects.ts).

**Request**

```bash
curl https://api.example.ac.th/v1/dmps/dmp-soil/reopen-offers \
  -H "Authorization: Bearer <access_token>"
```

**Response**

A list of offers, as `ReopenOffer` in
[`taskStore.ts`](../../src/store/taskStore.ts): the output that came back and
the tasks that could reopen.

**Returns** a list of offers.

**Error codes**

Only the common errors listed in [README](./README.md#errors).

### Accept a reopen offer

`POST /v1/reopen-offers/:offer_id/accept`

Reopens the chosen tasks of an offer, each to the status it had before it was
cancelled and linked to the output that came back (by id, or by the recorded
title if it returned under a new id). The rest stay cancelled, and the offer
closes.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useTaskStore.reopenFromOffer(offerId, taskIds)`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/reopen-offers/offer-4/accept \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "task_ids": ["task-7", "task-9"] }'
```

**Response**

```json
{ "object": "reopen_offer", "offer_id": "offer-4", "reopened": 2 }
```

**Parameters**

- `task_ids` (array of strings, **required**)
  The offered tasks to reopen.

**Returns** how many were reopened.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `offer_closed` | The offer was already answered. |
| 400 | `task_not_offered` | A task isn't part of the offer. |

### Dismiss a reopen offer

`POST /v1/reopen-offers/:offer_id/dismiss`

Closes an offer without reopening anything.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useTaskStore.dismissReopenOffer(offerId)`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/reopen-offers/offer-4/dismiss \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{ "object": "reopen_offer", "offer_id": "offer-4", "reopened": 0 }
```

**Parameters** none.

**Returns** the closed offer.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `offer_closed` | The offer was already answered. |
