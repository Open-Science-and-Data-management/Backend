# Notifications

The signed-in user's notifications. Committee members mostly receive
`review_requested`, sent to every reviewer when a plan or revision is
submitted. Researchers receive what happens to their plans and tasks
(`dmp_submitted`, `dmp_approved`, `dmp_returned`, `dmp_finalized`,
`tasks_cancelled`, and the rest of `NotificationType`). Each user only ever
sees their own.

## Delivery

Notifications are **polled**: the page calls
[List notifications](#list-notifications) while it's open (every 60 seconds
by default, and again when the tab regains focus) and reads `unread_count`
for the sidebar badge. There is no push, WebSocket or server-sent events:
the backend raises notifications on an in-process event bus with no Redis, so
there is nothing to push from. The interval is a tunable default.

## Endpoints

| | |
| --- | --- |
| [List notifications](#list-notifications) | `GET /v1/notifications` |
| [Mark a notification read](#mark-a-notification-read) | `POST /v1/notifications/:notification_id/read` |
| [Mark all notifications read](#mark-all-notifications-read) | `POST /v1/notifications/read_all` |
| [Delete a notification](#delete-a-notification) | `DELETE /v1/notifications/:notification_id` |
| [Delete all notifications](#delete-all-notifications) | `DELETE /v1/notifications` |

## The Notification object

```json
{
  "object": "notification",
  "notification_id": "ntf-review-soil",
  "user_id": "user-2",
  "type": "review_requested",
  "title": "New plan to review",
  "message": "Soil Microbiome Survey DMP was submitted for approval.",
  "link": "/review/dmp-soil",
  "dmp_id": "dmp-soil",
  "project_id": "proj-3",
  "read_at": null,
  "created_at": "2026-10-20T03:12:00Z"
}
```

### Attributes

- `object` (string, value is `"notification"`)
  The object's type.
- `notification_id` (string, required)
  Unique id.
- `user_id` (string, required)
  The recipient.
- `type` (enum, required)
  Possible enum values:
  - `dmp_submitted`
  - `dmp_approved`: to the researcher when a version is approved.
  - `dmp_finalized`
  - `tasks_generated`
  - `tasks_cancelled`: to the researcher when an approval cancels tasks of a removed output.
  - `proposal_superseded`
  - `review_requested`: to every `committee` and `chief` user when a plan or revision is submitted.
  - `dmp_returned`: to the researcher when a version is sent back.
- `title` (string, required)
  The notification's heading.
- `message` (string, nullable)
  The body text.
- `link` (string, nullable)
  The frontend route to open, e.g. `/review/dmp-soil`.
- `dmp_id` (string, nullable)
  The plan it refers to.
- `project_id` (string, nullable)
  The project it refers to.
- `read_at` (date-time, nullable)
  When it was read; `null` while unread.
- `created_at` (date-time, required)
  When it was sent.

### List notifications

`GET /v1/notifications`

Lists the signed-in user's notifications, newest first, for the
**Notifications** page and the sidebar's unread badge.

**Who can call:** `researcher`, `committee`, `chief` (their own notifications)

**Frontend today:** `useNotificationStore.notifications` filtered to the
signed-in `user_id`.

**Request**

```bash
curl "https://api.example.ac.th/v1/notifications?limit=50" \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{
  "object": "list",
  "data": [
    {
      "object": "notification",
      "notification_id": "ntf-review-soil",
      "user_id": "user-2",
      "type": "review_requested",
      "title": "New plan to review",
      "message": "Soil Microbiome Survey DMP was submitted for approval.",
      "link": "/review/dmp-soil",
      "dmp_id": "dmp-soil",
      "project_id": "proj-3",
      "read_at": null,
      "created_at": "2026-10-20T03:12:00Z"
    }
  ],
  "has_more": false,
  "total_count": 1,
  "unread_count": 1
}
```

**Parameters**

- `unread` (boolean, optional)
  `true` for unread notifications only.
- `limit` (integer, optional)
  As in [README](./README.md#lists-and-pagination).
- `starting_after` (string, optional)
  As in [README](./README.md#lists-and-pagination).

**Returns** a list of [Notifications](#the-notification-object), plus
`unread_count` for the sidebar badge.

**Error codes**

Only the common errors listed in [README](./README.md#errors).

### Mark a notification read

`POST /v1/notifications/:notification_id/read`

Marks one notification read. The page calls it when a notification is opened,
then follows its `link`.

**Who can call:** `researcher`, `committee`, `chief` (their own notifications)

**Frontend today:** `useNotificationStore.markRead(id)`

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/notifications/ntf-review-soil/read \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{
  "object": "notification",
  "notification_id": "ntf-review-soil",
  "user_id": "user-2",
  "type": "review_requested",
  "title": "New plan to review",
  "message": "Soil Microbiome Survey DMP was submitted for approval.",
  "link": "/review/dmp-soil",
  "dmp_id": "dmp-soil",
  "project_id": "proj-3",
  "read_at": "2026-10-22T08:30:00Z",
  "created_at": "2026-10-20T03:12:00Z"
}
```

Already-read notifications are returned unchanged.

**Parameters** none.

**Returns** the [Notification](#the-notification-object) with `read_at` set.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 404 | `notification_not_found` | No notification with that id for this user. |

### Mark all notifications read

`POST /v1/notifications/read_all`

Marks every unread notification of the signed-in user read (**Mark all read**).

**Who can call:** `researcher`, `committee`, `chief` (their own notifications)

**Frontend today:** `useNotificationStore.markAllRead(user_id)`

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/notifications/read_all \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{ "object": "notification_batch", "updated": 3 }
```

**Parameters** none.

**Returns** how many notifications were marked read.

**Error codes**

Only the common errors listed in [README](./README.md#errors).

### Delete a notification

`DELETE /v1/notifications/:notification_id`

Dismisses one notification (the **×** on a row).

**Who can call:** `researcher`, `committee`, `chief` (their own notifications)

**Frontend today:** `useNotificationStore.remove(id)`

**Request**

```bash
curl -X DELETE https://api.example.ac.th/v1/notifications/ntf-review-soil \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{ "object": "notification", "notification_id": "ntf-review-soil", "deleted": true }
```

**Parameters** none.

**Returns** a deletion confirmation.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 404 | `notification_not_found` | No notification with that id for this user. |

### Delete all notifications

`DELETE /v1/notifications`

Removes all of the signed-in user's notifications (**Clear all**, after a
confirmation). Other users' notifications are untouched.

**Who can call:** `researcher`, `committee`, `chief` (their own notifications)

**Frontend today:** `useNotificationStore.clearAll(user_id)`

**Request**

```bash
curl -X DELETE https://api.example.ac.th/v1/notifications \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{ "object": "notification_batch", "deleted": 4 }
```

**Parameters** none.

**Returns** how many notifications were deleted.

**Error codes**

Only the common errors listed in [README](./README.md#errors).
