# Nomod Payment Gateway Setup Guide

## Overview

Pickora uses **Nomod** (https://nomod.com) with a **hosted checkout** model. Customers are redirected to Nomod's secure payment page rather than entering card details on your site.

**This integration is verified against official Nomod documentation.**

## Flow Diagram

```
1. Customer clicks "Place Order"
2. Server creates pending order in database
3. Server calls Nomod API → creates checkout session
4. Nomod returns a checkout URL
5. Customer is redirected to Nomod's hosted payment page
6. Customer enters payment details on Nomod's page
7. Nomod processes the payment
8. Nomod sends a webhook to your server (Svix-signed)
9. Server verifies the webhook signature (Svix)
10. Server marks the order as paid
```

## Step 1: Create Nomod Account

1. Go to [Nomod](https://nomod.com)
2. Sign up for a merchant account
3. Complete KYC verification
4. Your account will be enabled for API access

## Step 2: Get API Keys

1. In Nomod Dashboard → Settings → Tools & customisations → Apps & APIs
2. Select **Hosted Checkout** integration
3. Tap **Create API key**
4. Copy the key and store it as `NOMOD_HOSTED_CHECKOUT_API_KEY` in your `.env`

## Step 3: Configure Webhook

1. In Nomod Dashboard → Settings → Tools & customisations → Apps & APIs → Webhooks
2. Tap **Create webhook**
3. Select integration type: **Nomod Hosted Checkout**
4. Select events: `charge.completed`, `charge.failed`, `charge.refunded`, `charge.partially_refunded`
5. Enter your webhook URL:
   ```
   https://your-domain.com/api/nomad-webhook
   ```
6. Copy the **Signing secret** (starts with `whsec_`)
7. Store it as `NOMOD_WEBHOOK_SECRET` in your `.env`

## Step 4: Environment Variables

Add to your `.env`:

```env
NOMOD_HOSTED_CHECKOUT_API_KEY=sk_live_your_key
NOMOD_WEBHOOK_SECRET=whsec_your_secret
PUBLIC_PAYMENT_MODE=live  # or "test" for sandbox
```

## Step 5: Test

1. Set `PUBLIC_PAYMENT_MODE=test`
2. Use Nomod's test environment
3. Create a test order on your site
4. Verify the webhook fires and the order is marked paid
5. Switch to `PUBLIC_PAYMENT_MODE=live` when ready

## Webhook Signature Verification (Svix)

Nomod uses **Svix** for webhook signing. Every webhook request includes three headers:

### Headers

| Header | Description |
|--------|-------------|
| `svix-id` | Unique message identifier |
| `svix-timestamp` | Unix timestamp (seconds since epoch) |
| `svix-signature` | Base64-encoded HMAC-SHA256 (may contain multiple `v1,` signatures) |

### Verification Algorithm

```
1. Extract svix-id, svix-timestamp, svix-signature from headers
2. Reject if any header is missing (return 400)
3. Validate timestamp (reject if >5 minutes from server time)
4. signedContent = svix-id + "." + svix-timestamp + "." + rawBody
5. secretBytes = base64_decode(whsec_<secret>)
6. expected = base64_encode(HMAC-SHA256(secretBytes, signedContent))
7. Compare against each v1, signature using constant-time comparison
8. Return 400 if no match
```

### Implementation (Node.js)

```javascript
const crypto = require('crypto');

function verifyNomodWebhook(rawBody, headers) {
  const secret = process.env.NOMOD_WEBHOOK_SECRET;
  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Validate timestamp
  const timestamp = parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return false;

  // Construct signed content
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

  // Decode secret (strip whsec_ prefix, base64 decode)
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');

  // Compute expected signature
  const expected = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  // Compare against each v1, signature
  const signatures = svixSignature.split(' ');
  for (const sig of signatures) {
    const value = sig.replace(/^v1,/, '');
    try {
      if (crypto.timingSafeEqual(
        Buffer.from(expected, 'base64'),
        Buffer.from(value, 'base64')
      )) return true;
    } catch {}
  }
  return false;
}
```

### Important Notes

- The webhook endpoint must have `bodyParser: false` to access the raw body
- Always use constant-time comparison (`crypto.timingSafeEqual`)
- Reject requests with timestamps older than 5 minutes (replay protection)
- Return HTTP 200 quickly; process asynchronously if needed
- Source: https://nomod.com/docs/webhooks/verifying-webhook-signatures

## API Reference

### Create Checkout Session

Source: https://nomod.com/docs/api-reference/create-checkout

```
POST https://api.nomod.com/v1/checkout
X-API-KEY: <NOMOD_HOSTED_CHECKOUT_API_KEY>
Content-Type: application/json

{
  "reference_id": "PKR-000001",
  "amount": "2199.99",
  "currency": "AED",
  "items": [
    {
      "item_id": "item_1",
      "name": "Alienware m16 R2",
      "quantity": 1,
      "unit_amount": "2199.99",
      "discount_type": "flat",
      "discount_amount": "0.00",
      "total_amount": "2199.99",
      "net_amount": "2199.99"
    }
  ],
  "customer": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "[email protected]"
  },
  "success_url": "https://your-domain.com/pages/checkout.html?payment=success",
  "failure_url": "https://your-domain.com/pages/checkout.html?payment=failed",
  "cancelled_url": "https://your-domain.com/pages/checkout.html?payment=cancelled",
  "metadata": {
    "order_id": "uuid",
    "order_number": "PKR-000001"
  }
}
```

### Response

```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "url": "https://checkout.nomod.com/pay/xxx",
  "status": "created",
  "amount": 2199.99,
  "currency": "AED",
  "reference_id": "PKR-000001",
  "created_at": "2026-01-01T00:00:00Z",
  "items": [...],
  "customer": {...},
  "metadata": {...},
  "charges": []
}
```

## Webhook Event Payloads

### charge.completed

```json
{
  "type": "charge.completed",
  "eventId": "ab088ef8-7597-475c-aacd-001555fb8bd3",
  "objectId": "ch_5674c95a4fd04e439e6e53f5f6b97323",
  "data": {
    "id": "5674c95a-4fd0-4e43-9e6e-53f5f6b97323",
    "status": "paid",
    "total": "78.860",
    "currency": "AED",
    "referenceId": 1121,
    "customer": {...},
    "items": [...]
  }
}
```

### charge.failed

```json
{
  "type": "charge.failed",
  "eventId": "...",
  "objectId": "ch_xxx",
  "data": {
    "id": "xxx",
    "status": "failed",
    "referenceId": 1121
  }
}
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Webhook not received | Check URL is correct, server is deployed, and port 443 is open |
| Signature mismatch | Ensure `bodyParser: false` and use Svix verification (not simple HMAC) |
| Payment not completing | Check `charge.completed` event is enabled in Nomod dashboard |
| CORS errors | Ensure callback URLs match your domain |
| Amount mismatch | Verify amounts are decimal strings in main currency unit (not cents) |
| IP blocked | Add Nomod IPs to firewall allowlist: 52.215.16.239, 54.216.8.72, 63.33.109.123 |
