'use strict';

/**
 * Input validation (zod) at the highest-risk boundaries — see docs/PRODUCTION-ROADMAP.md
 * Phase 5. This is layered ON TOP of the existing manual checks already in each route
 * (which stay as-is); it catches malformed/oversized input before it reaches a query,
 * not a replacement for the business-rule checks (enum membership, stock, etc.) that
 * already exist inline in each handler.
 */

const { z } = require('zod');

const emailSchema = z.string().trim().toLowerCase().email('Email non valida').max(255);

// HTML forms serialized with FormData send empty optional fields as "" (not undefined) —
// e.g. the admin gift-card form's blank recipient email. Treat "" as "not provided" so an
// optional email field doesn't 400 on the empty string.
const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  emailSchema.optional().nullable()
);

/* ── POST /api/auth/register ── */
const registerSchema = z.object({
  nome:     z.string().trim().min(1, 'Nome obbligatorio').max(120),
  // Optional at registration: the auth drawer collects it, but legacy/guest flows may omit it.
  cognome:  z.string().trim().max(120).optional().nullable(),
  email:    emailSchema,
  password: z.string().min(8, 'La password deve avere almeno 8 caratteri').max(200),
  // GDPR consents (checkboxes in the auth drawer); recorded with timestamps on customers
  privacy_consent:   z.coerce.boolean().optional(),
  marketing_consent: z.coerce.boolean().optional(),
  // Optional date of birth (YYYY-MM-DD) — powers the automated birthday email.
  // Empty string from a blank form field is treated as "not provided".
  birthday: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data di nascita non valida').optional().nullable()
  ),
});

/* ── POST /api/auth/login ── */
const loginSchema = z.object({
  email:    emailSchema,
  password: z.string().min(1, 'Password obbligatoria').max(200),
});

/* ── POST /api/orders ── */
const orderItemSchema = z.object({
  product_id: z.coerce.string().trim().min(1).max(100),
  taglia:     z.string().trim().max(20).optional().nullable(),
  colore:     z.string().trim().max(40).optional().nullable(),
  qty:        z.coerce.number().int().min(1).max(99),
});
const createOrderSchema = z.object({
  nome:            z.string().trim().min(1, 'Nome obbligatorio').max(120),
  cognome:         z.string().trim().min(1, 'Cognome obbligatorio').max(120),
  email:           emailSchema,
  telefono:        z.string().trim().max(40).optional().nullable(),
  indirizzo:       z.string().trim().min(1, 'Indirizzo obbligatorio').max(255),
  citta:           z.string().trim().min(1, 'Città obbligatoria').max(120),
  cap:             z.string().trim().min(1, 'CAP obbligatorio').max(20),
  paese:           z.string().trim().max(80).optional(),
  items:           z.array(orderItemSchema).min(1, 'Il carrello è vuoto').max(100),
  discount_code:   z.string().trim().max(60).optional().nullable(),
  gift_card_code:  z.string().trim().max(60).optional().nullable(),
  payment_method:  z.string().trim().max(20).optional(),
  // Shipping METHOD only — the price is resolved server-side (src/shipping-rates.js).
  // Loose string (not an enum) on purpose: an unknown value normalizes to 'standard'
  // rather than 400-ing a customer whose page predates a new method.
  shipping_method: z.string().trim().max(20).optional().nullable(),
  payment_intent_id: z.string().trim().max(255).optional().nullable(),
  // Generic transaction reference for non-Stripe providers (PayPal order id).
  // Stored in orders.payment_intent_id (UNIQUE → cross-provider replay protection).
  payment_reference: z.string().trim().max(255).optional().nullable(),
  // SumUp checkout id from the widget / 3DS-return path. MUST be declared here: validateBody
  // replaces req.body with the zod-parsed object (unknown keys stripped), so without this
  // field orders.js never saw the id and every SumUp order 402'd AFTER the customer paid.
  sumup_checkout_id: z.string().trim().max(64).optional().nullable(),
  // GDPR consents from the checkout page (privacy required client-side; newsletter optional)
  privacy_consent:  z.coerce.boolean().optional(),
  newsletter_optin: z.coerce.boolean().optional(),
});

/* ── POST /api/admin/discounts ── */
const createDiscountSchema = z.object({
  code:         z.string().trim().min(2).max(60),
  tipo:         z.enum(['percentuale', 'fisso', 'spedizione']),
  valore:       z.coerce.number().min(0).max(1000000),
  max_utilizzi: z.coerce.number().int().min(1).optional().nullable(),
  scadenza:     z.string().trim().max(30).optional().nullable(),
  stato:        z.enum(['attivo', 'disattivo', 'pianificato']).optional(),
  min_order:    z.coerce.number().min(0).optional(),
});

