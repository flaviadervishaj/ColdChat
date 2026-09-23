# ColdChat

ColdChat is a full-stack community messaging application built around a public conversation space and private friend-to-friend messaging. It combines a responsive, dependency-free frontend with Vercel Functions and Supabase Auth, Postgres and Storage.

## Highlights

- Public chat with replies, reactions, pinned messages, stickers and voice notes
- Email/password and Google authentication with server-managed HTTP-only cookies
- User profiles, avatars, presence and friend requests
- Private conversations restricted to accepted friends
- Owner and moderator tools for timeouts, bans, roles and message management
- Responsive interface with accessible controls and reduced-motion support
- Row Level Security-compatible data access through authenticated Supabase requests

## Architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Client | HTML, CSS, JavaScript | Responsive chat interface and browser media capture |
| API | Vercel Functions, Node.js | Session handling, validation and application endpoints |
| Auth | Supabase Auth | Email/password and Google OAuth identities |
| Data | Supabase Postgres | Profiles, messages, friendships, presence and moderation records |
| Media | Supabase Storage | Avatars, stickers and voice messages |

The browser talks only to the application endpoints. Access and refresh tokens are stored in HTTP-only cookies and validated with Supabase before protected operations.

## Local setup

Requirements: Node.js 20 or newer, a Supabase project with the ColdChat schema, and the Vercel CLI.

1. Copy `.env.example` to `.env.local`.
2. Add the Supabase project URL and publishable key.
3. Set `APP_URL` to the local URL used by Vercel.
4. Start the development server with `vercel dev`.

```bash
cp .env.example .env.local
npm test
npm run check
vercel dev
```

The existing database is expected to expose the `profiles`, `messages`, `reactions`, `stickers`, `friendships`, `direct_messages`, `presence` and `bans` tables, the `coldchat-media` bucket, and these RPC functions:

- `coldchat_friend_action`
- `coldchat_moderate`
- `coldchat_toggle_pin`
- `coldchat_delete_message`
- `coldchat_reset_public_chat`

Database permissions and Row Level Security policies remain the source of truth. Never use a Supabase secret or `service_role` key in this application.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Browser-safe project key used by the server functions |
| `APP_URL` | Canonical application origin used for OAuth redirects |

For Google sign-in, add `${APP_URL}/login` to the allowed redirect URLs in Supabase Auth and configure the Google provider there.

## Quality checks

```bash
npm test
npm run check
```

Tests cover shared validation rules, while the check command validates every client and server JavaScript entry point.

## License

MIT © 2026 Flavia Dervishaj
