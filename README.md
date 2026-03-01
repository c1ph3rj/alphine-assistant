# Alphine

Alphine is a secure AI chat workspace built with React + TypeScript + Vite + Tailwind + Appwrite.

It is designed around two priorities:

- Secure access by default (email verification, MFA, and OAuth support)
- Productive AI workflows (persistent chats, rich attachments, and configurable providers)

Alphine stores chat sessions, attachments, and user preferences in Appwrite so users can resume work across sessions and devices with minimal setup.

## Screenshots

### Authentication and onboarding

![Sign-in screen on desktop](public/Screenshot%202026-03-01%20225948.png)
_Desktop sign-in with email/password and Google OAuth._

![Sign-in screen on mobile](public/Screenshot%202026-03-01%20230013.png)
_Mobile-optimized sign-in flow._

![Landing page and onboarding](public/Screenshot%202026-03-01%20225932.png)
_Landing experience with guided onboarding steps and theme controls._

### Chat workspace

![Desktop chat workspace](public/Screenshot%202026-03-01%20225852.png)
_Conversation workspace with history, search, and quick input._

![Desktop chat with attachment](public/Screenshot%202026-03-01%20225834.png)
_Conversation with file attachment context in the message thread._

![Mobile chat start screen](public/Screenshot%202026-03-01%20225706.png)
_Mobile chat start state._

![Mobile conversation](public/Screenshot%202026-03-01%20225753.png)
_Mobile conversation view while the assistant is responding._

### Settings and profile

![Desktop profile settings](public/Screenshot%202026-03-01%20225440.png)
_Profile editor with avatar upload and public identity fields._

![Desktop workspace preferences](public/Screenshot%202026-03-01%20225553.png)
_Workspace preferences for theme, density, and message behavior._

![Mobile profile settings](public/Screenshot%202026-03-01%20225645.png)
_Responsive settings screen on mobile._

This project is **vibecoded**.

## What this app includes

- Email/password authentication
- Google OAuth sign-in
- Mandatory email verification flow
- Mandatory MFA (TOTP authenticator app) flow
- Persistent chat sessions and messages in Appwrite TablesDB
- File attachments (image, video, PDF, markdown, Word, Excel)
- User settings and profile metadata stored in Appwrite user prefs
- AI provider integration:
  - OpenRouter
  - Google Generative AI

## Tech stack

- React 19
- TypeScript
- Vite 7
- Tailwind CSS 4
- Appwrite Web SDK (`appwrite`)
- React Router 7

## Prerequisites

1. Node.js 20+ (Node 22 LTS recommended)
2. npm (comes with Node)
3. An Appwrite project (Cloud or self-hosted)
4. At least one AI provider key (OpenRouter or Google Generative AI)

## 1) Clone and install

```bash
git clone <your-repo-url>
cd alphine
npm install
```

## 2) Appwrite setup (required)

This app will not run correctly until Appwrite is configured.

### 2.1 Create project and web platform

1. Create an Appwrite project.
2. Add a **Web platform**.
3. Add allowed host(s), for example:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - your LAN URL if using `npm run dev:network` (example: `http://192.168.0.108:5173`)

### 2.2 Auth configuration

Enable and configure:

1. **Email/password auth**
2. **Email verification links**
3. **MFA with TOTP authenticator**
4. **Google OAuth provider** (optional but used by the UI)

OAuth callback URLs to configure:

- Success callback: `<YOUR_APP_BASE_URL>/oauth-callback`
- Failure callback: `<YOUR_APP_BASE_URL>/login?oauth=failed`

Recovery/verification URLs used by the app:

- Email verify URL: `<YOUR_APP_BASE_URL>/verify-email`
- Reset password URL: `<YOUR_APP_BASE_URL>/reset-password`

### 2.3 Create chat database and tables

Create one database (ID becomes `VITE_APPWRITE_CHAT_DATABASE_ID`) with these three tables.

Notes:

- Attribute names must match exactly.
- Field lengths below are recommended safe sizes.
- App code filters by `userId` and also checks ownership in service logic.

Table permissions (minimum working setup):

- Allow authenticated users (`users`) to `read`, `create`, `update`, and `delete` rows on all three tables.
- If your Appwrite version supports row-level permissions and you want stricter data isolation, keep this app logic but also enforce row-level policies in your backend design.

#### Table: chat sessions

Table ID -> `VITE_APPWRITE_CHAT_SESSIONS_TABLE_ID`

Required columns:

- `title` -> string (recommended max 256)
- `titleLocked` -> boolean
- `contextSummary` -> string (recommended max 2000)
- `summaryUpdatedAt` -> datetime (nullable)
- `lastSnippet` -> string (recommended max 300)
- `lastMessageAt` -> datetime
- `userId` -> string (recommended max 64)

Recommended indexes:

- key index on `userId` + `$updatedAt` (history listing)
- fulltext index on `title` (optional but recommended for search)

#### Table: chat messages

Table ID -> `VITE_APPWRITE_CHAT_MESSAGES_TABLE_ID`

Required columns:

- `sessionId` -> string (recommended max 64)
- `userId` -> string (recommended max 64)
- `role` -> string (values used: `user`, `assistant`; recommended max 16)
- `content` -> string (recommended max 20000+)
- `createdAt` -> datetime

Recommended indexes:

- key index on `sessionId` + `userId` + `$sequence` (session message loading)
- key index on `userId` + `$sequence` (search/history operations)
- fulltext index on `content` (optional but recommended for search)

#### Table: chat attachments metadata

Table ID -> `VITE_APPWRITE_CHAT_ATTACHMENTS_TABLE_ID`

Required columns:

