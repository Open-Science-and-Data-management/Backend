# Files

Files uploaded to a project: proposals, task deliverables, evidence. The
project's researcher uploads them and can archive or delete them; committee
members can list and download them, and can't upload or remove them. Admin
gets `403`.

A file used as a task's evidence is part of the record of work done, so it is
never hard-deleted: it can only be [archived](#archive-a-file), which keeps
it and every reference to it.

## Endpoints

| | |
| --- | --- |
| [List files](#list-files) | `GET /v1/files` |
| [Download a file](#download-a-file) | `GET /v1/files/:file_id/content` |
| [Upload a file](#upload-a-file) | `POST /v1/projects/:project_id/files` |
| [Archive a file](#archive-a-file) | `POST /v1/files/:file_id/archive` |
| [Delete a file](#delete-a-file) | `DELETE /v1/files/:file_id` |

## The File object

```json
{
  "object": "file",
  "file_id": "file-1",
  "project_id": "proj-1",
  "uploaded_by": "user-1",
  "filename": "pollinator-proposal.docx",
  "file_type": "docx",
  "purpose": "proposal",
  "metadata": { "byte_size": 184320, "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  "uploaded_at": "2026-08-01T02:05:00Z",
  "superseded_at": null
}
```

### Attributes

- `object` (string, value is `"file"`)
  The object's type.
- `file_id` (string, required)
  Unique id.
- `project_id` (string, required)
  The project the file belongs to.
- `uploaded_by` (string, required)
  The uploader's `user_id`.
- `filename` (string, required)
  The original filename.
- `file_type` (enum, required)
  Possible enum values:
  - `docx`
  - `pdf`
  - `other`
- `purpose` (enum, required)
  Possible enum values:
  - `proposal`
  - `task_deliverable`
  - `evidence`
- `metadata` (object, nullable)
  About the file's content.
  - `byte_size` (integer, nullable)
    Size in bytes.
  - `mime_type` (string, nullable)
    The content's MIME type.
- `uploaded_at` (date-time, required)
  When the file was uploaded.
- `superseded_at` (date-time, nullable)
  Set when a newer proposal replaced it.
- `archived_at` (date-time, nullable)
  When the file was [archived](#archive-a-file): out of the project's list,
  still kept and still reachable from any task that uses it as evidence.

### List files

`GET /v1/files`

Lists a project's files for the **Files** section, current files first and
superseded proposals after.

**Who can call:** `committee`, `chief`; `researcher` for files of projects they belong to

**Frontend today:** `useProjectStore.files.filter(...)` in `FileList` with
`readOnly`.

**Request**

```bash
curl "https://api.example.ac.th/v1/files?project_id=proj-1" \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{
  "object": "list",
  "data": [
    {
      "object": "file",
      "file_id": "file-1",
      "project_id": "proj-1",
      "uploaded_by": "user-1",
      "filename": "pollinator-proposal.docx",
      "file_type": "docx",
      "purpose": "proposal",
      "metadata": { "byte_size": 184320, "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      "uploaded_at": "2026-08-01T02:05:00Z",
      "superseded_at": null
    }
  ],
  "has_more": false,
  "total_count": 2
}
```

**Parameters**

- `project_id` (string, **required**)
  The project whose files to list.
- `purpose` (enum, optional)
  Possible enum values:
  - `proposal`
  - `task_deliverable`
  - `evidence`

**Returns** a list of [Files](#the-file-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `project_id_required` | `project_id` wasn't sent. |
| 400 | `invalid_purpose` | `purpose` holds a value other than the three above. |

### Download a file

`GET /v1/files/:file_id/content`

Returns the file's bytes, with `Content-Disposition: attachment` and its
original filename.

**Who can call:** `committee`, `chief`; `researcher` for files of projects they belong to

**Frontend today:** `fileApi.getDownloadUrl(file_id)`. It only works for files
uploaded in the current browser session; this endpoint removes that limit.

**Request**

```bash
curl -L -O -J https://api.example.ac.th/v1/files/file-1/content \
  -H "Authorization: Bearer <access_token>"
```

**Response** the file, as `application/octet-stream` or its `mime_type`.

**Parameters** none.

**Returns** the file's content.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 404 | `file_not_found` | No file with that id. |
| 410 | `file_content_gone` | The record exists but its content is no longer stored. |

### Upload a file

`POST /v1/projects/:project_id/files`

Uploads a file to one of the researcher's projects, as `multipart/form-data`.

- `purpose` is `proposal`, `task_deliverable` or `evidence`.
- **Limits, checked by the server:** at most **20 MB**. A `proposal` must be
  a `.docx` file, checked by its MIME type
  (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
  and not only its name. The page applies the same limits before uploading;
  the server doesn't rely on that.
- A `proposal` becomes the project's active proposal (`proposal_file_id`).
  Earlier proposals stay in the list.
- An `evidence` file is attached to a task afterwards with
  [Set evidence](./tasks.md#set-evidence). Evidence can also be an external
  link or DOI, with no upload at all.
- Whether a proposal can actually be read is found out when it's analysed:
  [Analyze a proposal](./ai.md#analyze-a-proposal) returns `422` and creates
  no plan if it can't be parsed.

**Who can call:** `researcher`, a member of the project

**Frontend today:** `useProjectStore.uploadFile({ file, projectId, purpose })`
from Upload, the Project page's file list and `TaskEvidence`; the 20 MB and
`.docx` checks are in `FileDropzone`.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/projects/proj-1/files \
  -H "Authorization: Bearer <access_token>" \
  -F purpose=proposal \
  -F file=@proposal.docx
```

**Response**

The new [File](#the-file-object), as
[`file.schema.ts`](../../src/schemas/file/file.schema.ts) defines it.

**Parameters**

- `file` (file, **required**)
  The file itself.
- `purpose` (enum, **required**)
  `proposal`, `task_deliverable` or `evidence`.

**Returns** the [File](#the-file-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `file_type_not_allowed` | A proposal that isn't a `.docx` file, by MIME type. |
| 413 | `file_too_large` | Over 20 MB. |

### Archive a file

`POST /v1/files/:file_id/archive`

Takes a file out of the project's file list without destroying it. The file,
its metadata and every reference to it stay: a task whose evidence it is
still shows and downloads it. This is the only way to remove a file that is
used as evidence.

**Who can call:** `researcher`, a member of the file's project

**Frontend today:** none. Files are deleted outright today (see
[Delete a file](#delete-a-file)).

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/files/file-31/archive \
  -H "Authorization: Bearer <access_token>"
```

**Response**

The [File](#the-file-object) with `archived_at` set.

**Parameters** none.

**Returns** the [File](#the-file-object).

**Error codes**

Only the common errors listed in [README](./README.md#errors).

### Delete a file

`DELETE /v1/files/:file_id`

Removes a file for good. **Refused for a file that a task uses as evidence**
(`409 file_in_use`): that file is part of the record of work done, and is
[archived](#archive-a-file) instead. Deleting the project's proposal clears
`proposal_file_id`.

**Who can call:** `researcher`, a member of the file's project

**Frontend today:** `useProjectStore.removeFile(fileId)` from the Project page,
after a confirmation. It deletes regardless of evidence today, and the
confirmation says "anything referencing it loses this attachment"; that's a
frontend change to make.

**Request**

```bash
curl -X DELETE https://api.example.ac.th/v1/files/file-31 \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{ "object": "file", "file_id": "file-31", "deleted": true }
```

**Parameters** none.

**Returns** a deletion confirmation.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 409 | `file_in_use` | A task uses this file as evidence. Archive it instead. |
