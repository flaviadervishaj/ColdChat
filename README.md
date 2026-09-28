# ColdChat

A browser-based community chat with a public room and private conversations. The live application is at [coldchat.vercel.app](https://coldchat.vercel.app/).

## Features

- Public chat, private messages, replies, reactions, and pinned messages
- Profile settings, friends, voice messages, and media uploads
- Email and Google sign-in through Supabase Auth
- Moderation routes for managing the community
- Layouts for desktop and mobile

## Repository structure

| Path | Purpose |
| --- | --- |
| `index.html` | Chat page and local interface styling |
| `standalone-login.html` | Sign-in and account creation page |
| `api/native.js` | Serverless chat, profile, media, and moderation endpoints |
| `api/google.js` | Google sign-in callback and session handling |
| `api/reset-chat.js` | Public chat reset endpoint |
| `api/chat-shell.js` | Adapter for the hosted UI bundle |
| `api/proxy.js`, `vercel.json` | Upstream routing and deployment rewrites |

## Architecture and setup

Vercel serves the pages and Node.js serverless functions. The functions use Supabase Auth, PostgREST, and Storage. The interface also loads assets from an existing hosted UI service, so this repository is **not a self-contained build** of that interface. It relies on that service and on the existing Supabase database schema and RPC functions, which are not included here.

To run the Vercel routes in a development environment, install Node.js 18+ and the Vercel CLI, then run `vercel dev` in this directory. A working setup also needs the upstream UI service, the Supabase project, its database objects and storage bucket, and the relevant authentication redirect configuration. Do not use the production project for local experiments.

The Supabase key referenced in the serverless code is a **publishable** project key, not a service-role secret. Any future privileged credentials belong in deployment environment variables, never in this repository. Keep row-level security and RPC permissions aligned with the app's account and moderation rules.
