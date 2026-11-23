# SNARP frontend handoff

Branch `feature/guest-frontend` is ready for backend integration review. The checked-in backend returns 401 for anonymous feed and post comment reads. Frontend tests establish the expected UI and request behavior in isolation. Guest release requires the backend changes below and live verification.

## Architecture and commands

React 19 runs under Vite with React Router 7. [App.jsx](src/App.jsx) restores sessions and defines guest and member routes. [Layout.jsx](src/Layout.jsx) provides the navigation shells. [Feed.jsx](src/Feed.jsx) owns mixed feed loading and pagination and renders [PostCard.jsx](src/components/PostCard.jsx) and paper cards. [api.js](src/api.js) handles same-origin requests and token storage. [LoginPrompt.jsx](src/components/LoginPrompt.jsx) uses the shared [Overlay.jsx](src/components/Overlay.jsx). [ChatContext.jsx](src/ChatContext.jsx) handles member chat sessions. The design system uses [index.css](src/index.css) and [theme-breeze.css](src/theme-breeze.css). Documents, Reels, citation network, leaderboard, researcher matching, and paper chat load on their own routes.

Use Node 22.12 or newer. Run these from the repository root.

| Task | Command |
| --- | --- |
| Install locked frontend dependencies | `cd frontend && npm ci` |
| Start Vite | `cd frontend && npm run dev` |
| Check lint and unit tests | `cd frontend && npm run lint && npm test` |
| Build into the ignored `frontend/dist/` directory | `cd frontend && npm run build` |
| Run browser regressions with Vite running | `cd frontend && node --test tests/login-prompt.native.mjs tests/feed-auth.native.mjs` |
| Check patch whitespace | `git diff --check` |

