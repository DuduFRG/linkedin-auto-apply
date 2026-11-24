/**
 * Form field extraction and filling for the Easy Apply modal.
 *
 * extractFields(container) -> Field[]
 *   Field = {
 *     type: 'text' | 'textarea' | 'number' | 'date' | 'typeahead' | 'select' | 'radio' | 'checkboxes' | 'checkbox',
 *     family, key, label, required, options: string[], hasValue, currentValue, error,
 *     el, optionEls, group
 *   }
 * fillField(field, value) -> { ok, reason? }
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const { D, T, SEL } = LAA;
  const M = LAA.I18n.msg;

  const SKIP_INPUT_TYPES = new Set(['hidden', 'file', 'submit', 'button', 'reset', 'image', 'search']);
  const COVER_LETTER = /cover|carta|lettre|anschreiben|motivation|presentaci[oó]n|apresenta[cç][aã]o/i;
  const GROUP_SELECTOR = SEL.formElement.join(', ');

  function labelText(node) {
    if (!node) return '';
    const hidden = node.querySelector && node.querySelector('[aria-hidden="true"]');
    const preferred = hidden ? T.cleanLabel(hidden.innerText || hidden.textContent) : '';
    if (preferred.length >= 3) return preferred;
    return T.cleanLabel(node.innerText || node.textContent);
  }

  function rawLabelText(node) {
    return node ? String(node.innerText || node.textContent || '') : '';
  }

  function groupOf(el) {
    return el.closest(GROUP_SELECTOR) || el.closest('fieldset') || el.parentElement;
  }

  function findLabelNode(el, container) {
    if (el.id) {
      const escaped = root.CSS && root.CSS.escape ? root.CSS.escape(el.id) : el.id;
      const byFor = container.querySelector(`label[for="${escaped}"]`) || el.getRootNode().querySelector(`label[for="${escaped}"]`);
      if (byFor) return byFor;
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const node = labelledBy
        .split(/\s+/)
        .map((id) => (el.getRootNode().getElementById ? el.getRootNode().getElementById(id) : document.getElementById(id)))
        .find(Boolean);
      if (node) return node;
    }
    const wrapping = el.closest('label');
    if (wrapping) return wrapping;
    const group = groupOf(el);
    if (group) return group.querySelector('label, legend, .fb-dash-form-element__label');
    return null;
  }

  function labelFor(el, container) {
    const node = findLabelNode(el, container);
    const fromNode = labelText(node);
    if (fromNode) return { label: fromNode, raw: rawLabelText(node) };
    const aria = T.cleanLabel(el.getAttribute('aria-label'));
    if (aria) return { label: aria, raw: el.getAttribute('aria-label') };
    const placeholder = T.cleanLabel(el.getAttribute('placeholder'));
    return { label: placeholder, raw: placeholder };
  }

  function isRequired(el, rawLabel, group) {
    if (el.required || el.getAttribute('aria-required') === 'true') return true;
    if (/\*/.test(rawLabel)) return true;
    if (/\b(required|obrigat[oó]rio|obligatorio)\b/i.test(rawLabel)) return true;
    return !!(group && group.querySelector('.fb-dash-form-element__label--required, [data-test-required]'));
  }

  function errorFor(group, controls) {
    if (!group) return '';
    const own = errorTexts(group)[0];
    if (own) return own;
    // Some layouts mark the control itself and point to the message.
    const invalid = (controls || []).find((c) => c.getAttribute && c.getAttribute('aria-invalid') === 'true');
    if (invalid) {
      const ids = (invalid.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const rootNode = invalid.getRootNode();
      const msg = ids.map((id) => (rootNode.getElementById ? rootNode.getElementById(id) : null)).filter(Boolean).map((n) => D.text(n)).join(' ');
      return msg || 'Campo obrigatório';
    }
    return '';
  }

  /**
   * Visible text of one option (radio / checkbox). Newer LinkedIn markup puts the
   * QUESTION in the input's aria-label, leaves the <label> empty and writes the
   * option in a sibling <p>, so the label element and the aria-label are not
   * trusted on their own: the option is the text of the smallest block around
   * the input that holds no other option. The browser default value "on" is
   * never an option name.
   */
  function optionLabel(input) {
    const node = findLabelNode(input, document);
    const fromLabel = node && node.tagName === 'LABEL' ? labelText(node) : '';
    if (fromLabel) return fromLabel;

    const isOptionControl = (el) => el !== input && el.matches('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]');
    let block = input.parentElement;
    for (let depth = 0; block && depth < 5; depth += 1) {
      if (Array.from(block.querySelectorAll('input, [role="radio"], [role="checkbox"]')).some(isOptionControl)) break;
      const t = labelText(block);
      if (t) return t;
      block = block.parentElement;
    }

    const value = String(input.value || '').trim();
    if (value && value.toLowerCase() !== 'on') return value;
    return T.cleanLabel(input.getAttribute('aria-label'));
  }

  const FOLLOW_TEXT = /\b(follow|seguir|siga|suivre|folgen)\b/;

  /**
   * The "Follow <company>" checkbox of the review step. Older markup gives it a
   * stable id; the newer one uses generated ids, so its text is checked too.
   */
  function isFollowCompany(el) {
    if (SEL.followCompany.some((sel) => el.matches(sel))) return true;
    if (!el.matches('input[type="checkbox"], [role="checkbox"]')) return false;
    const text = T.normalize(`${optionLabel(el)} ${el.getAttribute('aria-label') || ''} ${el.name || ''} ${el.id || ''}`);
    return FOLLOW_TEXT.test(text) || /follow.?company/.test(text);
  }

  function findFollowCompany(scope) {
    return deep(scope, 'input[type="checkbox"], [role="checkbox"]').find(isFollowCompany) || null;
  }

  function excluded(el) {
    if (el.closest(SEL.resumeArea)) return true;
    return isFollowCompany(el);
  }

  /** Deep query inside the dialog (also inside nested shadow roots / frames), visible or not. */
  function deep(scope, sel) {
    return D.all(sel, scope, { visible: false });
  }

  /** Lowest element containing every node in the list. */
  function commonAncestor(nodes) {
    if (!nodes.length) return null;
    let anc = nodes[0].parentElement;
    while (anc && !nodes.every((n) => anc.contains(n))) anc = anc.parentElement;
    return anc;
  }

  const ERROR_TEXT = /(obrigat[oó]rio|required|obligatorio|requerido|please (enter|select|make)|enter a (valid|whole|decimal)|insira um|informe um|introduce un|ingresa un|n[uú]mero (inteiro|entero)|whole number|invalid|inv[aá]lid)/i;

  /** Validation messages inside a scope: known classes, alerts, or short red-flag sentences. */
  function errorTexts(scope) {
    if (!scope) return [];
    const out = [];
    const push = (t) => {
      const v = String(t || '').trim();
      if (v && v.length < 160 && !out.includes(v)) out.push(v);
    };
    D.all(SEL.fieldError, scope).forEach((e) => push(D.text(e)));
    D.all('[role="alert"], [aria-live="assertive"], [id*="error" i], [class*="error" i]', scope).forEach((e) => {
      const t = D.text(e);
      if (ERROR_TEXT.test(t)) push(t);
    });
    if (!out.length) {
      D.all('span, p, div', scope).forEach((e) => {
        if (e.childElementCount > 1) return;
        const t = D.text(e);
        if (t.length < 90 && ERROR_TEXT.test(t) && !e.closest('label, legend, button, option, select')) push(t);
      });
    }
    return out;
  }

  /**
   * The question text for a group of controls: aria labelling, a legend, or the
   * nearest text block that precedes the group (and is not one of its options).
   */
  function questionText(group, optionTexts) {
    if (!group) return { label: '', raw: '' };
    const lb = group.getAttribute && group.getAttribute('aria-labelledby');
    if (lb) {
      const rootNode = group.getRootNode();
      const node = lb
        .split(/\s+/)
        .map((id) => (rootNode.getElementById ? rootNode.getElementById(id) : null))
        .find(Boolean);
      if (node && labelText(node)) return { label: labelText(node), raw: rawLabelText(node) };
    }
    const aria = group.getAttribute && group.getAttribute('aria-label');
    if (aria && T.cleanLabel(aria)) return { label: T.cleanLabel(aria), raw: aria };
    const legend = group.querySelector && group.querySelector('legend');
    if (legend && labelText(legend)) return { label: labelText(legend), raw: rawLabelText(legend) };

    const isOption = (t) => optionTexts.some((o) => T.normalize(o) === T.normalize(t));
    // Walk outwards from the controls: the closest preceding text block is the question.
    // A sibling that holds its own controls belongs to another field and stops the search.
    let node = group;
    for (let depth = 0; node && depth < 7; depth += 1) {
      let prev = node.previousElementSibling;
      while (prev) {
        if (prev.matches('input, select, textarea') || prev.querySelector('input, select, textarea, [role="radio"], [role="checkbox"]')) {
          return { label: '', raw: '' };
        }
        const t = labelText(prev);
        if (t && !isOption(t) && !ERROR_TEXT.test(t) && t.length < 400) return { label: t, raw: rawLabelText(prev) };
        prev = prev.previousElementSibling;
      }
      node = node.parentElement;
      if (!node || node.matches('form, dialog, [role="dialog"]')) break;
    }
    return { label: '', raw: '' };
  }

  function build(base) {
    const field = { ...base };
    field.family = T.familyOf(field.type);
    field.key = T.questionKey(field.type, field.label);
    return field;
  }

  function fromControl(el, container) {
    const tag = el.tagName;
    const group = groupOf(el);
    const { label, raw } = labelFor(el, container);

    if (tag === 'SELECT') {
      const opts = Array.from(el.options).filter((o) => !T.isPlaceholderOption(o.textContent, o.value));
      const selected = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      const hasValue = !!selected && !T.isPlaceholderOption(selected.textContent, selected.value);
      return build({
        type: 'select',
        label,
        required: isRequired(el, raw, group),
        options: opts.map((o) => T.cleanLabel(o.textContent)),
        optionEls: opts,
        hasValue,
        currentValue: hasValue ? T.cleanLabel(selected.textContent) : null,
        error: errorFor(group),
        el,
        group,
      });
    }

    if (tag === 'TEXTAREA') {
      return build({
        type: 'textarea',
        label,
        required: isRequired(el, raw, group),
        options: [],
        hasValue: el.value.trim() !== '',
        currentValue: el.value,
        error: errorFor(group),
        el,
        group,
      });
    }

    const type = el.getAttribute('role') === 'checkbox' ? 'checkbox' : (el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox') {
      return build({
        type: 'checkbox',
        label,
        required: isRequired(el, raw, group),
        options: [],
        optionEls: [el],
        hasValue: isChecked(el),
        currentValue: isChecked(el) ? 'yes' : 'no',
        error: errorFor(group),
        el,
        group,
      });
    }

    const isTypeahead = el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list';
    let fieldType = 'text';
    if (isTypeahead) fieldType = 'typeahead';
    else if (type === 'number' || /numeric/i.test(el.id || '')) fieldType = 'number';
    else if (type === 'date') fieldType = 'date';

    return build({
      type: fieldType,
      label,
      required: isRequired(el, raw, group),
      options: [],
      hasValue: String(el.value || '').trim() !== '',
      currentValue: el.value,
      error: errorFor(group),
      el,
      group,
    });
  }

  /** Text referenced by aria-describedby, when it is not a validation message. */
  function describedBy(el) {
    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    const rootNode = el.getRootNode();
    const t = T.cleanLabel(
      ids.map((id) => (rootNode.getElementById ? rootNode.getElementById(id) : null)).filter(Boolean).map((n) => D.text(n)).join(' ')
    );
    return t && !ERROR_TEXT.test(t) ? t : '';
  }

  /**
   * Last resort for a required question whose text cannot be found: name it by its
   * options, so it is still asked (and saved) instead of silently blocking the step.
   */
  function optionsLabel(options) {
    return `${M('unlabeledQuestion')}: ${options.slice(0, 6).join(' / ')}`;
  }

  /** Error for a group of controls, also looking at the message right after it. */
  function errorNear(group, controls) {
    const inside = errorFor(group, controls);
    if (inside) return inside;
    // The message often sits right after the controls; never look into the next field.
    let sib = group && group.nextElementSibling;
    for (let i = 0; sib && i < 2; i += 1) {
      if (sib.querySelector('input, select, textarea, [role="radio"], [role="checkbox"]')) break;
      const t = errorTexts(sib)[0];
      if (t) return t;
      sib = sib.nextElementSibling;
    }
    return '';
  }

  function textOfOption(el) {
    if (el.tagName === 'INPUT') return optionLabel(el);
    return T.cleanLabel(el.getAttribute('aria-label')) || labelText(el);
  }

  function isChecked(el) {
    return el.tagName === 'INPUT' ? el.checked : el.getAttribute('aria-checked') === 'true';
  }

  /** The block that shows one option (its control plus its text), without any other option inside. */
  function optionRow(input) {
    const isOther = (el) => el !== input && el.matches('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]');
    let row = input.parentElement || input;
    let node = row;
    for (let depth = 0; node && depth < 5; depth += 1) {
      if (Array.from(node.querySelectorAll('input, [role="radio"], [role="checkbox"]')).some(isOther)) break;
      row = node;
      if (labelText(node)) break;
      node = node.parentElement;
    }
    return row;
  }

  /** When every option carries the same aria-label that is not an option name, that label is the question. */
  function sharedAriaQuestion(controls, options) {
    const labels = controls.map((c) => T.cleanLabel(c.getAttribute('aria-label')));
    if (!labels[0] || !labels.every((l) => l === labels[0])) return null;
    if (options.some((o) => T.normalize(o) === T.normalize(labels[0]))) return null;
    // Keep the visible text (with its "*") when it says the same thing, for the required flag.
    return { label: labels[0], raw: labels[0] };
  }

  /** A radio question from its option controls (native inputs or role="radio" widgets). */
  function radioField(radios, container) {
    const options = radios.map(textOfOption);
    const fs = radios[0].closest('fieldset, [role="radiogroup"]');
    const group = fs && radios.every((r) => fs.contains(r)) ? fs : commonAncestor(radios) || radios[0].parentElement;
    const visible = questionText(group, options);
    let { label, raw } = sharedAriaQuestion(radios, options) || visible;
    // The "*" that marks a required question lives in the visible text, not in the aria-label.
    raw = `${raw} ${visible.raw}`;
    if (!label && fs) label = T.cleanLabel(fs.getAttribute('aria-label'));
    if (!label) label = optionsLabel(options);
    const checked = radios.find(isChecked);
    return build({
      type: 'radio',
      label,
      required:
        isRequired(radios[0], raw, group) ||
        (group.getAttribute && group.getAttribute('aria-required') === 'true') ||
        /\*/.test(String(raw)),
      options,
      optionEls: radios,
      hasValue: !!checked,
      currentValue: checked ? textOfOption(checked) : null,
      error: errorNear(group, radios),
      el: radios[0],
      group,
    });
  }

  /** Extracts every answerable field inside the Easy Apply modal. */
  function extractFields(container) {
    const fields = [];
    const handled = new Set();
    const pushField = (field, controls) => {
      controls.forEach((c) => handled.add(c));
      if (field && field.label) fields.push(field);
    };

    // 1. Radio questions: native inputs grouped by name, or role="radio" widgets grouped by radiogroup.
    const byGroup = new Map();
    deep(container, 'input[type="radio"], [role="radio"]').forEach((el) => {
      if (excluded(el) || el.disabled) return;
      const box = el.closest('fieldset, [role="radiogroup"]');
      const key = el.tagName === 'INPUT' && el.name ? `name:${el.name}` : box || el.parentElement;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(el);
    });
    byGroup.forEach((radios) => {
      const anyVisible = radios.some((r) => D.isVisible(r) || D.isVisible(findLabelNode(r, container) || r) || D.isVisible(r.parentElement));
      if (!anyVisible) return;
      pushField(radioField(radios, container), radios);
    });

    // 2. Checkbox groups: inside a fieldset / group, sharing a name, or listed as sibling rows.
    const checkboxGroup = (checks, groupEl) => {
      const options = checks.map(textOfOption);
      const group = groupEl || commonAncestor(checks) || checks[0].parentElement;
      const visible = questionText(group, options);
      const shared = sharedAriaQuestion(checks, options);
      const label = shared ? shared.label : visible.label;
      const raw = `${shared ? shared.raw : ''} ${visible.raw}`;
      const checked = checks.filter(isChecked).map(textOfOption);
      pushField(
        build({
          type: 'checkboxes',
          label,
          required:
            isRequired(checks[0], raw, group) ||
            (group.getAttribute && group.getAttribute('aria-required') === 'true') ||
            /\*/.test(String(raw)),
          options,
          optionEls: checks,
          hasValue: checked.length > 0,
          currentValue: checked,
          error: errorNear(group, checks),
          el: checks[0],
          group,
        }),
        checks
      );
    };
    const freeChecks = () =>
      deep(container, 'input[type="checkbox"], [role="checkbox"]').filter((c) => !handled.has(c) && !excluded(c) && !c.disabled);

    deep(container, 'fieldset, [role="group"]').forEach((fs) => {
      if (excluded(fs) || !D.isVisible(fs)) return;
      const checks = freeChecks().filter((c) => fs.contains(c));
      if (checks.length >= 2) checkboxGroup(checks, fs);
    });
    const byName = new Map();
    freeChecks().forEach((c) => {
      if (c.tagName !== 'INPUT' || !c.name) return;
      if (!byName.has(c.name)) byName.set(c.name, []);
      byName.get(c.name).push(c);
    });
    byName.forEach((checks) => {
      if (checks.length >= 2) checkboxGroup(checks, null);
    });
    // Rows of options under one list: group checkboxes whose option rows share a parent.
    const byList = new Map();
    const loose = freeChecks();
    loose.forEach((c) => {
      // The list is the closest ancestor of the option row that also holds another loose checkbox.
      let list = optionRow(c).parentElement;
      for (let depth = 0; list && depth < 6 && loose.filter((o) => list.contains(o)).length < 2; depth += 1) list = list.parentElement;
      if (!list || loose.filter((o) => list.contains(o)).length < 2) return;
      if (!byList.has(list)) byList.set(list, []);
      byList.get(list).push(c);
    });
    byList.forEach((checks, list) => {
      if (checks.length >= 2) checkboxGroup(checks, list);
    });

    // 3. File uploads (cover letter and the like). The resume picker is handled separately.
    deep(container, 'input[type="file"]').forEach((el) => {
      if (excluded(el) || el.disabled) return;
      handled.add(el);
      const near = questionText(el, []);
      const own = labelFor(el, container);
      const block = labelText(el.closest('[data-test-form-element], .fb-dash-form-element') || el.parentElement) || '';
      const label = own.label || near.label || block || 'Arquivo';
      const context = `${own.label} ${near.label} ${block} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('name') || ''} ${el.id}`;
      const field = build({
        type: 'file',
        label,
        required: el.required || el.getAttribute('aria-required') === 'true' || /\*/.test(`${own.raw} ${near.raw}`),
        options: [],
        hasValue: !!(el.files && el.files.length),
        currentValue: el.files && el.files.length ? el.files[0].name : '',
        error: errorNear(el.parentElement, [el]),
        el,
        group: el.parentElement,
      });
      field.kind = COVER_LETTER.test(context) ? 'coverLetter' : 'other';
      fields.push(field);
    });

    // 4. Everything else: text, number, date, typeahead, select, textarea, single checkbox.
    deep(container, 'input, select, textarea, [role="checkbox"]').forEach((el) => {
      if (handled.has(el) || excluded(el)) return;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (el.tagName === 'INPUT' && SKIP_INPUT_TYPES.has(type)) return;
      if (type === 'radio') return;
      if (el.disabled || el.readOnly) return;

      // Checkbox inputs are often visually hidden; their label is what's visible.
      const target = type === 'checkbox' || el.getAttribute('role') === 'checkbox' ? findLabelNode(el, container) || el : el;
      if (!D.isVisible(target) && !D.isVisible(el) && !D.isVisible(el.parentElement)) return;

      const field = fromControl(el, container);
      if (field && !field.label) {
        const q = questionText(el, []);
        field.label = q.label;
        field.key = T.questionKey(field.type, field.label);
        if (/\*\s*$/.test(String(q.raw).trim())) field.required = true;
      }
      if (field && !field.label) {
        const described = describedBy(el);
        if (described) field.label = described;
        else if (field.required && field.options && field.options.length) field.label = optionsLabel(field.options);
        field.key = T.questionKey(field.type, field.label);
      }
      if (field && !field.error) field.error = errorNear(field.group || el.parentElement, [el]);
      pushField(field, [el]);
    });

    return fields;
  }

  // ---------------- Filling ----------------

  function clickChoice(input) {
    if (input.tagName !== 'INPUT') {
      D.click(input);
      return isChecked(input);
    }
    const label = findLabelNode(input, document);
    D.click(label && label.tagName === 'LABEL' ? label : input);
    if (!input.checked) {
      // Fallback for custom widgets that ignore label clicks.
      input.click();
    }
    return input.checked;
  }

  function setChecked(input, want) {
    if (isChecked(input) === want) return true;
    if (input.tagName !== 'INPUT') {
      D.click(input);
      return isChecked(input) === want;
    }
    const label = findLabelNode(input, document);
    D.click(label && label.tagName === 'LABEL' ? label : input);
    if (input.checked !== want) input.click();
    return input.checked === want;
  }

  async function fillTypeahead(field, value) {
    await D.typeSlowly(field.el, value);
    const controls = field.el.getAttribute('aria-controls');
    const option = await D.waitFor(
      () => {
        const rootNode = field.el.getRootNode();
        const scope = controls ? (rootNode.getElementById ? rootNode.getElementById(controls) : document.getElementById(controls)) : null;
        const options = D.all(LAA.SEL.typeaheadOption, scope || document);
        return options.length ? options : null;
      },
      { timeout: 4000, interval: 200 }
    );
    if (option) {
      const labels = option.map((o) => D.text(o));
      const idx = T.matchOption(labels, value);
      D.click(option[idx >= 0 ? idx : 0]);
      await D.pause(300, 600);
    }
    return { ok: String(field.el.value || '').trim() !== '' };
  }

  async function fillField(field, value) {
    if (value == null || (typeof value === 'string' && value.trim() === '' && field.type !== 'textarea')) {
      return { ok: false, reason: M('emptyAnswer') };
    }

    switch (field.type) {
      case 'text':
      case 'number':
      case 'date':
      case 'textarea': {
        const str = String(Array.isArray(value) ? value.join(', ') : value);
        D.setValue(field.el, str);
        await D.pause(150, 350);
        return { ok: field.el.value === str };
      }
      case 'typeahead':
        return fillTypeahead(field, String(value));
      case 'select': {
        const idx = T.matchOption(field.options, value);
        if (idx < 0) return { ok: false, reason: M('optionNotFound', { value: String(value) }) };
        D.setSelect(field.el, field.optionEls[idx].value);
        await D.pause(150, 350);
        return { ok: field.el.value === field.optionEls[idx].value };
      }
      case 'radio': {
        const idx = T.matchOption(field.options, value);
        if (idx < 0) return { ok: false, reason: M('optionNotFound', { value: String(value) }) };
        const ok = clickChoice(field.optionEls[idx]);
        await D.pause(150, 350);
        return { ok };
      }
      case 'checkboxes': {
        const wanted = Array.isArray(value) ? value : T.splitList(value);
        let matched = 0;
        field.optionEls.forEach((input, i) => {
          const should = wanted.some((w) => T.matchOption([field.options[i]], w) === 0);
          if (should) matched += 1;
          setChecked(input, should);
        });
        await D.pause(150, 350);
        return matched > 0 ? { ok: true } : { ok: false, reason: M('noMatchingOption') };
      }
      case 'checkbox': {
        const want = T.boolish(value) !== false;
        setChecked(field.el, want);
        await D.pause(150, 350);
        return { ok: isChecked(field.el) === want };
      }
      default:
        return { ok: false, reason: M('unsupportedType', { type: field.type }) };
    }
  }

  /** Attaches a stored document ({ name, type, data: base64 }) to a file input. */
  async function attachFile(field, doc) {
    try {
      const view = D.viewOf(field.el);
      const bin = view.atob(doc.data);
      const bytes = new view.Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const file = new view.File([bytes], doc.name, { type: doc.type || 'application/octet-stream' });
      const dt = new view.DataTransfer();
      dt.items.add(file);
      field.el.files = dt.files;
      field.el.dispatchEvent(new view.Event('input', { bubbles: true }));
      field.el.dispatchEvent(new view.Event('change', { bubbles: true }));
      await D.pause(800, 1500);
      return { ok: !!(field.el.files && field.el.files.length) };
    } catch (err) {
      return { ok: false, reason: String(err && err.message ? err.message : err) };
    }
  }

  /** Serializable description of a field, sent to the side panel. */
  function toQuestion(field, extra = {}) {
    return {
      key: field.key,
      label: field.label,
      type: field.type,
      family: field.family,
      options: field.options || [],
      required: !!field.required,
      error: field.error || '',
      current: field.currentValue == null ? '' : field.currentValue,
      ...extra,
    };
  }

  LAA.Fields = Object.freeze({ findFollowCompany, isFollowCompany, extractFields, fillField, toQuestion, errorTexts, attachFile });
})(typeof globalThis !== 'undefined' ? globalThis : this);
