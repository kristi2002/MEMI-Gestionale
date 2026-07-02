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
  email:    emailSchema,
  password: z.string().min(8, 'La password deve avere almeno 8 caratteri').max(200),
});

/* ── POST /api/auth/login ── */
const loginSchema = z.object({
  email:    emailSchema,
  password: z.string().min(1, 'Password obbligatoria').max(200),
});

/* ── POST /api/orders ── */
const orderItemSchema = z.object({
  product_id: z.string().trim().min(1).max(100),
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
  payment_intent_id: z.string().trim().max(255).optional().nullable(),
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

/* ── POST /api/payments/create-intent ── */
const createIntentSchema = z.object({
  amount_cents: z.coerce.number().int().min(50, 'Importo minimo €0.50'),
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
};
