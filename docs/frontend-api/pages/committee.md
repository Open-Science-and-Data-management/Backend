# Committee pages

Every page a committee member uses, how many inputs each one asks them to
fill, and the endpoints behind it. Conventions, roles and common errors are in
the [README](../README.md).

## Pages and inputs

What a committee member fills in on each page, and which endpoints the page
calls. Everything else on the committee side is read-only.

| Page | Route | Inputs to fill | Endpoints |
| --- | --- | --- | --- |
| Sign in | `/login` | **2**: username, password | [Sign in](../auth.md#sign-in) |
| Dashboard | `/` | **0** | [List reviews](../reviews.md#list-reviews) (pending, and decided by me), [List projects](../projects.md#list-projects) |
| Review queue | `/review` | **0** | [List reviews](../reviews.md#list-reviews) (pending, and recently decided) |
| Review | `/review/:dmpId` | **2**: position, comments | [Retrieve a plan](../dmps.md#retrieve-a-plan), [Approve a version](../dmps.md#approve-a-version), [Reject a version](../dmps.md#reject-a-version) |
| Projects | `/projects` | **0** | [List projects](../projects.md#list-projects) |
| Project | `/projects/:projectId` | **0** | [Retrieve a project](../projects.md#retrieve-a-project), [List project members](../projects.md#list-project-members), [List plans](../dmps.md#list-plans) (with `include=versions`), [List tasks](../tasks.md#list-tasks), [List files](../files.md#list-files), [Download a file](../files.md#download-a-file) |
| Notifications | `/notifications` | **0** | [List](../notifications.md#list-notifications), [mark read](../notifications.md#mark-a-notification-read), [mark all read](../notifications.md#mark-all-notifications-read), [delete](../notifications.md#delete-a-notification), [delete all](../notifications.md#delete-all-notifications) |
| Settings | `/settings` | **4**: title, name, surname, email | [Retrieve the current user](../auth.md#retrieve-the-current-user), [Update the current user](../auth.md#update-the-current-user) |
| Help & Guide | `/help` | **0** | none |
| Sidebar | every page | **0** | [List reviews](../reviews.md#list-reviews) (`status=pending`, Review queue badge), [List notifications](../notifications.md#list-notifications) (`unread_count`, Notifications badge) |
| User menu | every page | **0** | [Sign out](../auth.md#sign-out) |

**8 inputs in total**, on three pages. Settings also has a theme choice and an
email-notification switch; both are device preferences stored in the browser
and call no endpoint.

### Inputs in detail

| Page | Input | Type | Required | Rules |
| --- | --- | --- | --- | --- |
| Sign in | `username` | text | yes | Matched case-insensitively. |
| Sign in | `password` | password | yes | Wrong username and wrong password give the same error. |
| Review | `position` | text | yes | Defaults to "Committee member". Recorded on the decision and named in maDMP exports. |
| Review | `note` (Comments for the researcher) | textarea | for **Reject** only | Optional when approving; sent to the researcher either way. |
| Settings | `title` | text | no | e.g. "Prof." |
| Settings | `name` | text | yes | |
| Settings | `surname` | text | yes | |
| Settings | `email` | email | yes | Must be a valid address that no other account uses (case and spaces ignored). |