Browser checks use an existing Chrome installation. Override its path with `CHROME_PATH`. For another Vite address, set `SNARP_APP_URL` to the app origin and `SNARP_TEST_URL` to the full dialog fixture URL. The [dialog fixture](http://localhost:5173/tests/login-prompt.html) can also run directly through Vite.

## API configuration and auth routing

The frontend has no required Vite environment variables. [vite.config.js](vite.config.js) proxies `/api` to `http://localhost:5000` and `/collaboration` to `ws://localhost:5000`. Align the proxy target if the backend uses a different port. In production, serve the frontend and API on the same origin and route SPA paths such as `/feed` and `/verify-email` to `index.html`. Express can serve `frontend/dist/` when `SERVE_FRONTEND` is enabled and the build exists. The backend owns `PORT`, `SERVE_FRONTEND`, `APP_URL`, `REQUIRE_EMAIL_VERIFICATION`, SMTP, and database settings. Set `APP_URL` to the user-facing origin for email links. Keep backend secrets in backend configuration. [Backend environment and routing](../backend/server.js)

- Guests see the landing page at `/` and can open `/feed`. Members see their feed at `/` and can also use `/feed`. Settings, submission, messaging, and other member routes remain gated. `/moderator` checks roles and `/admin` uses its own session.
- Guest feed and comment requests omit the bearer. Member requests use the restored session. A new login clears the old token from the other Remember Me storage location. Logout clears local state immediately and sends session revocation to the backend.
- Guest Like opens LoginPrompt without a write. Auth links preserve safe same-origin paths, queries, and fragments. X, Escape, and completed backdrop interactions restore focus to the trigger. Guest comments are read-only. The attempted Like is not replayed after login.
- Verified signup restores a matching return destination in the same browser and origin within 24 hours. Verification elsewhere falls back to `/`. Retryable verification failures have a retry button. Token expiry, mail delivery, and session revocation belong to the backend.

## API contract matrix

Paths are relative to `/api`. Auth means a valid member session. Errors use `{ error }` and may include `code` or `field`. Missing or expired sessions return 401, blocked accounts return 403, and unsupported paths return 404.

| Endpoint and input | Success response | Auth today | Frontend consumer |
| --- | --- | --- | --- |
| `GET /posts?page=1&scope=everyone` or `scope=following` | `{ items, page, hasMore }`, up to 20 mixed rows. Rows include type, ID, timestamp, author, and engagement fields. Published paper rows add title, abstract, authors, domain, and tags. | **Required. Guest blocker.** | Feed |
| `GET /posts/:id/comments` | Latest 50 comments in chronological order, including `{ id, body, author_name, created_at }` | **Required. Guest blocker.** | PostActions |
| `PUT /posts/:id/like` with `{ liked: boolean }` | `{ liked_by_me, like_count }` | Required | PostActions |
| `GET /posts/:id/likes`; `POST /posts/:id/comments` with `{ body }`; `DELETE /comments/:id` | Array of likers, 201 comment, or 204 | Required; comment delete requires author, post owner, or moderator | PostActions |
| `POST /posts` with multipart `body` and optional `image`; `PATCH /posts/:id` with `{ body }`; `DELETE /posts/:id` | 201 post, updated post, or 204 | Create requires auth; edit requires owner; delete requires owner or moderator | Composer and PostCard |
| `POST /posts/:id/report` with `{ reason }` | 201 `{ id, status }`; duplicate report returns 409 | Required | PostActions |
| `GET /papers/:id` and `/papers/:id/pdf` | Paper metadata or PDF bytes | Required, with additional PDF visibility rules | PaperDetail and PdfAttachment |
| `PUT /papers/:id/like` with `{ liked }`; `PUT /papers/:id/save` with `{ saved }`; `GET` or `POST /papers/:id/comments`; `DELETE /paper-comments/:id` | Like state and count, save state, comment list, 201 comment, or 204 | Required; comment deletes have ownership or moderator checks | FeedPaper and PaperDetail |
| `GET /images/:id` | Image bytes | Public by ID | Avatars and post images |
| `GET /users/suggestions`, `/users/:id/followers`, `/papers/featured`, `/papers/past-picks`, `/notifications/unread-count` | Sidebar lists, featured paper or null, and unread counts | Required | Feed and Layout |
| `PUT /users/:id/follow` with `{ following }`; `POST /views` with `{ items: [{ type, id }] }` | `{ follower_count, followed_by_me }` or 204 | Required | Feed, Layout, views tracker |
| `GET /saved/folders`; `POST /saved/items` with `{ item_type, item_id, folder_id }`; `DELETE /saved/items/:id` | Folder list, saved item, or 204 | Required; folder ownership enforced | SaveButton |
| `POST /auth/login` with `{ email, password, remember }` | `{ token, user }`; 401 for invalid credentials; 403 for unverified or blocked account | Public | Auth |
| `POST /auth/signup` with `{ name, email, password, role }`; `POST /auth/verify-email` with `{ token }` | 201 pending verification or `{ token, user }`; verification returns `{ token, user }` including email | Public | Auth and VerifyEmail |
| `POST /auth/resend-verification` or `/auth/forgot-password` with `{ email }`; `POST /auth/reset-password` with `{ token, password }` | Message; reset also returns `email` | Public | Auth and ResetPassword |
| `GET /auth/me`; `POST /auth/logout` | User with profile counts or 204 | Required | App and Layout |

[Backend API documentation](../README.md#api-reference) · [Feed](../backend/server.js#L2040) · [Post engagement](../backend/server.js#L3113) · [Paper engagement](../backend/server.js#L2344) · [Auth middleware](../backend/server.js#L290)

## Backend changes required

1. Allow anonymous `GET /api/posts` for Everyone using the existing paginated shape. Aggregate counts can be public. Default viewer-specific flags or omit them, and omit personal saved-item and folder IDs. Following must require a member session.
2. Allow anonymous read-only `GET /api/posts/:id/comments` with the documented array. Keep comment writes, deletes, Like, saves, follows, reports, and views protected.
3. Include **published** paper summaries in anonymous mixed feed pages. An approved paper enters the feed only after its separate publish transition. Keep approved-but-unpublished and draft papers out. Paper details, PDFs, and paper engagement retain their separate access rules.
4. Keep authenticated Like on `PUT /api/posts/:id/like` with `{ liked: boolean }`. The frontend already matches it.

## Audit findings and limitations

| Severity | Finding | Status |
| --- | --- | --- |
| High | The checked-in backend rejects both guest read endpoints. Published-paper summaries are behind the same feed gate. | Backend blocker |
| Medium | A Posts/Papers filter could show an empty feed before later mixed pages loaded. Overlapping pages could duplicate records or append a result from the previous scope. | Fixed with a provisional state, deduplication by type and ID, and cancellation when switching scopes. |
| Medium | An earlier comment read could overwrite a reopened sheet, and a pending read could replace a newly submitted comment. | Fixed. Closing cancels reads and comment mutations wait for the current read. |
| Medium | A late auth response could sign in after navigating off its form. Changing Remember Me could leave the old token preferred in storage. | Fixed with cancellation and single-store token selection. Late account-blocked responses for an earlier bearer no longer affect newer sessions. |
| Medium | Protected-route redirects dropped fragments, and return paths could normalize into a network-path reference or auth entry route. | Fixed with full paths and same-origin normalization. |
| Low | A transient verification outage looked like an invalid link. A pending post submit could discard newer composer edits. Scope controls advertised tabs without the matching keyboard model. | Fixed with verification retry, composer locking and preview cleanup, and pressed-state scope buttons. |
| Low | Initial JS included secondary routes. | Route splitting reduced the main JS chunk from about 1,164 kB to about 891 kB minified. The existing warning remains for the main and lazy Docs editor chunks. |

Offset pagination still has no snapshot guarantee when new data moves between pages. Client deduplication prevents repeats but cannot recover rows the server skipped. There is no backend per-type filter. Verification return state is browser-local and direct paper details remain member-only. Chrome and emulated touch cover the regression suite. Real devices, Safari, and screen-reader combinations require manual verification.

## Verification

The browser API fixture exists only in the test runner. It exercises the production frontend code with controlled responses and is excluded from the build. The native browser test drives trusted mouse and Chrome-emulated touch input.

| Check | Outcome |
| --- | --- |
| `npm run lint` and `git diff --check` | PASS |
| `npm test` | PASS, 18 tests |
| `npm run build` | PASS, chunk-size warning remains |
| Native dialog at desktop 1280×800, tablet 768×1024, mobile 390×844 | PASS, trusted Chrome desktop mouse and emulated touch. The existing nine-case fixture also passed at each size. |
| Guest and member feed/auth integration | PASS with an isolated browser API fixture. Covered 401 and page retry, mixed pages, deduplication, scope and comment races, protected return URLs, expiry, signup and verification retry, member Like/comment/post writes, and direct loading of the newly split routes. The browser command reported eight passing test entries. |
| Full live integration, including SMTP | UNVERIFIED. The local proxy's port 5000 was occupied by macOS Control Center. No backend was started. |

### Manual verification and release acceptance

- In a clean browser, open Browse Posts and confirm both guest reads return 200 without a bearer. Page through Posts and Papers and check that published summaries appear while an approved-but-unpublished fixture stays hidden.
- Read guest comments, then try Like. Check X, Escape, backdrop, Tab, and Shift+Tab. The prompt should close without navigation, restore focus, and send no write.
- Log in and sign up from the prompt with a return URL containing a query and fragment. Verify a delivered email on the configured production origin and check fallback behavior from a different browser. Check password reset recovery.
- Switch Everyone/Following while a page is loading. As a member, create a text and image post, Like and Unlike, add and delete a comment, and save a post. Expire a session and verify protected writes still reject unauthenticated requests.
- At 1280×800, 768×1024, and 390×844, check scrolling, wrapping, keyboard focus, and dialog dismissal. Open lazy secondary routes directly from a production build.

**Release acceptance.** The real API must return the agreed guest feed and comment shapes without a token, show only published paper summaries to guests, and reject unauthorized writes. Live login, delivered verification email, and authenticated Like must pass against the same deployment.
