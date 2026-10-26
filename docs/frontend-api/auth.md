# Authentication and profile

Signing in and out, keeping a session alive, signing up, and the signed-in
person's own profile.

## Tokens

Authentication is **JWT bearer**, with two tokens:

| Token | Lifetime | Where it lives | Sent as |
| --- | --- | --- | --- |
| Access token (JWT) | 15 minutes | In memory in the page, never in `localStorage` | `Authorization: Bearer <access_token>` on every request |
| Refresh token (opaque) | 14 days, rotated on every use | An `httpOnly`, `Secure`, `SameSite=Strict` cookie, path `/v1/auth` | Automatically, only to [Refresh a session](#refresh-a-session) and [Sign out](#sign-out) |

- The access token goes in the `Authorization` header, which is why AI
  streams are read with `fetch`, not `EventSource` (which can't set headers).
  See [Streaming](./ai.md#streaming).
- **Refresh flow.** When a request answers `401 token_expired`, the client
  calls Refresh a session once, then repeats the request with the new access
  token. If refreshing fails, the person is signed out. Concurrent requests
  wait on one shared refresh.
- **Rotation.** Each refresh returns a new refresh token and invalidates the
  old one. Presenting an old one again means it was stolen or replayed: the
  whole token family is revoked and the person signs in again.
- The access token carries `sub` (the user id) and `role`. The server still
  checks role and ownership on every request; the claim is never the only
  check.
- The lifetimes are **tunable defaults**, not fixed policy.

## Endpoints

| | |
| --- | --- |
| [Sign in](#sign-in) | `POST /v1/auth/sessions` |
| [Refresh a session](#refresh-a-session) | `POST /v1/auth/refresh` |
| [Sign out](#sign-out) | `DELETE /v1/auth/sessions/current` |
| [Retrieve the current user](#retrieve-the-current-user) | `GET /v1/users/me` |
| [Update the current user](#update-the-current-user) | `PATCH /v1/users/me` |
| [Register](#register) | `POST /v1/users` |
| [Check a username](#check-a-username) | `GET /v1/users/username-available` |

## The User object

```json
{
  "object": "user",
  "user_id": "user-2",
  "title": "Prof.",
  "name": "Mali",
  "surname": "Chaiyasit",
  "email": "mali@example.edu",
  "role": "committee",
  "username": "mali",
  "ai_token_limit": 4500,
  "ai_token_used": 0,
  "account_type": null,
  "phone": null,
  "orcid": null,
  "affiliation": null,
  "address": null
}
```

### Attributes

- `object` (string, value is `"user"`)
  The object's type.
- `user_id` (string, required)
  Unique id.
- `title` (string, nullable)
  Honorific, e.g. "Prof."
- `name` (string, required)
  First name.
- `surname` (string, required)
  Last name.
- `email` (string, required)
  Unique per account, ignoring case and spaces.
- `role` (enum, required)
  Committee endpoints need `committee` or `chief`.
  Possible enum values:
  - `admin`
  - `chief`
  - `committee`
  - `researcher`
- `username` (string, nullable)
  Sign-in name, set at sign-up.
- `ai_token_limit` (integer, required)
  AI budget; researchers only use it.
- `ai_token_used` (integer, required)
  AI budget used so far; researchers only use it.
- `account_type` (enum, nullable)
  Researchers only; `null` for committee and chief accounts.
  Possible enum values:
  - `institutional`: belongs to an organisation (มีสังกัด).
  - `citizen`: no affiliation (ไม่มีสังกัด).
- `phone` (string, nullable)
  Phone number.
- `orcid` (string, nullable)
  ORCID iD, the same format as a contributor's `orcid`.
- `affiliation` (object, nullable)
  Institutional researchers only.
  - `organization` (string, required)
    The organisation.
  - `department` (string, nullable)
    The department.
  - `position` (string, nullable)
    Their position.
- `address` (string, nullable)
  Citizen researchers only.

### Sign in

`POST /v1/auth/sessions`

Starts a session for a username and password: returns an access token and
sets the refresh-token cookie (see [Tokens](#tokens)). Committee, chief and
admin accounts are granted by the institution; only researchers
[sign up](#register).

**Who can call:** anyone with an account; no access token needed.

**Frontend today:** `useAuthStore.signIn(username, password)`

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/auth/sessions \
  --json '{
    "username": "mali",
    "password": "demo1234"
  }'
```

**Response**

```json
{
  "object": "session",
  "access_token": "eyJhbGciOi…",
  "token_type": "Bearer",
  "expires_at": "2026-10-23T09:15:00Z",
  "user": {
    "object": "user",
    "user_id": "user-2",
    "title": "Prof.",
    "name": "Mali",
    "surname": "Chaiyasit",
    "email": "mali@example.edu",
    "role": "committee",
    "username": "mali"
  }
}
```

**Parameters**

- `username` (string, **required**)
  The account's username. Matched case-insensitively.
- `password` (string, **required**)
  The account's password. Never stored or returned.

**Returns** a session object with the `access_token`, when it expires, and
the signed-in [User](#the-user-object). The refresh token is set as a cookie,
never returned in the body.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `parameter_missing` | `username` or `password` is empty. |
| 401 | `invalid_credentials` | Username or password is incorrect. The same code for both, so the response doesn't reveal which usernames exist. |

### Refresh a session

`POST /v1/auth/refresh`

Swaps the refresh-token cookie for a new access token and a new refresh token
(rotation, see [Tokens](#tokens)).

**Who can call:** anyone holding a valid refresh-token cookie; no access token
needed.

**Frontend today:** none. The session lives in the browser
(`useAuthStore.userId`), so nothing expires.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/auth/refresh \
  --cookie "refresh_token=rt_…"
```

**Response**

The same session object as [Sign in](#sign-in), with a new `access_token`; the
cookie is replaced.

**Parameters** none (the cookie carries the refresh token).

**Returns** a session object.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 401 | `refresh_token_invalid` | Missing, expired or revoked. Sign in again. |
| 401 | `refresh_token_reused` | An already-used refresh token was presented. The whole token family is revoked. |

### Sign out

`DELETE /v1/auth/sessions/current`

Ends the current session: revokes the refresh token and clears its cookie.
The access token is no longer refreshed and runs out within its 15 minutes.
The frontend then shows the public landing page.

**Who can call:** any signed-in user: `researcher`, `committee`, `chief`, `admin` (their own account)

**Frontend today:** `useAuthStore.logout()`

**Request**

```bash
curl -X DELETE https://api.example.ac.th/v1/auth/sessions/current \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{ "object": "session", "deleted": true }
```

**Parameters** none.

**Returns** a deletion confirmation.

**Error codes**

Only the common errors listed in [README](./README.md#errors).

### Retrieve the current user

`GET /v1/users/me`

Returns the signed-in user. The navbar, user menu, dashboard greeting and
Settings form read it.

**Who can call:** any signed-in user: `researcher`, `committee`, `chief`, `admin` (their own account)

**Frontend today:** `useCurrentUser()`

**Request**

```bash
curl https://api.example.ac.th/v1/users/me \
  -H "Authorization: Bearer <access_token>"
```

**Response**

```json
{
  "object": "user",
  "user_id": "user-2",
  "title": "Prof.",
  "name": "Mali",
  "surname": "Chaiyasit",
  "email": "mali@example.edu",
  "role": "committee",
  "username": "mali",
  "ai_token_limit": 4500,
  "ai_token_used": 0,
  "account_type": null,
  "phone": null,
  "orcid": null,
  "affiliation": null,
  "address": null
}
```

**Parameters** none.

**Returns** the signed-in [User](#the-user-object).

**Error codes**

Only the common errors listed in [README](./README.md#errors).

### Update the current user

`PATCH /v1/users/me`

Updates the signed-in user's profile from the **Settings** page. Role, username
and AI quota can't be changed here.

**Who can call:** any signed-in user: `researcher`, `committee`, `chief`, `admin` (their own account)

**Frontend today:** `useProjectStore.updateUser(user_id, patch)`, after
`userProfileSchema` validation and `isEmailTaken` check.

**Request**

```bash
curl -X PATCH https://api.example.ac.th/v1/users/me \
  -H "Authorization: Bearer <access_token>" \
  --json '{
    "title": "Prof.",
    "name": "Mali",
    "surname": "Chaiyasit",
    "email": "mali.c@example.edu"
  }'
```

**Response**

```json
{
  "object": "user",
  "user_id": "user-2",
  "title": "Prof.",
  "name": "Mali",
  "surname": "Chaiyasit",
  "email": "mali.c@example.edu",
  "role": "committee",
  "username": "mali",
  "ai_token_limit": 4500,
  "ai_token_used": 0,
  "account_type": null,
  "phone": null,
  "orcid": null,
  "affiliation": null,
  "address": null
}
```

**Parameters**

- `title` (string, optional)
  An honorific such as "Prof." An empty string clears it.
- `name` (string, optional)
  First name. Can't be empty.
- `surname` (string, optional)
  Last name. Can't be empty.
- `email` (string, optional)
  A valid email no other account uses, ignoring case and surrounding spaces.
  Accounts are matched to plan contributors by email, so it must be unique.

Every value is trimmed before it's checked (`userProfileSchema`).

**Returns** the updated [User](#the-user-object).

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `name_required` | `name` or `surname` was sent empty. |
| 400 | `email_invalid` | `email` isn't a valid address. |
| 409 | `email_taken` | Another account already uses this email. |

### Register

`POST /v1/users`

Creates a researcher account from the **Register** page and signs it in. The
rules are the ERD's
[Accounts and sign-up](../project-erd.md#accounts-and-sign-up):

- **Only researchers sign up.** The account's `role` is always `researcher`;
  committee, chief and admin accounts are granted by the institution. A body
  that names a role is refused.
- **Account type** (`institutional` or `citizen`) decides who approves the
  researcher's plans. Institutional researchers must name their organisation,
  and their new projects go to the committee. Citizen researchers have no
  affiliation, may give an address, and their new projects are independent.
- Usernames are unique (lowercased); emails are unique ignoring case and
  spaces.
- The password is never stored on the User and never returned. The server
  hashes it with a password-hashing function (argon2 or bcrypt); the
  browser's salted SHA-256 today is a stand-in, not production security.

**Who can call:** anyone; no access token needed.

**Frontend today:** `useAuthStore.register(form)`, after
`registrationSchema` validation.

**Request**

```bash
curl -X POST https://api.example.ac.th/v1/users \
  --json @registration.json
```

The body is the registration form as
[`registrationSchema`](../../src/schemas/user/registration.schema.ts) defines
it. The password confirmation is checked in the page and not sent.

**Response**

The same session object as [Sign in](#sign-in), for the new
[User](#the-user-object).

**Returns** a session object.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `field_invalid` | A field doesn't pass `registrationSchema`. `param` names it. |
| 400 | `role_not_allowed` | The body names a role. |
| 409 | `username_taken` | Another account uses this username. |
| 409 | `email_taken` | Another account uses this email. |

### Check a username

`GET /v1/users/username-available`

Whether a username is free, so the Register form can say so while it's
typed. Compared lowercased. A hint only: [Register](#register) checks again.
Rate-limited, because it reveals which usernames exist.

**Who can call:** anyone; no access token needed.

**Frontend today:** `useAuthStore.isUsernameTaken(username)`.

**Request**

```bash
curl "https://api.example.ac.th/v1/users/username-available?username=aran"
```

**Response**

```json
{ "object": "username_availability", "username": "aran", "available": false }
```

**Parameters**

- `username` (string, **required**)
  The username to check.

**Returns** whether it's available.

**Error codes**

| HTTP status code | Code | Description |
| --- | --- | --- |
| 400 | `parameter_missing` | No `username`. |
