/**
 * api/send-email.js — Vercel Serverless Function
 *
 * Sends transactional emails via Resend API.
 * No-ops gracefully if RESEND_API_KEY is not set.
 *
 * POST /api/send-email
 * Body: { to, subject, template, data }
 */
const { getSupabase, sendEmail, renderTemplate, jsonRes, errRes } = require('./_lib');
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.PUBLIC_SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return jsonRes(res, 200, { ok: true });
  if (req.method !== 'POST') return errRes(res, 405, 'Method not allowed');

  try {
    const { to, subject, template, data } = req.body || {};

    if (!to || !subject) {
      return errRes(res, 400, 'to and subject are required');
    }

    let html = '';

    if (template) {
      // Load template file
      const templatePath = path.join(__dirname, '..', 'emails', template);
      try {
        const templateContent = fs.readFileSync(templatePath, 'utf-8');
        html = renderTemplate(templateContent, data || {});
      } catch (e) {
        return errRes(res, 400, 'Template not found: ' + template);
      }
    } else if (req.body.html) {
      html = req.body.html;
    } else {
      return errRes(res, 400, 'Either template or html is required');
    }

    const result = await sendEmail({ to, subject, html });
    return jsonRes(res, 200, result);

  } catch (err) {
    console.error('[send-email] Error:', err);
    return errRes(res, 500, 'Internal server error');
  }
};
