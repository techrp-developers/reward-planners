# Company chat backend

All REST endpoints require the existing customer access token as `Authorization: Bearer <token>`.
Every user lookup and membership change is restricted to the authenticated customer's company.

## Setup

Run `migrations/20260929_01_create_chat.sql` against the application database, then restart the Node server.

## REST API (`/v1/chat`)

- `GET /users?search=` — list active coworkers available to chat.
- `GET /presence?user_ids=2,3` — online state and persisted `last_seen_at` for coworkers.
- `POST /uploads/images` — multipart upload with field `image` (JPG/PNG/WebP/GIF, maximum 10 MB). Returns attachment metadata for sending an image message.
- `POST /uploads/documents` — multipart upload with field `document` (PDF, Word, Excel, PowerPoint, TXT, or CSV; maximum 25 MB).
- `GET /conversations` — inbox with members, last message, and unread count.
- `POST /conversations` — create/reopen a conversation. Body: `{ "type": "direct", "member_ids": [2] }` or `{ "type": "group", "name": "Team", "member_ids": [2,3] }`.
- `GET /conversations/:id/messages?before_id=&limit=30` — cursor-paginated history.
- `POST /conversations/:id/messages` — send a text/image/file message.
- `POST /conversations/:id/polls` — create a poll with `question`, 2-10 `options`, optional `allow_multiple`, and optional future `closes_at`.
- `POST /polls/:pollId/votes` — create or change a vote with `{ "option_ids": [1] }`.
- `POST /conversations/:id/read` — body: `{ "message_id": 123 }`.
- `PATCH /conversations/:id` — group admin updates `name` and/or `description`.
- `POST /conversations/:id/members` — group admin body: `{ "member_ids": [4,5] }`.
- `DELETE /conversations/:id/members/:userId` — group admin removes a member.
- `POST /conversations/:id/leave` — leave a conversation.

Messages may include `client_message_id` for idempotent retries, `reply_to_message_id`, and attachment metadata. File upload/storage is intentionally separate; pass the resulting URL in `attachment_url`.

Message history includes `read_by` and `is_read`. A direct-message UI can render `is_read: true` as blue double ticks. In groups, `read_by` identifies every active member who has read through that message.

## WebSocket (`/ws/chat`)

Connect using `ws(s)://host/ws/chat?token=<access-token>`. Browser clients may use the query parameter; non-browser clients can instead send the Bearer authorization header.

Client events:

```json
{"type":"message:send","conversation_id":1,"client_message_id":"uuid","message_type":"text","body":"Hello"}
{"type":"message:read","conversation_id":1,"message_id":123}
{"type":"typing:start","conversation_id":1}
{"type":"typing:stop","conversation_id":1}
```

Server events are `connected`, `conversation:available`, `message:new`, `message:read`, `poll:updated`, `typing:start`, `typing:stop`, `presence`, and `error`. `connected` contains the company's currently online user IDs; subsequent `presence` events update online/offline state and include `last_seen_at` when a user goes offline. The server uses ping/pong heartbeats and supports multiple devices per user.
