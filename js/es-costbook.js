/* Exotic Splash Estimator v8 — material costbook (UMD).
 * verified_unit_cost = internal/worker cost (owner-only).
 * customer_material_price = separate materials-only customer charge (never overwrite either).
 * CONSUMABLE burns into job totals; REUSABLE_TOOL / EQUIPMENT excluded unless sellAsProduct.
 * QUOTE_REQUIRED blocks automatic quote completion until owner enters verified values.
 * Never expose costs, markup %, margin, profit, pay, or '+30%' to customer/employee.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EsCostbook = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COSTBOOK_VERSION = '8.0.0';
  const TYPES = Object.freeze({
    CONSUMABLE: 'CONSUMABLE',
    REUSABLE_TOOL: 'REUSABLE_TOOL',
    EQUIPMENT: 'EQUIPMENT',
    QUOTE_REQUIRED: 'QUOTE_REQUIRED',
  });
  const FLAGS = Object.freeze({
    ACCEPTANCE_BLOCK: 'ACCEPTANCE_BLOCK',
    DEPOSIT_BELOW_INTERNAL_MATERIAL_COST: 'DEPOSIT_BELOW_INTERNAL_MATERIAL_COST',
    WARNING_DEPOSIT_BELOW_CUSTOMER_MATERIAL_CHARGE: 'WARNING_DEPOSIT_BELOW_CUSTOMER_MATERIAL_CHARGE',
    DEPOSIT_COVERS_CUSTOMER_MATERIAL_CHARGE: 'DEPOSIT_COVERS_CUSTOMER_MATERIAL_CHARGE',
  });
  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const r2 = (v) => Math.round(n(v) * 100) / 100;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function normalizeType(raw) {
    const t = String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (t === 'CONSUMABLE') return TYPES.CONSUMABLE;
    if (t === 'REUSABLE_TOOL' || t === 'REUSABLE') return TYPES.REUSABLE_TOOL;
    if (t === 'EQUIPMENT' || t === 'EXCLUDED') return TYPES.EQUIPMENT;
    if (t === 'QUOTE_REQUIRED' || t.includes('QUOTE')) return TYPES.QUOTE_REQUIRED;
    return TYPES.CONSUMABLE;
  }

  function parseMoney(s) {
    if (s == null || s === '') return null;
    if (typeof s === 'number') return Number.isFinite(s) ? r2(s) : null;
    const t = String(s).trim();
    if (!t || /^n\/?a$/i.test(t) || t === '-' || t === '—') return null;
    const cleaned = t.replace(/[$,]/g, '').replace(/~/g, '').trim();
    if (!cleaned) return null;
    if (/[–-]/.test(cleaned) && !/^\d+(\.\d+)?$/.test(cleaned)) return null;
    const x = Number(cleaned);
    return Number.isFinite(x) ? r2(x) : null;
  }

  /** Load catalog object (already parsed JSON) or items array. */
  function loadCatalog(input) {
    if (!input) return { version: COSTBOOK_VERSION, items: [], counts: {} };
    if (Array.isArray(input)) return { version: COSTBOOK_VERSION, items: input.map(normalizeItem), counts: {} };
    const items = (input.items || []).map(normalizeItem);
    return Object.assign({}, input, { items, version: input.version || COSTBOOK_VERSION });
  }

  function normalizeItem(raw) {
    const verified = parseMoney(raw.verified_unit_cost);
    const customer = parseMoney(raw.customer_material_price);
    const type = normalizeType(raw.consumable_type);
    const quote_required = type === TYPES.QUOTE_REQUIRED || verified == null ||
      !!(raw.quote_required === true || String(raw.label || '').toUpperCase().includes('QUOTE REQUIRED'));
    return {
      id: String(raw.id || ''),
      category: String(raw.category || ''),
      product: String(raw.product || raw.label || raw.id || ''),
      supplier: String(raw.supplier || ''),
      unit_size: String(raw.unit_size || ''),
      verified_unit_cost: verified,
      customer_material_price: customer,
      coverage: String(raw.coverage || ''),
      notes: String(raw.notes || ''),
      label: String(raw.label || ''),
      consumable_type: type,
      quote_required: !!quote_required || (type === TYPES.QUOTE_REQUIRED),
      source: String(raw.source || ''),
      sells_as_product_default: !!raw.sells_as_product_default || type === TYPES.REUSABLE_TOOL,
      include_in_job_burn_default: type === TYPES.CONSUMABLE && verified != null,
    };
  }

  function indexById(catalog) {
    const map = Object.create(null);
    for (const it of (catalog.items || [])) if (it.id) map[it.id] = it;
    return map;
  }

  /**
   * Apply owner overrides for verified cost / customer price / coverage.
   * Never copies customer into verified or verified into customer.
   */
  function applyOverrides(item, override) {
    const out = clone(item);
    if (!override || typeof override !== 'object') return out;
    if (Object.prototype.hasOwnProperty.call(override, 'verified_unit_cost')) {
      out.verified_unit_cost = parseMoney(override.verified_unit_cost);
    }
    if (Object.prototype.hasOwnProperty.call(override, 'customer_material_price')) {
      out.customer_material_price = parseMoney(override.customer_material_price);
    }
    if (Object.prototype.hasOwnProperty.call(override, 'coverage')) {
      out.coverage = String(override.coverage == null ? '' : override.coverage);
    }
    if (out.consumable_type !== TYPES.QUOTE_REQUIRED) {
      out.quote_required = out.verified_unit_cost == null;
    } else {
      out.quote_required = out.verified_unit_cost == null;
    }
    return out;
  }

  /**
   * Should this selection burn into job material totals?
   * CONSUMABLE with verified cost: yes.
   * REUSABLE_TOOL / EQUIPMENT: no (unless sellAsProduct — then customer charge only, still not "burn" for deposit internal? 
   *   Spec: "tools may be customer sold separately with explicit flag, not auto burn".
   *   So sellAsProduct adds to customer_material_total but NOT internal burn / or both if sold?
   *   Interpretation: sellAsProduct means include customer price in customer_material_total;
   *   internal cost of a sold tool is included in internal_material_total only when sold (inventory leaves),
   *   but NOT auto-included as job consumable burn. We'll include both totals when sellAsProduct is set,
   *   and never auto-include tools without the flag.
   */
  function classifySelection(item, sel) {
    const type = item.consumable_type;
    const qty = Math.max(0, n(sel && sel.qty));
    const sellAsProduct = !!(sel && sel.sellAsProduct);
    const sell = sellAsProduct && qty > 0 && type !== TYPES.EQUIPMENT;
    /* CONSUMABLE always burns when verified; resolved QUOTE_REQUIRED also burns once priced. */
    const burn = (type === TYPES.CONSUMABLE || type === TYPES.QUOTE_REQUIRED) && item.verified_unit_cost != null && qty > 0;
    /* QUOTE_REQUIRED / missing verified block auto-quote until owner enters verified unit cost. */
    const unresolved = item.verified_unit_cost == null && qty > 0 && type !== TYPES.EQUIPMENT && type !== TYPES.REUSABLE_TOOL;
    const unresolvedToolSell = type === TYPES.REUSABLE_TOOL && sell && item.verified_unit_cost == null && qty > 0;
    return { type, qty, sellAsProduct: sell, burn, unresolved: unresolved || unresolvedToolSell,
      exclude: type === TYPES.EQUIPMENT || (type === TYPES.REUSABLE_TOOL && !sell) };
  }

  /**
   * Compute job material totals from selections against catalog (+ owner overrides).
   * @param {object} opts
   * @param {object} opts.catalog - loaded catalog
   * @param {array}  opts.selections - [{id, qty, sellAsProduct?}]
   * @param {object} [opts.overrides] - { [id]: {verified_unit_cost?, customer_material_price?, coverage?} }
   */
  function computeJobMaterials(opts) {
    const catalog = loadCatalog(opts && opts.catalog);
    const byId = indexById(catalog);
    const overrides = (opts && opts.overrides) || {};
    const selections = Array.isArray(opts && opts.selections) ? opts.selections : [];
    const lines = [];
    const excluded = [];
    const quoteRequiredUnresolved = [];
    let internal_material_total = 0;
    let customer_material_total = 0;
    let hasBurn = false;

    for (const sel of selections) {
      const id = String(sel && sel.id || '');
      const base = byId[id];
      if (!base) {
        quoteRequiredUnresolved.push({ id, product: id || '(unknown)', reason: 'catalog_id_missing' });
        continue;
      }
      const item = applyOverrides(base, overrides[id]);
      const cls = classifySelection(item, sel);
      const lineBase = {
        id: item.id,
        product: item.product,
        category: item.category,
        unit_size: item.unit_size,
        consumable_type: item.consumable_type,
        qty: cls.qty,
        coverage: item.coverage,
        sellAsProduct: !!cls.sellAsProduct,
      };

      if (cls.unresolved) {
        quoteRequiredUnresolved.push({
          id: item.id,
          product: item.product,
          consumable_type: item.consumable_type,
          qty: cls.qty,
          reason: 'QUOTE_REQUIRED_or_missing_verified_unit_cost',
        });
        lines.push(Object.assign({}, lineBase, {
          included_in_burn: false,
          verified_unit_cost: null,
          customer_material_price: null,
          internal_line_total: null,
          customer_line_total: null,
          quote_required: true,
        }));
        continue;
      }

      if (cls.exclude && !cls.sellAsProduct) {
        excluded.push(Object.assign({}, lineBase, {
          reason: item.consumable_type === TYPES.EQUIPMENT ? 'EQUIPMENT_excluded_from_job_burn' : 'REUSABLE_TOOL_excluded_from_job_burn',
        }));
        continue;
      }

      const internalUnit = item.verified_unit_cost;
      const customerUnit = item.customer_material_price;
      const internalLine = internalUnit == null ? null : r2(internalUnit * cls.qty);
      const customerLine = customerUnit == null ? null : r2(customerUnit * cls.qty);

      if (cls.burn || cls.sellAsProduct) {
        if (internalLine != null) { internal_material_total = r2(internal_material_total + internalLine); hasBurn = true; }
        if (customerLine != null) customer_material_total = r2(customer_material_total + customerLine);
        lines.push(Object.assign({}, lineBase, {
          included_in_burn: !!cls.burn,
          verified_unit_cost: internalUnit,
          customer_material_price: customerUnit,
          internal_line_total: internalLine,
          customer_line_total: customerLine,
          quote_required: false,
        }));
      }
    }

    const complete = quoteRequiredUnresolved.length === 0;
    return {
      costbookVersion: COSTBOOK_VERSION,
      lines,
      excluded,
      quoteRequiredUnresolved,
      internal_material_total: r2(internal_material_total),
      customer_material_total: r2(customer_material_total),
      hasMaterialLines: hasBurn || lines.some(l => l.customer_line_total != null),
      complete,
      sales_tax: 'EXCLUDED_ADD_WHEN_KNOWN',
      payment_fees: 'EXCLUDED_ADD_WHEN_KNOWN',
      disclaimer: 'Materials only — excludes labor; not an installed quote. Sales tax and payment fees excluded until known.',
    };
  }

  /**
   * Deposit / payment vs material totals.
   * payment < internal → hard ACCEPTANCE_BLOCK / DEPOSIT_BELOW_INTERNAL_MATERIAL_COST
   * >= internal but < customer → WARNING_DEPOSIT_BELOW_CUSTOMER_MATERIAL_CHARGE
   * >= customer → DEPOSIT_COVERS_CUSTOMER_MATERIAL_CHARGE
   */
  function evaluateDeposit(payment, materials) {
    const pay = r2(payment);
    const internal = r2(materials && materials.internal_material_total);
    const customer = r2(materials && materials.customer_material_total);
    const codes = [];
    let flag = FLAGS.DEPOSIT_COVERS_CUSTOMER_MATERIAL_CHARGE;
    let acceptanceBlocked = false;

    if (!materials || (internal <= 0 && customer <= 0 && !(materials.lines || []).length)) {
      // No material selections — payment check N/A (not a block).
      return {
        payment: pay,
        internal_material_total: internal,
        customer_material_total: customer,
        flag: 'DEPOSIT_CHECK_NOT_APPLICABLE',
        codes: ['NO_MATERIAL_SELECTIONS'],
        acceptanceBlocked: false,
        minimum_deposit: internal,
        recommended_deposit: customer,
      };
    }

    if (pay + 0.005 < internal) {
      acceptanceBlocked = true;
      flag = FLAGS.ACCEPTANCE_BLOCK;
      codes.push(FLAGS.ACCEPTANCE_BLOCK, FLAGS.DEPOSIT_BELOW_INTERNAL_MATERIAL_COST);
    } else if (pay + 0.005 < customer) {
      flag = FLAGS.WARNING_DEPOSIT_BELOW_CUSTOMER_MATERIAL_CHARGE;
      codes.push(FLAGS.WARNING_DEPOSIT_BELOW_CUSTOMER_MATERIAL_CHARGE);
    } else {
      flag = FLAGS.DEPOSIT_COVERS_CUSTOMER_MATERIAL_CHARGE;
      codes.push(FLAGS.DEPOSIT_COVERS_CUSTOMER_MATERIAL_CHARGE);
    }

    return {
      payment: pay,
      internal_material_total: internal,
      customer_material_total: customer,
      flag,
      codes,
      acceptanceBlocked,
      minimum_deposit: internal,
      recommended_deposit: customer,
    };
  }

  /** Owner-only full material + deposit view (includes costs). */
  function ownerMaterialSnapshot(materials, deposit) {
    return {
      internal_material_total: materials.internal_material_total,
      customer_material_total: materials.customer_material_total,
      lines: (materials.lines || []).map(l => ({
        id: l.id, product: l.product, category: l.category, qty: l.qty,
        consumable_type: l.consumable_type, unit_size: l.unit_size, coverage: l.coverage,
        included_in_burn: !!l.included_in_burn, sellAsProduct: !!l.sellAsProduct,
        verified_unit_cost: l.verified_unit_cost, customer_material_price: l.customer_material_price,
        internal_line_total: l.internal_line_total, customer_line_total: l.customer_line_total,
        quote_required: !!l.quote_required,
      })),
      excluded: materials.excluded || [],
      quoteRequiredUnresolved: materials.quoteRequiredUnresolved || [],
      complete: !!materials.complete,
      sales_tax: materials.sales_tax,
      payment_fees: materials.payment_fees,
      disclaimer: materials.disclaimer,
      deposit: deposit || null,
    };
  }

  /**
   * Employee-safe: quantities + customer material charge totals only.
   * No verified_unit_cost, no internal totals, no markup, no +30%.
   */
  function staffMaterialSnapshot(materials, deposit) {
    const dep = deposit ? {
      flag: deposit.flag,
      codes: (deposit.codes || []).filter(c => c !== FLAGS.DEPOSIT_BELOW_INTERNAL_MATERIAL_COST),
      acceptanceBlocked: !!deposit.acceptanceBlocked,
      payment: deposit.payment,
      // Employee may see ACCEPTANCE_BLOCK + customer material charge / recommended deposit,
      // but NOT internal material total or the internal-threshold code name.
      customer_material_total: deposit.customer_material_total,
      recommended_deposit: deposit.recommended_deposit,
      // minimum_deposit equals internal — omit the dollar amount for employees; keep boolean blocked.
    } : null;
    return {
      customer_material_total: materials.customer_material_total,
      lines: (materials.lines || []).map(l => ({
        id: l.id, product: l.product, category: l.category, qty: l.qty,
        consumable_type: l.consumable_type, unit_size: l.unit_size,
        included_in_burn: !!l.included_in_burn, sellAsProduct: !!l.sellAsProduct,
        customer_material_price: l.customer_material_price,
        customer_line_total: l.customer_line_total,
        quote_required: !!l.quote_required,
      })),
      quoteRequiredUnresolved: (materials.quoteRequiredUnresolved || []).map(q => ({
        id: q.id, product: q.product, qty: q.qty, reason: 'quote_required',
      })),
      complete: !!materials.complete,
      sales_tax: materials.sales_tax,
      payment_fees: materials.payment_fees,
      disclaimer: materials.disclaimer,
      deposit: dep,
    };
  }

  /**
   * Customer-safe: optional materials-only charge. Never costs/markup/margin/+30%/internal.
   */
  function customerMaterialSnapshot(materials, opts) {
    const show = !!(opts && opts.includeCustomerMaterialCharge);
    if (!show) {
      return {
        shown: false,
        disclaimer: 'Material line items are available on request. Labor and installation are quoted separately.',
      };
    }
    return {
      shown: true,
      customer_material_total: materials.customer_material_total,
      lines: (materials.lines || [])
        .filter(l => l.customer_line_total != null && !l.quote_required)
        .map(l => ({
          product: l.product,
          qty: l.qty,
          unit_size: l.unit_size,
          customer_material_price: l.customer_material_price,
          customer_line_total: l.customer_line_total,
        })),
      sales_tax: 'EXCLUDED_ADD_WHEN_KNOWN',
      payment_fees: 'EXCLUDED_ADD_WHEN_KNOWN',
      disclaimer: 'Materials only — excludes labor; not an installed quote. Sales tax and payment processing fees are excluded until known.',
    };
  }

  /** Keys that must never appear in customer or employee payloads. */
  const FORBIDDEN_CUSTOMER_KEYS = [
    'verified_unit_cost', 'internal_material_total', 'internal_line_total',
    'markup', 'markupPct', 'markup_pct', 'margin', 'profit', 'cost',
    '+30%', '30%', 'worker_cost', 'internal_cost',
  ];

  function assertNoLeakage(obj, label) {
    const s = JSON.stringify(obj || {});
    const hits = [];
    for (const k of FORBIDDEN_CUSTOMER_KEYS) {
      if (k === '30%' || k === '+30%') {
        if (/\+?\s*30\s*%/.test(s) && /markup|margin|cost|internal/i.test(s)) hits.push(k);
      } else if (new RegExp('"' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:').test(s)) {
        hits.push(k);
      }
    }
    if (/DEPOSIT_BELOW_INTERNAL_MATERIAL_COST/.test(s) && /"internal_material_total"\s*:/.test(s) === false) {
      // code name alone in employee deposit.codes when blocked is OK; internal total must stay absent
    }
    return { ok: hits.length === 0, hits, label: label || 'payload' };
  }

  /**
   * Resolve costbook block for a job + catalog.
   * job.costbook = { selections, overrides?, includeCustomerMaterialCharge?, depositOrPayment? }
   * payment falls back to job.paid / job.depositOrPayment
   */
  function resolveForJob(job, catalog) {
    const cb = (job && job.costbook) || {};
    const materials = computeJobMaterials({
      catalog,
      selections: cb.selections || [],
      overrides: cb.overrides || {},
    });
    const payment = cb.depositOrPayment != null ? cb.depositOrPayment
      : (job && job.depositOrPayment != null ? job.depositOrPayment
        : (job && job.paid != null ? job.paid : 0));
    const deposit = evaluateDeposit(payment, materials);
    const quoteBlockedByCostbook = !materials.complete && (cb.selections || []).length > 0;
    return {
      materials,
      deposit,
      acceptanceBlocked: !!deposit.acceptanceBlocked,
      quoteBlockedByCostbook,
      includeCustomerMaterialCharge: !!cb.includeCustomerMaterialCharge,
    };
  }

  return {
    COSTBOOK_VERSION, TYPES, FLAGS, FORBIDDEN_CUSTOMER_KEYS,
    n, r2, parseMoney, normalizeType, loadCatalog, normalizeItem, indexById,
    applyOverrides, classifySelection, computeJobMaterials, evaluateDeposit,
    ownerMaterialSnapshot, staffMaterialSnapshot, customerMaterialSnapshot,
    assertNoLeakage, resolveForJob,
  };
});
