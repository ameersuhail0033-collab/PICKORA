/**
 * api/create-order.js — Vercel Serverless Function
 *
 * Creates an order and initiates Nomod hosted checkout.
 *
 * VERIFIED API: https://nomod.com/docs/api-reference/create-checkout
 *
 * Flow:
 *   1. Verify user auth (Supabase JWT from Authorization header)
 *   2. Re-read the order from DB (NEVER trust client amounts)
 *   3. Validate order totals match product prices
 *   4. Call Nomod API to create a hosted checkout session
 *   5. Store nomad_order_id and checkout URL on the order
 *   6. Return the Nomod hosted checkout URL to the client
 *
 * POST /api/create-order
 * Body: { order_id }
 * Response: { checkout_url, order_number }
 */
const { getSupabase, nomodCreateCheckout, jsonRes, errRes } = require('./_lib');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.PUBLIC_SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return jsonRes(res, 200, { ok: true });
  if (req.method !== 'POST') return errRes(res, 405, 'Method not allowed');

  try {
    const { order_id } = req.body || {};
    if (!order_id) return errRes(res, 400, 'order_id is required');

    const db = getSupabase();

    // ── Step 1: Verify user from JWT ──
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errRes(res, 401, 'Unauthorized');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) {
      return errRes(res, 401, 'Invalid token');
    }

    // ── Step 2: Re-read the order from DB (server-side source of truth) ──
    const { data: order, error: orderError } = await db
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return errRes(res, 404, 'Order not found');
    }

    // Verify the order belongs to this user
    if (order.user_id !== user.id) {
      return errRes(res, 403, 'Forbidden');
    }

    // Verify order is still pending
    if (order.payment_status !== 'pending') {
      return errRes(res, 400, 'Order already paid or not pending');
    }

    // ── Step 3: Validate order amounts from DB ──
    // Re-calculate totals server-side from order_items
    let serverSubtotal = 0;
    for (const item of order.order_items) {
      serverSubtotal += Number(item.price) * item.quantity;
    }
    serverSubtotal = Math.round(serverSubtotal * 100) / 100;

    // Verify subtotal matches
    if (Math.abs(serverSubtotal - Number(order.subtotal)) > 0.01) {
      console.error('[create-order] Subtotal mismatch:', serverSubtotal, order.subtotal);
      return errRes(res, 400, 'Order totals mismatch. Please recreate the order.');
    }

    // Recalculate total server-side
    const tax = Number(order.tax) || 0;
    const shipping = Number(order.shipping) || 0;
    const discount = Number(order.discount) || 0;
    const serverTotal = Math.round((serverSubtotal + tax + shipping - discount) * 100) / 100;

    // Update the order with corrected totals
    await db.from('orders').update({
      subtotal: serverSubtotal,
      total: serverTotal,
    }).eq('id', order.id);

    // ── Step 4: Create Nomod hosted checkout session ──
    const siteUrl = process.env.PUBLIC_SITE_URL || 'https://pickoraonline.com';
    const storeName = process.env.PUBLIC_STORE_NAME || 'Pickora';

    // Build Nomod items array
    const nomodItems = order.order_items.map((item, index) => ({
      item_id: `item_${index + 1}`,
      name: item.name,
      quantity: item.quantity,
      unit_amount: Number(item.price).toFixed(2),
      discount_type: 'flat',
      discount_amount: '0.00',
      total_amount: (Number(item.price) * item.quantity).toFixed(2),
      net_amount: (Number(item.price) * item.quantity).toFixed(2),
    }));

    const checkout = await nomodCreateCheckout({
      referenceId: order.order_number,
      amount: serverTotal,
      currency: order.currency || 'AED',
      items: nomodItems,
      customer: {
        first_name: (order.shipping_name || '').split(' ')[0] || '',
        last_name: (order.shipping_name || '').split(' ').slice(1).join(' ') || '',
        email: user.email || '',
      },
      successUrl: `${siteUrl}/pages/checkout.html?payment=success&order=${order.order_number}`,
      failureUrl: `${siteUrl}/pages/checkout.html?payment=failed&order=${order.order_number}`,
      cancelledUrl: `${siteUrl}/pages/checkout.html?payment=cancelled&order=${order.order_number}`,
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        user_id: user.id,
      },
    });

    // ── Step 5: Store Nomod payment details on order ──
    const nomodCheckoutId = checkout.id || '';
    const checkoutUrl = checkout.url || '';

    await db.from('orders').update({
      nomad_order_id: nomodCheckoutId,
      nomad_checkout_url: checkoutUrl,
    }).eq('id', order.id);

    // Also create a payment record
    await db.from('payments').insert({
      order_id: order.id,
      nomad_payment_id: nomodCheckoutId,
      method: 'nomod',
      amount: serverTotal,
      currency: order.currency || 'AED',
      status: 'pending',
      raw_response: checkout,
    });

    // ── Step 6: Return checkout URL ──
    return jsonRes(res, 200, {
      checkout_url: checkoutUrl,
      order_number: order.order_number,
      nomod_checkout_id: nomodCheckoutId,
    });

  } catch (err) {
    console.error('[create-order] Error:', err);
    return errRes(res, 500, 'Internal server error');
  }
};