- `messageId` -> string (recommended max 64)
- `sessionId` -> string (recommended max 64)
- `userId` -> string (recommended max 64)
- `fileId` -> string (recommended max 64)
- `name` -> string (recommended max 255)
- `mimeType` -> string (recommended max 128)
- `sizeBytes` -> integer

Optional columns (supported by code):

- `kind` -> string (recommended max 32)
- `url` -> string (recommended max 2048)
- `createdAt` -> datetime (nullable)

Recommended indexes:

- key index on `sessionId` + `userId` + `$createdAt`

### 2.4 Storage buckets

#### Chat attachments bucket (required)

Bucket ID -> `VITE_APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID`

Recommended:

- Enable file security
- Allow authenticated users (`users`) to create files
- Keep files private by default

Note: attachment files are uploaded with per-file permissions for the current user in app code.

Runtime limits enforced by frontend:

- Max 5 attachments per draft message
- Max 25 MB per file
- Allowed types:
  - images
  - video
  - PDF
  - markdown
  - Word
  - Excel

#### Profile image bucket (optional)

Bucket ID -> `VITE_APPWRITE_PROFILE_BUCKET_ID`

If omitted, profile image upload is disabled but the rest of the app still works.

Recommended permissions:

- Allow authenticated users (`users`) to create/read/update/delete their profile images

Runtime limits enforced by frontend:

- Image files only
- Max 5 MB

### 2.5 Optional: attachment share token endpoint

If you want expiring share URLs for model providers (recommended for private storage), configure:

- `VITE_APPWRITE_ATTACHMENT_TOKEN_ENDPOINT`
- `VITE_APPWRITE_ATTACHMENT_TOKEN_TTL_SECONDS` (defaults to `600`)

Request/response contract and an Appwrite Function example are documented in:

- [docs/attachment-share-token-endpoint.md](docs/attachment-share-token-endpoint.md)

## 3) Environment variables

Create `.env` in project root:

```env
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your_project_id
VITE_APP_BASE_URL=http://localhost:5173

VITE_APPWRITE_CHAT_DATABASE_ID=your_chat_database_id
VITE_APPWRITE_CHAT_SESSIONS_TABLE_ID=your_chat_sessions_table_id
VITE_APPWRITE_CHAT_MESSAGES_TABLE_ID=your_chat_messages_table_id
VITE_APPWRITE_CHAT_ATTACHMENTS_TABLE_ID=your_chat_attachments_table_id
VITE_APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID=your_chat_attachments_bucket_id

# Optional
VITE_APPWRITE_PROFILE_BUCKET_ID=your_profile_bucket_id

# Optional (expiring attachment URLs for provider-side file access)
VITE_APPWRITE_ATTACHMENT_TOKEN_ENDPOINT=https://your-domain/functions/attachment-share-token
VITE_APPWRITE_ATTACHMENT_TOKEN_TTL_SECONDS=600
```

Important:

- `VITE_APP_BASE_URL` must match the URL users actually open in browser.
- For LAN testing, set it to your LAN URL (example `http://192.168.0.108:5173`).
- `.env` is ignored by git in this project.

## 4) Run the app

### Local development

```bash
npm run dev
```

Open: `http://localhost:5173`

### LAN development

```bash
npm run dev:network
```

Then open from another device using:

`http://<your-lan-ip>:5173`

Also update `VITE_APP_BASE_URL` to that exact LAN URL.

## 5) First-run checklist

1. Start app and open `/register`
2. Create account
3. Click verification link from email
4. Complete MFA setup with authenticator app
5. Sign in
6. Open Settings (`/settings/account`)
7. Add AI provider model + API key (OpenRouter or Google)
8. Start chatting

## 6) Available scripts

- `npm run dev` -> Start Vite dev server
- `npm run dev:network` -> Start dev server on LAN (`--host`)
- `npm run build` -> TypeScript build + production bundle
- `npm run preview` -> Preview production build locally
- `npm run preview:network` -> Preview production build on LAN
- `npm run lint` -> Run ESLint

## 7) Data storage map

- Appwrite TablesDB:
  - chat sessions
  - chat messages
  - chat attachments metadata
- Appwrite Storage:
  - chat attachments bucket
  - optional profile bucket
- Appwrite Account prefs:
  - `alphineSettings` (user settings; AI settings included)
  - `alphineProfile` (profile metadata)
- Browser local storage/session storage:
  - non-secret UI/cache state
  - pending auth flow state

## 8) Troubleshooting

### Missing env variable error

If app crashes in dev with `Missing required environment variable`, verify all required `VITE_*` keys are present in `.env`.

### Email verification or reset links redirect incorrectly

`VITE_APP_BASE_URL` is wrong or does not match your actual browser URL.

### OAuth login fails

Check Google OAuth provider in Appwrite and verify callback URLs exactly match:

- `<BASE_URL>/oauth-callback`
- `<BASE_URL>/login?oauth=failed`

### MFA flow fails

Ensure TOTP MFA is enabled in Appwrite auth settings. If token errors continue, regenerate the QR from setup page and retry.

### Attachment upload/view fails

Check:

- bucket ID in env
- storage permissions
- file security setting
- size/type limits

### AI replies show provider error fallback text

Go to `/settings/account` and verify:

- provider is selected
- API key is valid
- model name is valid for that provider

## 9) Production notes

- Build with `npm run build`
- Serve `dist/` behind HTTPS
- Update `VITE_APP_BASE_URL` to production URL
- Reconfigure Appwrite platform domains and auth callback URLs for production domain
- Review CSP/security headers in `vite.config.ts` for your deployment

## 10) Current limitations

- No automated test suite is included yet.
- Chat title/content search works best with fulltext indexes; code falls back to `contains` when search index is not available.
