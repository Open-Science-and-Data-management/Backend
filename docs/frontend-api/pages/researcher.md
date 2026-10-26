# Researcher pages

Every page a researcher uses, how many inputs each one asks them to fill, and
the endpoints behind it. Conventions, roles and common errors are in the
[README](../README.md).

The researcher side does nearly all the writing in the app: plans, outputs,
people, tasks, evidence, projects, files. A researcher works on **their own**
plans, the ones they created (see
[Who works on a plan](../dmps.md#who-works-on-a-plan)); another researcher's
plan answers `404`.

## Pages and inputs

What a researcher fills in on each page, and which endpoints the page calls.

| Page | Route | Inputs to fill | Endpoints |
| --- | --- | --- | --- |
| Register | `/register` | **12 to 14**, depending on account type | [Register](../auth.md#register), [Check a username](../auth.md#check-a-username) |
| Sign in | `/login` | **2**: username, password | [Sign in](../auth.md#sign-in) |
| Dashboard | `/` | **0** | [List plans](../dmps.md#list-plans), [List tasks](../tasks.md#list-tasks), [List projects](../projects.md#list-projects) |
| Upload | `/upload` | **2**: project, proposal file (`.docx`, up to 20 MB); then **1 per coverage gap** | [Create a project](../projects.md#create-a-project) (from the picker), [Upload a file](../files.md#upload-a-file), [Analyze a proposal](../ai.md#analyze-a-proposal), [Update a draft](../dmps.md#update-a-draft) (gap answers), [Create a plan](../dmps.md#create-a-plan) (start without a proposal) |
| Plan editor: General | `/dmp/create?section=general`, `/dmp/:id/edit` | **7** | [Retrieve a plan](../dmps.md#retrieve-a-plan) (`include=draft`), [Update a draft](../dmps.md#update-a-draft) |
| Plan editor: Research outputs | `?section=dataset` | **about 17 per output**, plus 2 for a custom classification scheme and the domain profile's own fields | [Update a draft](../dmps.md#update-a-draft) |
| Plan editor: People & cost | `?section=people` | **8 per contributor**, **4 per cost item** | [Update a draft](../dmps.md#update-a-draft) |
| Plan editor: Ethical | `?section=ethical` | **2 to 4**: ethical issues (yes/no), description and report link when yes, Indigenous considerations | [Update a draft](../dmps.md#update-a-draft) |
| Plan editor: System info | `?section=system` | **0** (the schema version is shown, locked) | none |
| Plan editor: changes panel | in the editor, once a version is in force | **0** | [Save minor edits](../dmps.md#save-minor-edits), [Submit a revision](../dmps.md#submit-a-revision) (institutional), [Finalize a plan](../dmps.md#finalize-a-plan) (independent), [Restore a version](../dmps.md#restore-a-version) |
| Plan editor: leaving | Cancel in the editor | **0** | [Discard draft edits](../dmps.md#discard-draft-edits), [Archive a plan](../dmps.md#archive-a-plan) |
| AI assistant panel | in the editor | Chat: **1** message. Improve: **3** (source, fields, direction). Regenerate: **1** optional instruction | Every endpoint in [AI](../ai.md) |
| Review & submit | `/dmp/review` | **0** | [Submit for approval](../dmps.md#submit-for-approval) (institutional), [Finalize a plan](../dmps.md#finalize-a-plan) (independent) |
| Status | `/dmp/status` | **0**; generating again asks **2** (direction, only outputs without tasks) | [Retrieve a plan](../dmps.md#retrieve-a-plan) (`include=versions`), [Restore a version](../dmps.md#restore-a-version) (version history), [Generate tasks](../ai.md#generate-tasks), [Create generated tasks](../tasks.md#create-generated-tasks), [List reopen offers](../tasks.md#list-reopen-offers), [Accept a reopen offer](../tasks.md#accept-a-reopen-offer), [Dismiss a reopen offer](../tasks.md#dismiss-a-reopen-offer) |
| Tasks | `/tasks` | Task form **7**; checklist **1 per step**; evidence **1** (a file, or a link or DOI); redraft **1** (direction) | [List tasks](../tasks.md#list-tasks), [Create a task](../tasks.md#create-a-task), [Update a task](../tasks.md#update-a-task), [Complete a task](../tasks.md#complete-a-task), [Reopen a task](../tasks.md#reopen-a-task), [Cancel a task](../tasks.md#cancel-a-task), [Delete a task](../tasks.md#delete-a-task), checklist ([add](../tasks.md#add-a-checklist-step), [update](../tasks.md#update-a-checklist-step), [delete](../tasks.md#delete-a-checklist-step), [replace](../tasks.md#replace-the-checklist)), evidence ([set](../tasks.md#set-evidence), [clear](../tasks.md#clear-evidence)), [Upload a file](../files.md#upload-a-file), [Draft a task checklist](../ai.md#draft-a-task-checklist) |
| My DMPs | `/dmps` | **0** (search, status, project and sort are query parameters) | [List plans](../dmps.md#list-plans), [Archive a plan](../dmps.md#archive-a-plan), [Unarchive a plan](../dmps.md#unarchive-a-plan) |
| Projects | `/projects` | **2** to create one: name, description | [List projects](../projects.md#list-projects), [Create a project](../projects.md#create-a-project) |
| Project | `/projects/:projectId` | **1** file per upload | [Retrieve a project](../projects.md#retrieve-a-project), [List project members](../projects.md#list-project-members), [List plans](../dmps.md#list-plans), [List tasks](../tasks.md#list-tasks), [List files](../files.md#list-files), [Upload a file](../files.md#upload-a-file), [Download a file](../files.md#download-a-file), [Archive a file](../files.md#archive-a-file), [Delete a file](../files.md#delete-a-file) |
| Notifications | `/notifications` | **0** | [List](../notifications.md#list-notifications), [mark read](../notifications.md#mark-a-notification-read), [mark all read](../notifications.md#mark-all-notifications-read), [delete](../notifications.md#delete-a-notification), [delete all](../notifications.md#delete-all-notifications) |
| Settings | `/settings` | **4**: title, name, surname, email | [Retrieve the current user](../auth.md#retrieve-the-current-user), [Update the current user](../auth.md#update-the-current-user) |
| Help & Guide | `/help` | **0** | none |
| Header | every page | **0** | [Retrieve the AI quota](../ai.md#retrieve-the-ai-quota) (tokens left this month) |
| Sidebar | every page | **0** | [List notifications](../notifications.md#list-notifications) (`unread_count`, polled; see [Delivery](../notifications.md#delivery)) |
| User menu | every page | **0** | [Sign out](../auth.md#sign-out); [Refresh a session](../auth.md#refresh-a-session) runs in the background |

Settings also has a theme choice and an email-notification switch; both are
device preferences stored in the browser and call no endpoint.

### Inputs in detail

Each input's type, whether it's required and its format come from the schema
named here, which is the source of truth. This table says where to look, and
what the schema doesn't hold.

| Page | Inputs | Schema | Not in the schema |
| --- | --- | --- | --- |
| Register | account type, title, first name, last name, email, phone, ORCID iD, organisation, faculty/department, position, address, username, password, re-enter password | [`registrationSchema`](../../../src/schemas/user/registration.schema.ts) | Organisation is required for `institutional`; address is offered only to `citizen`. Username and email uniqueness are checked by the server. |
| Sign in | username, password | none | Wrong username and wrong password give the same error. |
| Upload | project, proposal file, gap answers | [`file.schema.ts`](../../../src/schemas/file/file.schema.ts) | `.docx` only and at most 20 MB, checked again by the server. Gap answers are draft fields, each validated as its field in the plan. |
| General | title, description, language, alternate identifier + type, begin date, end date | [`dmpDraftSchema`](../../../src/schemas/dmp/dmp.schema.ts) | Begin and end are calendar dates (`date`); see the ERD's [Calendar dates](../../project-erd.md#calendar-dates). |
| Research outputs | type, domain, title, description, keywords, access, personal data, sensitive data, personal data plan, protection level, security classification (+ scheme name and level when custom), repository, retention period, format, DOI requested, preservation statement, domain fields | [`dataset.schema.ts`](../../../src/schemas/dataset/dataset.schema.ts), [`domain-profiles.ts`](../../../src/schemas/dataset/domain-profiles.ts) | Switching domain clears the fields the new profile has no place for, after confirming. |
| People & cost | per contributor: title, name, surname, role, ORCID, email, contact, linked account; per cost: title, description, value, currency | [`contributor.schema.ts`](../../../src/schemas/contributor/contributor.schema.ts), [`cost.schema.ts`](../../../src/schemas/contributor/cost.schema.ts) | Exactly one contact, with an email. One account links to at most one contributor per plan; the form suggests the account whose email matches but never links on its own. Once a plan is in force, any contributor change is major. |
| Ethical | ethical issues, description, report URL, Indigenous considerations | [`dmpDraftSchema`](../../../src/schemas/dmp/dmp.schema.ts) | A description is required when issues exist. Indigenous considerations get no AI help at all. |
| Tasks | title, details, priority, lifecycle stage, output, start date, end date; checklist steps; evidence | [`taskSchema.ts`](../../../src/schemas/task/taskSchema.ts) | Closing a task may need evidence, depending on its stage ([`task-evidence.ts`](../../../src/config/task-evidence.ts)). A finished task's evidence can't change until it's reopened. |
| Projects | name, description | [`project.schema.ts`](../../../src/schemas/project/project.schema.ts) | Plan mode comes from the researcher's account type, not the form. |
| Settings | title, name, surname, email | [`user.schema.ts`](../../../src/schemas/user/user.schema.ts) | Email must be unique, ignoring case and spaces. |
