/**
 * api/_lib.js — Shared server-side helpers
 * Supabase secret-role client, Nomod payment helpers, email.
 * This file is imported by other API routes. NOT served to browser.
 *
 * PAYMENT PROVIDER: Nomod (https://nomod.com)
 * API Base: https://api.nomod.com/v1
 * Auth: X-API-KEY header (NOT Bearer token)
 * Checkout: POST /v1/checkout → returns hosted checkout URL
 * Webhooks: Svix-signed (svix-id, svix-timestamp, svix-signature headers)
 */
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

/* ── Supabase Secret-Key Client ────────────────────────────── */
function getSupabase() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[supabase] Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ── Nomod Payment Gateway Helpers ──────────────────────────── */

/**
 * Nomod Payment Gateway — Verified API Reference
 * =================================================
 * Source: https://nomod.com/docs/api-reference/create-checkout
 *
 * API Base URL:
 *   https://api.nomod.com/v1
 *   (Test mode uses test API credentials, NOT a separate endpoint)
 *
 * Authentication:
 *   Header: X-API-KEY: <NOMOD_HOSTED_CHECKOUT_API_KEY>
 *   (NOT a Bearer token)
 *
 * Create Checkout Session:
 *   POST /v1/checkout
 *   Body: { reference_id, amount, currency, items, customer, success_url, failure_url, cancelled_url, metadata }
 *   Response: { id, url, status, amount, currency, reference_id, ... }
 *
 * Webhook Signature Verification (Svix):
 *   Headers: svix-id, svix-timestamp, svix-signature
 *   Algorithm: HMAC-SHA256
 *   Signed content: svix-id.svix-timestamp.rawBody
 *   Key: base64-decode(whsec_<secret>)
 *   Signature: base64-encoded HMAC-SHA256
 *   Multiple signatures possible (space-delimited, v1, prefix)
 *
 * Webhook Events:
 *   charge.completed → funds captured and settled
 *   charge.failed → payment declined
 *   charge.refunded → full refund issued
 *   charge.partially_refunded → partial refund
 */

// Nomod API Base — single production endpoint
// Test mode is controlled by test API credentials, NOT a separate URL.
// If Nomod provides test credentials, use those in NOMOD_HOSTED_CHECKOUT_API_KEY.
// PUBLIC_PAYMENT_MODE is for UI display only; it does NOT control the API endpoint.
const NOMOD_BASE = 'https://api.nomod.com/v1';

/**
 * Create a Nomod hosted checkout session.
 * @see https://nomod.com/docs/api-reference/create-checkout
 */
async function nomodCreateCheckout({ referenceId, amount, currency, items, customer, successUrl, failureUrl, cancelledUrl, metadata }) {
  const apiKey = process.env.NOMOD_HOSTED_CHECKOUT_API_KEY;
  if (!apiKey) throw new Error('NOMOD_HOSTED_CHECKOUT_API_KEY not configured');

  const body = {
    reference_id: referenceId,
    amount: String(Number(amount).toFixed(2)), // Decimal string in main currency unit
    currency: currency || 'AED',
    items: items || [],
    customer: customer || {},
    success_url: successUrl,
    failure_url: failureUrl,
    cancelled_url: cancelledUrl,
    metadata: metadata || {},
  };

  const resp = await fetch(`${NOMOD_BASE}/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error('[nomod] Create checkout failed:', resp.status, errBody);
    throw new Error(`Nomod API error: ${resp.status}`);
  }

  return resp.json();
}

/**
 * Verify Nomod webhook signature (Svix format).
 *
 * Headers:
 *   svix-id: unique message identifier
 *   svix-timestamp: Unix timestamp (seconds)
 *   svix-signature: Base64-encoded HMAC-SHA256, may contain multiple v1, signatures
 *
 * Algorithm:
 *   signedContent = svix-id + "." + svix-timestamp + "." + rawBody
 *   secretBytes = base64_decode(whsec_<secret>)
 *   expectedSignature = base64_encode(HMAC-SHA256(secretBytes, signedContent))
 *   Compare against each v1, signature in svix-signature header
 *
 * @see https://nomod.com/docs/webhooks/verifying-webhook-signatures
 */
function verifyNomodWebhook(rawBody, headers) {
  const secret = process.env.NOMOD_WEBHOOK_SECRET;
  if (!secret) return { valid: false, reason: 'NOMOD_WEBHOOK_SECRET not configured' };

  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valid: false, reason: 'Missing svix headers' };
  }

  // Validate timestamp (reject if >5 minutes old)
  const timestamp = parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return { valid: false, reason: 'Timestamp too old (>5 minutes)' };
  }

  // Construct signed content
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

  // Decode the secret (strip whsec_ prefix, base64 decode)
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  // Parse signatures (space-delimited, each may have v1, prefix)
  const signatures = svixSignature.split(' ');
  for (const sig of signatures) {
    const signatureValue = sig.replace(/^v1,/, '');
    // Constant-time comparison
    try {
      if (crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'base64'),
        Buffer.from(signatureValue, 'base64')
      )) {
        return { valid: true };
      }
    } catch {
      // Buffer length mismatch or other error — continue to next signature
    }
  }

  return { valid: false, reason: 'No matching signature' };
}

/* ── Resend Email Helper ──────────────────────────────────── */

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  // No-op if no Resend key configured
  if (!apiKey || !from) {
    console.log('[email] Resend not configured, skipping email to:', to);
    return { ok: true, skipped: true };
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('[email] Send failed:', resp.status, err);
      return { ok: false, error: err };
    }

    return { ok: true, data: await resp.json() };
  } catch (e) {
    console.error('[email] Send error:', e.message);
    return { ok: false, error: e.message };
  }
}

/* ── Template Rendering ───────────────────────────────────── */

function renderTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value || '');
  }
  return result;
}

/* ── Vercel API response helpers ──────────────────────────── */

function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function errRes(res, status, message) {
  jsonRes(res, status, { error: message });
}

module.exports = {
  getSupabase,
  nomodCreateCheckout,
  verifyNomodWebhook,
  sendEmail,
  renderTemplate,
  jsonRes,
  errRes,
};