/* ── POST /api/admin/giftcards ── */
const createGiftcardSchema = z.object({
  initial_amount:  z.coerce.number().min(0.01, 'Importo non valido').max(100000),
  recipient_email: optionalEmail,
  note:            z.string().trim().max(255).optional().nullable(),
});

/* ── POST/PUT /api/products (admin) ──
   passthrough(): validates the critical fields without dropping extras
   (images, icon, alt_color, popularity...) that the route also accepts. */
const productBaseSchema = z.object({
  id:           z.string().trim().min(1).max(100),
  name:         z.string().trim().min(1).max(255),
  categoria:    z.string().trim().min(1).max(60),
  price:        z.coerce.number().min(0).max(1000000),
  original_price: z.coerce.number().min(0).max(1000000).optional().nullable(),
  discount_pct: z.coerce.number().min(0).max(100).optional(),
  status:       z.enum(['attivo', 'bozza', 'esaurito']).optional(),
  collections:  z.array(z.string().trim().max(60)).max(50).optional(),
  taglie:       z.array(z.object({
                  taglia: z.string().trim().min(1).max(20),
                  stock:  z.coerce.number().int().min(0).max(1000000).optional(),
                }).passthrough()).max(50).optional(),
}).passthrough();
const createProductSchema = productBaseSchema;
const updateProductSchema = productBaseSchema.partial();

/* ── POST/PUT /api/admin/campaigns ── */
const campaignSchema = z.object({
  nome:        z.string().trim().min(1).max(255),
  tipo:        z.enum(['email', 'ads', 'automazione', 'sms']).optional(),
  canale:      z.string().trim().max(100).optional().nullable(),
  budget:      z.coerce.number().min(0).max(100000000).optional(),
  destinatari: z.coerce.number().int().min(0).optional(),
  stato:       z.enum(['bozza', 'attiva', 'pianificata', 'conclusa']).optional(),
}).passthrough();
const updateCampaignSchema = campaignSchema.partial();

/* ── PUT /api/admin/discounts/:id ── */
const updateDiscountSchema = createDiscountSchema.partial().passthrough();

/* ── PUT /api/admin/giftcards/:id ── */
const updateGiftcardSchema = z.object({
  balance: z.coerce.number().min(0).max(100000).optional(),
  stato:   z.enum(['attiva', 'utilizzata', 'disattivata']).optional(),
  note:    z.string().trim().max(255).optional().nullable(),
}).passthrough();

/* ── POST/PUT /api/admin/staff ── */
const staffCreateSchema = z.object({
  email:    emailSchema,
  nome:     z.string().trim().min(1).max(120),
  password: z.string().min(8, 'Minimo 8 caratteri').max(200),
  role:     z.enum(['admin', 'staff']).optional(),
  permissions: z.array(z.string().max(40)).max(80).nullish(),   // granular RBAC (optional)
});
const staffUpdateSchema = z.object({
  email:    emailSchema.optional(),
  nome:     z.string().trim().min(1).max(120).optional(),
  password: z.string().min(8, 'Minimo 8 caratteri').max(200).optional().or(z.literal('').transform(() => undefined)),
  role:     z.enum(['admin', 'staff']).optional(),
  permissions: z.array(z.string().max(40)).max(80).nullish(),
}).passthrough();

/* ── POST /api/payments/create-intent ── */
const createIntentSchema = z.object({
  amount_cents: z.coerce.number().int().min(50, 'Importo minimo €0.50'),
  // Optional: restrict the intent to specific methods (e.g. the Klarna element needs a
  // klarna-only intent, otherwise the Payment Element surfaces every enabled method).
  payment_method_types: z.array(z.enum(['klarna', 'card'])).min(1).max(6).optional(),
  // Where SumUp returns the customer after payment / a 3DS redirect (validated server-side).
  return_url: z.string().url().max(500).optional(),
  // SumUp only: opt into Hosted Checkout (card entry on SumUp's page) instead of the widget.
  hosted: z.boolean().optional(),
});

/**
 * Express middleware factory. On success, req.body is REPLACED with the parsed/coerced
 * result (e.g. numeric strings become numbers) so downstream handlers can rely on types.
 * On failure, responds 400 with the first validation error message in Italian-friendly form.
 */
function validateBody(schema) {
  return function (req, res, next) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.issues[0];
      const field = first.path.join('.') || 'body';
      return res.status(400).json({ error: `Dato non valido (${field}): ${first.message}` });
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  validateBody,
  registerSchema,
  loginSchema,
  createOrderSchema,
  createDiscountSchema,
  createGiftcardSchema,
  createIntentSchema,
  createProductSchema,
  updateProductSchema,
  campaignSchema,
  updateCampaignSchema,
  updateDiscountSchema,
  updateGiftcardSchema,
  staffCreateSchema,
  staffUpdateSchema,
};
