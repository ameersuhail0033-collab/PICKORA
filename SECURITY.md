# Security Policy

## Overview

Pickora implements defense-in-depth security across all layers.

## Authentication & Authorization

- **Supabase Auth** handles all authentication (email/password, Google OAuth, magic link)
- **Row Level Security (RLS)** is enabled on every table with default-deny policies
- Users can only access their own cart, wishlist, orders, addresses, reviews, and profile
- Admin access is gated by `is_admin()` function checking `profiles.role`
- The first registered user automatically becomes `super_admin` via SQL trigger

## Secrets Management

| Secret | Location | Client Access |
|--------|----------|---------------|
| `SUPABASE_SECRET_KEY` | Server env only | ❌ Never |
| `NOMOD_HOSTED_CHECKOUT_API_KEY` | Server env only | ❌ Never |
| `NOMOD_WEBHOOK_SECRET` | Server env only | ❌ Never |
| `RESEND_API_KEY` | Server env only | ❌ Never |
| `PUBLIC_SUPABASE_URL` | `js/env.js` (window.__ENV) | ✅ Yes |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `js/env.js` (window.__ENV) | ✅ Yes |

The `scripts/generate-env.js` build script reads `.env` and only writes `PUBLIC_*` prefixed variables to `js/env.js`. Server secrets (`SUPABASE_SECRET_KEY`, `NOMOD_*`, `RESEND_*`) are NEVER written to browser code. Server secrets (`SUPABASE_SECRET_KEY`, `NOMOD_*`, `RESEND_*`) are NEVER written to browser code.

## Payment Security

- **Server-side verification**: Order amounts are re-read from the database, never trusted from the client
- **Svix webhook verification**: Nomod webhooks are verified using Svix HMAC-SHA256 with constant-time comparison
- **No client self-payment**: Only the server-side webhook handler can set `payment_status='paid'`
- **Raw body access**: Webhook endpoint disables body parser to access raw body for Svix verification
- **Timestamp validation**: Rejects webhook requests with timestamps older than 5 minutes (replay protection)

### Nomod Webhook Verification (Svix)

```
Headers:      svix-id, svix-timestamp, svix-signature
Algorithm:    HMAC-SHA256
Signed:       svix-id.svix-timestamp.rawBody
Key:          base64_decode(whsec_<secret>)
Encoding:     Base64 digest
Comparison:   crypto.timingSafeEqual() (prevents timing attacks)
Timestamp:    Reject if >5 minutes old
```

Source: https://nomod.com/docs/webhooks/verifying-webhook-signatures

## XSS Prevention

- All user input and database strings are escaped via `esc()` before HTML insertion
- `esc()` escapes: `& < > " '`
- No `innerHTML` assignment with raw user input
- Content Security Policy via meta tag where applicable

## HTTP Security Headers

Set via `vercel.json`:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-XSS-Protection` | `1; mode=block` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |

## Storage Security

- Product images and store assets: admin-only write, public read
- Avatars: users can only write to their own `avatars/<uid>/` directory
- File types restricted to image formats only
- Filenames sanitized and randomized on upload

## Rate Limiting Strategy

Recommended for production:

1. **Vercel Edge**: Use Vercel's built-in rate limiting for API routes
2. **Cloudflare**: Enable Cloudflare in front of Vercel for additional rate limiting
3. **Supabase**: Use Supabase's built-in rate limiting for auth endpoints
4. **Custom**: Implement rate limiting in `_lib.js` middleware for sensitive endpoints

### Recommended Limits

| Endpoint | Limit |
|----------|-------|
| `/api/create-order` | 10 req/min per user |
| `/api/nomad-webhook` | 100 req/min (Nomad IPs only) |
| `/api/send-email` | 5 req/min per user |
| Auth endpoints | Supabase defaults |

## Database Security

- RLS on every table, default deny
- Service role key only used in serverless functions
- All queries use Supabase client/RPC — no string-built SQL
- Parameterized queries via Supabase query builder

## Incident Response

If you discover a security vulnerability:

1. Do NOT open a public issue
2. Email: security@pickora.com
3. Include: description, steps to reproduce, potential impact
4. We will respond within 48 hours
