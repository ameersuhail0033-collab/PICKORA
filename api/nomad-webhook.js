/**
 * api/nomad-webhook.js — Vercel Serverless Function
 *
 * Handles Nomod payment gateway webhooks with:
 *   - Svix signature verification (HMAC-SHA256)
 *   - Timestamp tolerance (reject >5 min old)
 *   - Idempotent event processing (eventId tracking)
 *   - Payment reconciliation (verify amounts from DB)
 *   - State-transition-only stock decrement
 *
 * POST /api/nomad-webhook
 * Headers: svix-id, svix-timestamp, svix-signature
 * Body: { type, eventId, objectId, data: { ... } }
 */
const { getSupabase, verifyNomodWebhook, sendEmail, renderTemplate, jsonRes, errRes } = require('./_lib');
const fs = require('fs');
const path = require('path');

// IMPORTANT: Disable body parsing so we can access raw body for Svix verification
export const config = {
  api: { bodyParser: false },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return errRes(res, 405, 'Method not allowed');

  try {
    // ── Step 1: Read raw body for signature verification ──
    const rawBody = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });

    // ── Step 2: Verify Svix signature (includes timestamp check) ──
    const verification = verifyNomodWebhook(rawBody, req.headers);
    if (!verification.valid) {
      console.error('[webhook] Signature verification failed:', verification.reason);
      return errRes(res, 400, 'Invalid signature: ' + verification.reason);
    }

    // ── Step 3: Parse the webhook event ──
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (e) {
      console.error('[webhook] Failed to parse body:', e.message);
      return errRes(res, 400, 'Invalid JSON');
    }

    const eventType = event.type || '';
    const eventId = event.eventId || '';
    const chargeData = event.data || {};

    console.log('[webhook] Event received:', eventType, 'eventId:', eventId, 'objectId:', event.objectId);

    // ── Step 4: IDEMPOTENCY — Check if this event was already processed ──
    if (!eventId) {
      console.error('[webhook] Missing eventId — rejecting for idempotency safety');
      return errRes(res, 400, 'Missing eventId');
    }

    const db = getSupabase();

    // Check if this eventId was already processed
    const { data: existingPayment, error: lookupError } = await db
      .from('payments')
      .select('id, status')
      .eq('nomad_event_id', eventId)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error('[webhook] Idempotency lookup error:', lookupError);
    }

    if (existingPayment) {
      console.log('[webhook] Duplicate event detected:', eventId, '- already processed. Acknowledging.');
      return jsonRes(res, 200, { ok: true, message: 'Event already processed' });
    }

    // ── Step 5: Handle event types ──
    if (eventType === 'charge.completed') {
      // Find the order by referenceId (order_number) or objectId
      const referenceId = String(chargeData.referenceId || '');
      const chargeId = chargeData.id || event.objectId || '';

      let order = null;

      // Try referenceId first (this is our order_number)
      if (referenceId) {
        const { data } = await db.from('orders')
          .select('*, order_items(*)')
          .eq('order_number', referenceId)
          .single();
        order = data;
      }

      // Fallback: try nomad_order_id
      if (!order && chargeId) {
        const { data } = await db.from('orders')
          .select('*, order_items(*)')
          .eq('nomad_order_id', chargeId)
          .single();
        order = data;
      }

      if (!order) {
        console.error('[webhook] Order not found for charge:', chargeId, referenceId);
        // Acknowledge — don't retry for missing orders
        return jsonRes(res, 200, { ok: true, message: 'Order not found, acknowledged' });
      }

      // ── Step 6: PAYMENT RECONCILIATION — Verify amounts ──
      const paidAmount = Number(chargeData.total || chargeData.amount || 0);
      const orderTotal = Number(order.total);

      if (paidAmount && Math.abs(paidAmount - orderTotal) > 0.01) {
        console.error('[webhook] AMOUNT MISMATCH:', {
          paid: paidAmount,
          expected: orderTotal,
          order_number: order.order_number,
          charge_id: chargeId,
        });
        // Quarantine: mark as needing manual review, but still record the event
        await db.from('payments').insert({
          order_id: order.id,
          nomad_payment_id: chargeId,
          nomad_event_id: eventId,
          method: 'nomod',
          amount: paidAmount,
          currency: order.currency || 'AED',
          status: 'quarantined',
          raw_response: { ...chargeData, _reconciliation_note: `Amount mismatch: paid ${paidAmount} vs expected ${orderTotal}` },
        });

        return jsonRes(res, 200, { ok: true, message: 'Payment quarantined — amount mismatch' });
      }

      // ── Step 7: Mark order as paid (ONLY on state transition) ──
      // The decrement_stock_on_paid() trigger checks the state transition
      // and will only decrement stock if payment_status changes to 'paid'
      const { error: updateError } = await db.from('orders').update({
        payment_status: 'paid',
        status: 'confirmed',
        paid_at: new Date().toISOString(),
      }).eq('id', order.id)
        .eq('payment_status', 'pending'); // WHERE clause ensures state transition

      if (updateError) {
        console.error('[webhook] Failed to update order:', updateError);
        return errRes(res, 500, 'Failed to update order');
      }

      // Record the payment event with the eventId for idempotency
      await db.from('payments').insert({
        order_id: order.id,
        nomad_payment_id: chargeId,
        nomad_event_id: eventId,
        method: 'nomod',
        amount: paidAmount || orderTotal,
        currency: order.currency || 'AED',
        status: 'paid',
        raw_response: chargeData,
      });

      // ── Step 8: Send order confirmation email ──
      try {
        if (order.user_id) {
          const { data: profile } = await db.from('profiles')
            .select('email, full_name')
            .eq('id', order.user_id)
            .single();

          if (profile && profile.email) {
            const settings = await db.from('store_settings').select('*').limit(1).single();
            const store = settings.data || {};
            const siteUrl = process.env.PUBLIC_SITE_URL || 'https://pickoraonline.com';

            // Load email template
            let template = '';
            try {
              template = fs.readFileSync(
                path.join(__dirname, '..', 'emails', 'order-confirmation.html'),
                'utf-8'
              );
            } catch (e) {
              template = '<h1>Order Confirmed!</h1><p>Order {{order_number}} — Total: {{total}}</p>';
            }

            const itemsHtml = (order.order_items || []).map(item =>
              `<tr><td>${esc(item.name)}</td><td>${item.quantity}</td><td>${formatPrice(item.price)}</td><td>${formatPrice(item.total)}</td></tr>`
            ).join('');

            const html = renderTemplate(template, {
              store_name: store.store_name || 'Pickora',
              store_logo: store.logo_url || '',
              customer_name: escHtml(profile.full_name || 'Customer'),
              order_number: order.order_number,
              order_date: new Date(order.created_at).toLocaleDateString(),
              subtotal: formatPrice(order.subtotal),
              tax: formatPrice(order.tax),
              shipping: formatPrice(order.shipping),
              discount: formatPrice(order.discount),
              total: formatPrice(order.total),
              items_html: itemsHtml,
              site_url: siteUrl,
              support_email: store.support_email || process.env.PUBLIC_SUPPORT_EMAIL || '',
              shipping_address: `${esc(order.shipping_name)}<br>${esc(order.shipping_address)}<br>${esc(order.shipping_city)}, ${esc(order.shipping_state)} ${esc(order.shipping_postal)}<br>${esc(order.shipping_country)}`,
            });

            await sendEmail({
              to: profile.email,
              subject: `Order Confirmed — ${order.order_number} | ${store.store_name || 'Pickora'}`,
              html: html,
            });
          }
        }
      } catch (emailErr) {
        console.error('[webhook] Email error (non-critical):', emailErr.message);
      }

      console.log('[webhook] Order marked as paid:', order.order_number);
      return jsonRes(res, 200, { ok: true });

    } else if (eventType === 'charge.failed') {
      const referenceId = String(chargeData.referenceId || '');
      const chargeId = chargeData.id || event.objectId || '';

      let order = null;
      if (referenceId) {
        const { data } = await db.from('orders').select('id').eq('order_number', referenceId).single();
        order = data;
      }
      if (!order && chargeId) {
        const { data } = await db.from('orders').select('id').eq('nomad_order_id', chargeId).single();
        order = data;
      }

      if (order) {
        // Only update if not already failed/cancelled (idempotent)
        await db.from('orders').update({
          payment_status: 'failed',
          status: 'cancelled',
        }).eq('id', order.id)
          .not('payment_status', 'eq', 'failed'); // Don't re-process

        await db.from('payments').insert({
          order_id: order.id,
          nomad_payment_id: chargeId,
          nomad_event_id: eventId,
          method: 'nomod',
          amount: Number(chargeData.total || chargeData.amount || 0),
          currency: 'AED',
          status: 'failed',
          raw_response: chargeData,
        });
      }

      return jsonRes(res, 200, { ok: true });

    } else if (eventType === 'charge.refunded' || eventType === 'charge.partially_refunded') {
      const referenceId = String(chargeData.referenceId || '');
      const chargeId = chargeData.id || event.objectId || '';

      let order = null;
      if (referenceId) {
        const { data } = await db.from('orders').select('id').eq('order_number', referenceId).single();
        order = data;
      }
      if (!order && chargeId) {
        const { data } = await db.from('orders').select('id').eq('nomad_order_id', chargeId).single();
        order = data;
      }

      if (order) {
        await db.from('orders').update({
          payment_status: 'refunded',
          status: 'refunded',
        }).eq('id', order.id);

        await db.from('payments').insert({
          order_id: order.id,
          nomad_payment_id: chargeId,
          nomad_event_id: eventId,
          method: 'nomod',
          amount: Number(chargeData.total || chargeData.amount || 0),
          currency: 'AED',
          status: 'refunded',
          raw_response: chargeData,
        });
      }

      return jsonRes(res, 200, { ok: true });
    }

    // Unknown event type — acknowledge but don't process
    console.log('[webhook] Unhandled event type:', eventType);
    return jsonRes(res, 200, { ok: true });

  } catch (err) {
    console.error('[webhook] Error:', err);
    return errRes(res, 500, 'Internal server error');
  }
};

/* ── Template Helpers ─────────────────────────────────────── */
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escHtml(s) { return esc(s); }

function formatPrice(amount) {
  var num = Number(amount) || 0;
  return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
