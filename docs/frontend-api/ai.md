# AI

The researcher's assistant: drafting a plan from a proposal, rewording fields,
the chat, drafting tasks and checklists, and the per-plan thread that records
all of it. Every AI endpoint is the plan author's. Committee members, chiefs
and admins never call them and never see the thread (`403`).

Request and response shapes are in code, not repeated here:
[`aiContract.ts`](../../src/api/aiContract.ts) (usage, quota, errors,
provenance), [`aiApi.ts`](../../src/api/aiApi.ts) (each action's input and
result), [`aiTools.ts`](../../src/api/aiTools.ts) (the chat's tool calls) and
[`aiThread.ts`](../../src/store/aiThread.ts) (thread entries).

## Endpoints

| | |
| --- | --- |
| [Retrieve the AI quota](#retrieve-the-ai-quota) | `GET /v1/ai/quota` |
| [Analyze a proposal](#analyze-a-proposal) | `POST /v1/ai/analyze-proposal` |
| [Regenerate a field](#regenerate-a-field) | `POST /v1/dmps/:dmp_id/ai/regenerate-field` |
| [Send a chat message](#send-a-chat-message) | `POST /v1/dmps/:scope/ai/chat` |
| [Suggest changes](#suggest-changes) | `POST /v1/dmps/:dmp_id/ai/suggest` |
| [Generate tasks](#generate-tasks) | `POST /v1/dmps/:dmp_id/ai/generate-tasks` |
| [Draft a task checklist](#draft-a-task-checklist) | `POST /v1/dmps/:dmp_id/ai/checklist` |
| [List thread entries](#list-thread-entries) | `GET /v1/dmps/:scope/ai-thread` |
| [Update a thread entry](#update-a-thread-entry) | `PUT /v1/dmps/:scope/ai-thread/:entry_id` |
| [Clear the chat](#clear-the-chat) | `POST /v1/dmps/:scope/ai-thread/clear` |
| [Adopt an unscoped thread](#adopt-an-unscoped-thread) | `POST /v1/ai-thread/adopt` |

AI actions run at `POST /v1/dmps/:dmp_id/ai/:action`. `:scope` is a `dmp_id`,
or `unscoped` for a chat started before the plan had an id. Analyze a proposal
is the one action outside a plan's path: the plan doesn't exist until the
analysis succeeds, and a proposal that can't be read must create no plan.

## Rules that hold for every AI endpoint

- **The AI never changes the plan.** Every action returns text, a suggestion
  or a proposal. Nothing reaches the plan until its author accepts it, through
  [Update a draft](./dmps.md#update-a-draft). There is no tool or endpoint that
  commits, submits, approves, completes or deletes.
- **The AI is never a gate.** What it says about readiness is advice read from
  the submission checklist ("still needed before you submit"). An empty
  checklist is reported as exactly that, with a reminder that the committee
  decides. No AI output may pre-approve, block or condition submission; only
  [Submit for approval](./dmps.md#submit-for-approval) checks it.
- **Field ownership decides what the AI may write**, from
  [`field-policy.ts`](../../src/config/field-policy.ts), enforced by the
  server and never taken from the client:
  - AI-owned free text (`permission: ai`, `kind: prose`): any rewrite, even
    from blank (`rewrite`).
  - The researcher's own free text (`permission: human`, `kind: prose`):
    wording only (`shorter`, `formal`), and only once they've written
    something (`polish`).
  - `noAiAssist` fields (Indigenous considerations): nothing at all, not even
    a chat suggestion.
  - Anything else (choices, dates, identifiers): no rewrite.
- **A reply belongs to the plan it was asked about**, even if the author has
  opened another plan since. It's recorded there, and a suggestion whose field
  moved meanwhile is marked `stale`, never applied.
- **Proposal content is data, never instructions.** Nothing in an uploaded
  document can choose which tools run or what gets written.

## Streaming

Every AI action streams its result as
[server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
in the response to its `POST`. The client reads the stream with `fetch`, not
`EventSource`, because the access token goes in the `Authorization` header
(see [Tokens](./auth.md#tokens)).

| Event | Data | Sent |
| --- | --- | --- |
| `delta` | `{ "text": "…" }`: the next piece of the reply's text | Zero or more times, in order |
| `proposal` | A proposal (`ChatProposal` in [`chatTools.ts`](../../src/store/chatTools.ts)), already checked against the field policy | Zero or more times, as each is ready |
| `done` | The action's result (below), its `usage`, and the `entry_id` of what it wrote to the thread | Once, last, on success |
| `error` | An [AI error](#errors), with any `usage` already counted | Once, last, on failure |

- A stream ends with exactly one `done` or one `error`.
- **Abort.** When the client aborts the request, the server cancels the
  upstream model call (OpenRouter) straight away. What the model already
  processed is still charged, and the client says so.
- **Retry, not resume.** A dropped stream is never resumed. The client retries
  it as a fresh request **with the same `Idempotency-Key`** (one key per
  action the researcher started). The server keeps each key's outcome for 24
  hours: a retry of a finished action replays its result without calling the
  model again, and a retry of one still running joins it. Either way the
  quota is charged once.

## Errors

AI actions fail with the codes of `AiErrorCode` in
[`aiContract.ts`](../../src/api/aiContract.ts), sent as the `error` event (or
as the response, when the request fails before streaming starts). Each carries
`retryable`, a message written for the researcher, any `usage` already
counted, and for `quota_exceeded`, `resets_at`.

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `invalid_input` | The request can't be used as sent. Not retryable. |
| 429 | `quota_exceeded` | The AI budget for this month is spent. Not retryable until `resets_at`. |
| 429 | `rate_limited` | Too many requests. Retryable. |
| 502 | `model_error` | The model failed. Retryable. |
| 502 | `invalid_output` | The model answered in a shape the server couldn't use. Retryable. |

---

### Retrieve the AI quota

`GET /v1/ai/quota`

The signed-in researcher's AI budget: `limit`, `used`, `resets_at`.

**Quota policy (tunable default, not final):**

- **What counts:** output tokens, plus input tokens that weren't served from
  the cache. Cached input is discounted (counted at 10% by default). This
  matches sending the whole proposal once and caching it across the calls
  that follow.
- **Reset:** monthly, at the start of each calendar month (UTC by default),
  matching the "left this month" wording in the app. `resets_at` is that date.
- The server is the only one that adds up spend, and it charges every call,
  including failed and stopped ones, for what was processed. The client
  re-reads the quota on sign-in and after every AI call; its pre-flight "not
  enough tokens" check is only a hint.
- Usage is always reported split (`input_tokens`, `output_tokens`,
  `cached_input_tokens`) so the policy can be tuned with real numbers.

**Who can call:** `researcher` (their own quota)

**Frontend today:** `fetchQuota()` in
[`aiServer.ts`](../../src/api/mock/aiServer.ts), via `useQuotaStore`. The mock
still charges input + output and gives no reset date (`resets_at: null`); it
should follow the policy above.

**Request**

```bash
curl https://api.example.ac.th/v1/ai/quota \
  -H "Authorization: Bearer <access_token>"
```

**Response**

`AiQuota` in [`aiContract.ts`](../../src/api/aiContract.ts).

**Returns** the quota.

**Error codes**

Only the common errors listed in [README](./README.md#errors).

### Analyze a proposal

`POST /v1/ai/analyze-proposal`

Reads an uploaded proposal and drafts a new plan from it: the draft, a
coverage report of what the proposal didn't say, and where each drafted value
came from.

- The proposal is uploaded first with
  [Upload a file](./files.md#upload-a-file) (`purpose: proposal`; `.docx`, at
  most 20 MB). This takes its `file_id` and `project_id`, and an optional
  direction.
- **A proposal that can't be read creates no plan.** If the document can't
  be parsed (mammoth fails), the call answers `422 proposal_unreadable` with a
  clear message, and nothing is created.
- On success it creates the plan (`draft`) and returns its `dmp_id`, and
  marks the project `active`. Sent with the `dmp_id` of a thin draft made from
  the same proposal, it redrafts that plan in place instead of filing a copy.
- **Provenance is never invented.** Each drafted field says where it came
  from: a quote from the proposal, or `none` when the model guessed. A field
  with no provenance makes no claim, and the form shows a confidence note
  only from what this returns.
- Recorded on the new plan's thread (`analyze_proposal` event).

**Who can call:** `researcher`, a member of the project

**Frontend today:** `useDmpStore.analyzeProposal(file, projectId, direction)`
→ `aiApi.analyzeProposal`.

**Request**

```bash
curl -N -X POST https://api.example.ac.th/v1/ai/analyze-proposal \
  -H "Authorization: Bearer <access_token>" \
  -H "Accept: text/event-stream" \
  -H "Idempotency-Key: 6f1c2a4e-…" \
  --json '{ "project_id": "proj-1", "file_id": "file-30" }'
```

**Response**

A [stream](#streaming). `done` carries the new `dmp_id`, the `draft`,
`coverage` and `provenance`: `aiApi.analyzeProposal`'s result in
[`aiApi.ts`](../../src/api/aiApi.ts), `ProvenanceMap` in
[`aiContract.ts`](../../src/api/aiContract.ts).

**Parameters**

- `project_id` (string, **required**)
- `file_id` (string, **required**)
  The uploaded proposal.
- `dmp_id` (string, optional)
  A thin draft from the same proposal, to redraft in place.
- `direction` (string, optional)
  How to steer the draft, in the researcher's words.

**Returns** a stream ending in `done` with the new plan.

**Error codes**

The [AI errors](#errors), plus:

| HTTP status code | Code | Description |
| --- | --- | --- |
| 404 | `file_not_found` | No such file on the project. |
| 422 | `proposal_unreadable` | The document couldn't be parsed. No plan was created. |

### Regenerate a field

`POST /v1/dmps/:dmp_id/ai/regenerate-field`

Drafts a rewrite of one free-text field in a given direction and returns it
as a **suggestion**. Nothing is written into the plan.

- The field is named by `path` (`description`,
  `dataset[1].preservation.statement`; an output is resolved by its
  `dataset_id`, not its position).
- **The mode comes from the field policy, not the client:** the server derives
  `rewrite` or `polish` with `regenerateMode()`.
- `polish` keeps the researcher's meaning and adds nothing: no new claims, no
  new facts. The prompt has to say so; the client can't enforce it.
- The result is recorded on the thread as a pending proposal (marked for the
  researcher's decision on human-owned fields) and a `regenerate_field` event.
  Text that comes back unchanged makes no proposal.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useDmpStore.regenerateField(target, label, direction)` →
`aiApi.regenerateField(label, currentValue, direction, mode)`; the suggestion
shows under its field (`InlineSuggestion`).

**Request**

```bash
curl -N -X POST https://api.example.ac.th/v1/dmps/dmp-soil/ai/regenerate-field \
  -H "Authorization: Bearer <access_token>" \
  -H "Accept: text/event-stream" \
  -H "Idempotency-Key: 6f1c2a4e-…" \
  --json '{ "path": "description", "direction": { "kind": "shorter" } }'
```

`direction` is `RegenerateDirection` in [`aiApi.ts`](../../src/api/aiApi.ts).

**Response**

A [stream](#streaming): `delta` events with the rewrite, one `proposal`, then
`done` (`RegenerateResult`).

**Returns** a stream ending in `done`.

**Error codes**

The [AI errors](#errors), plus:

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `field_not_regenerable` | Not free text, or a field the AI stays out of. |
| 400 | `nothing_to_polish` | A `polish` field that's still blank. |
| 400 | `direction_not_allowed` | A `polish` field asked for anything but `shorter` or `formal`. |

### Send a chat message

`POST /v1/dmps/:scope/ai/chat`

One turn of the chat: the researcher's message in; the assistant's reply,
proposals and refusals out. Both sides are written to the thread.

- The model may only call the tools in `TOOL_NAMES` that `ENABLED_TOOLS`
  switches on ([`aiTools.ts`](../../src/api/aiTools.ts)). Every call is checked
  by the server before it has any effect (`runToolCall` in
  [`chatTools.ts`](../../src/store/chatTools.ts)): unknown or disabled tool,
  a path that isn't a field, a locked field, a value the schema rejects. A
  refused call comes back as a refusal, with its reason shown.
- The model sees the message and counts about the plan, never the plan's prose
  as instructions.
- `checkReadiness` answers from the submission checklist as advice (see the
  rules above). `proposeRewrite` follows [Regenerate a field](#regenerate-a-field).
  Field changes come back as proposals. Adding a task is refused before the
  plan is approved.
- **Advice it can't ground yet.** Asked to recommend a repository, tool,
  licence or format, the assistant says plainly that it can't recommend one
  yet and points to the institution's data steward or library, rather than a
  generic fallback. Grounded advice needs retrieval over a repository and
  guidance source: an open backend design item (see the
  [README](./README.md#deferred)).
- The optional `section` (the editor section on screen) only resolves an
  ambiguous word, such as "description" in the Ethical section.

**Who can call:** `researcher`, the author of the plan or of the unscoped chat

**Frontend today:** `useChatStore.send(text, { section })`.

**Request**

```bash
curl -N -X POST https://api.example.ac.th/v1/dmps/dmp-soil/ai/chat \
  -H "Authorization: Bearer <access_token>" \
  -H "Accept: text/event-stream" \
  -H "Idempotency-Key: 6f1c2a4e-…" \
  --json '{ "message": "What is still needed before I submit?", "section": "general" }'
```

**Response**

A [stream](#streaming): `delta` events with the reply, a `proposal` per
proposed change, then `done` with the turn's `entry_id`. The turn is
`ThreadTurn` in [`aiThread.ts`](../../src/store/aiThread.ts).

**Returns** a stream ending in `done`.

**Error codes**

The [AI errors](#errors).

### Suggest changes

`POST /v1/dmps/:dmp_id/ai/suggest`

The assistant's Improve mode: reworks several fields at once, from the current
text or by re-reading the project's proposal.

- `source: current` takes `target_ids` from the AI-owned free-text fields only
  (`regenerateMode` is `rewrite`); the researcher's own text is polished one
  field at a time, never in a batch. `source: proposal` needs a proposal on
  file for the project.
- Fields that come back unchanged aren't proposed.
- The result is one assistant turn with its proposals, and a
  `batch_regenerate` or `analyze_proposal` event.

**Who can call:** `researcher`, the plan's author

**Frontend today:** `useChatStore.suggestChanges({ source, direction,
filename, targetIds })`.

**Request**

```bash
curl -N -X POST https://api.example.ac.th/v1/dmps/dmp-soil/ai/suggest \
  -H "Authorization: Bearer <access_token>" \
  -H "Accept: text/event-stream" \
  -H "Idempotency-Key: 6f1c2a4e-…" \
  --json '{ "source": "current", "target_ids": ["dmp:title"], "direction": "Plainer language" }'
```

`SuggestInput` in [`chatStore.ts`](../../src/store/chatStore.ts).

**Response**

A [stream](#streaming): a `proposal` per changed field, then `done`
(`SuggestResult`).

**Returns** a stream ending in `done`.

**Error codes**

The [AI errors](#errors), plus:

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `no_proposal_on_file` | `source: proposal` with no proposal on file. |

### Generate tasks

`POST /v1/dmps/:dmp_id/ai/generate-tasks`

Drafts the plan's tasks, optionally steered by a direction. The drafts are
saved with [Create generated tasks](./tasks.md#create-generated-tasks) once the
researcher confirms them.

- **Drafted from the version in force**, its outputs and dates, never from
  the working draft. Tasks execute the approved plan: edits made after
  approval, or an output in a revision still waiting on a decision, don't leak
  into tasks.
- Only for a plan with a version in force.
- A closed output gets no sharing task.
- Recorded on the thread (`generate_tasks` event).

**Who can call:** `researcher`, the plan's author

**Frontend today:** `generateTasks({ outputs, beginDate, endDate, direction })`
from [`aiApi.ts`](../../src/api/aiApi.ts), called by the Status page and
`RegenerateTasksDialog` with `outputsInForce(record)` and the version in
force's dates.

**Request**

```bash
curl -N -X POST https://api.example.ac.th/v1/dmps/dmp-soil/ai/generate-tasks \
  -H "Authorization: Bearer <access_token>" \
  -H "Accept: text/event-stream" \
  -H "Idempotency-Key: 6f1c2a4e-…" \
  --json '{ "direction": "More granular" }'
```

**Response**

A [stream](#streaming) ending in `done` with the drafted tasks
(`GenerateTasksResult` in [`aiApi.ts`](../../src/api/aiApi.ts)).

**Returns** a stream ending in `done`.

**Error codes**

The [AI errors](#errors), plus:

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `plan_not_in_force` | The plan has no version in force. |

### Draft a task checklist

`POST /v1/dmps/:dmp_id/ai/checklist`

Drafts the steps for one task. The steps are saved with
[Replace the checklist](./tasks.md#replace-the-checklist), where ticked steps
survive.

- **The steps are for the task's own output.** The server takes the task's
  output (`taskOutput`: id, title, type, access, personal data, repository,
  retention) from its `dataset_id` as the primary context, with the plan's
  other outputs by title only. A task with no `dataset_id` is plan-wide. The
  steps must never be drafted for another output in the plan.
- Steps follow the task's lifecycle stage: a collect task gets collection
  steps, not deposit steps.
- Recorded on the thread (`redraft_steps` event).

**Who can call:** `researcher`, the plan's author

**Frontend today:** `generateTaskChecklist({ taskTitle, lifecycleStage,
taskOutput, otherOutputs, direction })`, called from `TaskEvidence`.

**Request**

```bash
curl -N -X POST https://api.example.ac.th/v1/dmps/dmp-soil/ai/checklist \
  -H "Authorization: Bearer <access_token>" \
  -H "Accept: text/event-stream" \
  -H "Idempotency-Key: 6f1c2a4e-…" \
  --json '{ "task_id": "task-12", "direction": "Keep it brief" }'
```

The server builds `GenerateChecklistInput`
([`aiApi.ts`](../../src/api/aiApi.ts)) from the task.

**Response**

A [stream](#streaming) ending in `done` with the drafted `steps`.

**Parameters**

- `task_id` (string, **required**)
  A task of this plan.
- `direction` (string, optional)

**Returns** a stream ending in `done`.

**Error codes**

The [AI errors](#errors), plus:

| HTTP status code | Code | Description |
| --- | --- | --- |
| 404 | `task_not_found` | No such task on this plan. |

---

## The thread

Each plan has one AI thread: chat turns, proposals with their decisions, and
an event for every AI action (with its usage). It's stored by the server in
`AI_THREAD_ENTRY` ([ERD](../project-erd.md#ai-calls)), scoped by `dmp_id`, not
in the browser: browser storage is per device and lost when cleared, and the
thread has to come back on any machine.

- **Author-only.** Every row has an `owner_id`. The server returns rows to
  their owner and nobody else, enforced at the API, not only in the UI.
  Committee members, chiefs and admins review the plan, not the researcher's
  conversation with the assistant; they never get its contents.
- **The server writes AI output.** Turns, proposals and events produced by an
  AI action are written by the server as part of that action, so a client
  can't fake the AI's record of what it suggested. Clients only record
  decisions ([Update a thread entry](#update-a-thread-entry)).
- **No cap.** Every row is kept; reads are paged.

### List thread entries

`GET /v1/dmps/:scope/ai-thread`

The thread, oldest first: the newest page by default, older pages with
`before`. Hidden (cleared) rows are never returned.

**Who can call:** `researcher`, the thread's owner

**Frontend today:** `useAiThread.load` / `loadEarlier` →
`aiThreadApi.list` ([`aiThreadApi.ts`](../../src/api/aiThreadApi.ts)).

**Request**

```bash
curl "https://api.example.ac.th/v1/dmps/dmp-soil/ai-thread?limit=50" \
  -H "Authorization: Bearer <access_token>"
```

**Response**

A page of entries: `ThreadPage` in
[`threadServer.ts`](../../src/api/mock/threadServer.ts), entries as
`ThreadEntry` in [`aiThread.ts`](../../src/store/aiThread.ts).

**Parameters**

- `before` (string, optional)
  An entry id: return the page before it.
- `limit` (integer, optional)
  1 to 100, default 50.

**Returns** a page of entries and whether there are older ones.

**Error codes**

Only the common errors listed in [README](./README.md#errors).

### Update a thread entry

`PUT /v1/dmps/:scope/ai-thread/:entry_id`

Records the author's decision on a proposal: `accepted`, `rejected`, or
`stale` when accepting found the field had moved.

- Only a proposal's `status` (and `staleReason`) may change. The text, value
  and provenance of an AI entry are immutable.
- Accepting applies the change with [Update a draft](./dmps.md#update-a-draft)
  first, after re-checking that the field still holds what the proposal was
  made against (`guardBeforeApply`). An output's field is found by its
  `dataset_id`, not its position. Only then is the entry marked `accepted`.

**Who can call:** `researcher`, the thread's owner

**Frontend today:** `useChatStore.acceptProposal` / `rejectProposal` /
`acceptAll` → `useAiThread.updateEntry` → `aiThreadApi.update`.

**Request**

```bash
curl -X PUT https://api.example.ac.th/v1/dmps/dmp-soil/ai-thread/turn-81 \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "proposal_id": "p-2", "status": "accepted" }'
```

**Response**

The updated entry (`ThreadTurn`).

**Parameters**

- `proposal_id` (string, **required**)
- `status` (enum, **required**)
  `accepted`, `rejected` or `stale`.
- `stale_reason` (string, optional)

**Returns** the entry.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `proposal_settled` | The proposal was already decided. |

### Clear the chat

`POST /v1/dmps/:scope/ai-thread/clear`

Clears the conversation without destroying the plan's AI record
(preservation):

- **Hidden:** questions, answers, refusals, and proposals that weren't
  accepted (pending ones included; the app warns how many).
- **Kept with the plan, always:** every AI action event, and every accepted
  change, so a field never loses the trace of the AI having proposed it. A
  turn that mixed accepted and other proposals keeps only the accepted ones.
- Hidden rows get `hidden_at` and stay in the table; they're never returned.
- The rule is `keptOnClear` in
  [`threadRetention.ts`](../../src/store/threadRetention.ts); server and client
  apply the same function.

**Who can call:** `researcher`, the thread's owner

**Frontend today:** `useChatStore.clear` → `useAiThread.clear` →
`aiThreadApi.clear`, behind a confirmation.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/dmps/dmp-soil/ai-thread/clear \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{ "object": "ai_thread", "scope": "dmp-soil", "hidden": 12, "kept": 4 }
```

**Parameters** none.

**Returns** how many entries were hidden and kept.

**Error codes**

Only the common errors listed in [README](./README.md#errors).

### Adopt an unscoped thread

`POST /v1/ai-thread/adopt`

Moves a chat started before the plan had an id (`from: unscoped`) into the
plan it produced. A reply still in flight from the unscoped chat lands in the
plan.

**Who can call:** `researcher`, owner of both

**Frontend today:** `useAiThread.adopt(from, to)` → `aiThreadApi.adopt`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/ai-thread/adopt \
  -H "Authorization: Bearer <access_token>" \
  --json '{ "from": "unscoped", "to": "dmp-soil" }'
```

**Response**

```json
{ "object": "ai_thread", "scope": "dmp-soil", "moved": 3 }
```

**Parameters**

- `from` (string, **required**)
  `unscoped`.
- `to` (string, **required**)
  The plan's `dmp_id`.

**Returns** how many entries moved.

**Error codes**

Only the common errors listed in [README](./README.md#errors).
