/**
 * settings-schema.ts — human labels for `store_settings`.
 *
 * The Settings page used to render every row as a bare text input labelled with
 * its raw DB key (`company_vat`, `loyalty_earn_rate`, …). That is a developer
 * tool, not something a shop owner can fill in — and the company/fiscal block in
 * particular is a launch blocker, because the storefront footer and the
 * privacy / termini / cookie-policy pages read those exact keys.
 *
 * Keys listed here get a label, a type, help text and a group, and are ALWAYS
 * rendered even when the row doesn't exist yet (the PUT upserts). Anything in the
 * database that isn't listed still shows, under "Avanzate", exactly as before —
 * so nothing becomes uneditable just because this file doesn't know about it.
 */

export type SettingType = 'text' | 'textarea' | 'number' | 'email' | 'url' | 'boolean';

export interface SettingField {
  key: string;
  label: string;
  type?: SettingType;
  help?: string;
  placeholder?: string;
  /** Shown with a "richiesto per la pubblicazione" marker — legally required to go live. */
  legalRequired?: boolean;
}

export interface SettingGroup {
  id: string;
  title: string;
  description?: string;
  fields: SettingField[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: 'azienda',
    title: 'Dati aziendali e fiscali',
    description:
      'Pubblicati nel footer dello store e nelle pagine legali (privacy, termini, cookie policy). ' +
      'La legge italiana richiede ragione sociale, sede legale e partita IVA su un sito di e-commerce ' +
      '(D.Lgs 70/2003 art. 7; DPR 633/72 art. 35). Finché la P. IVA è vuota, lo store mostra un avviso al posto dei dati.',
    fields: [
      { key: 'company_legal_name', label: 'Ragione sociale', placeholder: 'Es. Memi Abbigliamento S.r.l.', legalRequired: true },
      { key: 'company_name', label: 'Nome commerciale', placeholder: 'Memi Abbigliamento', help: 'Il nome mostrato ai clienti, se diverso dalla ragione sociale.' },
      { key: 'company_vat', label: 'Partita IVA', placeholder: 'IT01234567890', legalRequired: true },
      { key: 'company_fiscal_code', label: 'Codice fiscale', placeholder: 'Se diverso dalla P. IVA' },
      { key: 'company_rea', label: 'Numero REA', placeholder: 'Es. MC-123456' },
      { key: 'company_share_capital', label: 'Capitale sociale', placeholder: 'Es. € 10.000 i.v.', help: 'Obbligatorio per le società di capitali.' },
      { key: 'company_address', label: 'Sede legale — indirizzo', placeholder: 'Via Roma 1', legalRequired: true },
      { key: 'company_cap', label: 'CAP', placeholder: '62012' },
      { key: 'company_city', label: 'Città', placeholder: 'Civitanova Marche' },
      { key: 'company_province', label: 'Provincia', placeholder: 'MC' },
      { key: 'company_country', label: 'Paese', placeholder: 'Italia' },
      { key: 'company_email', label: 'Email di contatto', type: 'email', placeholder: 'info@memi.testdemo.it', legalRequired: true },
      { key: 'company_pec', label: 'PEC', type: 'email', placeholder: 'memi@pec.it' },
      { key: 'company_phone', label: 'Telefono', placeholder: '+39 0733 000000' },
      { key: 'company_sdi', label: 'Codice destinatario SDI', placeholder: 'Es. ABCDEFG', help: 'Usato sulle fatture elettroniche emesse.' },
    ],
  },
  {
    id: 'store',
    title: 'Store',
    description: 'Identità e recapiti usati nelle email transazionali e nei documenti.',
    fields: [
      { key: 'store_name', label: 'Nome dello store', placeholder: 'Memi Abbigliamento' },
      { key: 'store_url', label: 'URL dello store', type: 'url', placeholder: 'https://memi.testdemo.it' },
      { key: 'store_email', label: 'Email mittente', type: 'email', placeholder: 'no-reply@memi.testdemo.it', help: 'Mostrata come mittente nelle email al cliente.' },
      { key: 'store_phone', label: 'Telefono assistenza' },
      { key: 'currency', label: 'Valuta', placeholder: 'EUR' },
    ],
  },
  {
    id: 'fatturazione',
    title: 'Fatturazione',
    fields: [
      { key: 'auto_invoice', label: 'Fattura automatica', type: 'boolean', help: '1 = emette una fattura alla prima transizione a "pagato". 0 = disattiva.' },
      { key: 'iva_sales_rate', label: 'Aliquota IVA vendite (%)', type: 'number', help: 'Usata per la stima della liquidazione IVA nella vista Tasse.' },
      { key: 'invoice_prefix', label: 'Prefisso numerazione', placeholder: 'F', help: 'Le fatture sono numerate PREFISSO-ANNO-NNNN.' },
    ],
  },
  {
    id: 'spedizioni',
    title: 'Spedizioni',
    description:
      'Attenzione: le tariffe effettive sono definite lato server in shipping-rates.js e nella vista Zone & Tariffe. ' +
      'Questi valori servono solo ai testi mostrati sullo store.',
    fields: [
      { key: 'free_shipping_threshold', label: 'Soglia spedizione gratuita (€)', type: 'number', help: 'Deve coincidere con FREE_SHIPPING_THRESHOLD nel backend.' },
      { key: 'shipping_note', label: 'Nota spedizioni', type: 'textarea' },
    ],
  },
  {
    id: 'loyalty',
    title: 'Fedeltà & Punti',
    description: 'Modificabili anche dalla vista Fedeltà & Punti, che mostra il calcolo in tempo reale.',
    fields: [
      { key: 'loyalty_enabled', label: 'Programma attivo', type: 'boolean' },
      { key: 'loyalty_earn_rate', label: 'Punti per € speso', type: 'number' },
      { key: 'loyalty_redeem_rate', label: 'Punti per € di sconto', type: 'number' },
      { key: 'loyalty_expiry_months', label: 'Scadenza punti (mesi)', type: 'number' },
    ],
  },
  {
    id: 'lifecycle',
    title: 'Email automatiche',
    description: 'Impostazioni delle campagne lifecycle. La vista Marketing → Email automatiche offre anteprima e invio di prova.',
    fields: [
      { key: 'lifecycle_send_hour', label: 'Ora di invio giornaliera', type: 'number', help: '0–23, ora locale del server.' },
      { key: 'lifecycle_winback_days', label: 'Giorni di inattività per win-back', type: 'number' },
      { key: 'lifecycle_points_min', label: 'Punti minimi per il promemoria', type: 'number' },
    ],
  },
];

/** Every key the schema knows about — used to split "note" from "avanzate". */
export const KNOWN_KEYS = new Set(SETTING_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
