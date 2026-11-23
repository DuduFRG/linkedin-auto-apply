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

  function errorFor(group) {
    if (!group) return '';
    const err = D.first(SEL.fieldError, group);
    return err ? D.text(err) : '';
  }

  function optionLabel(input) {
    const node = findLabelNode(input, document);
    const fromLabel = node && node.tagName === 'LABEL' ? labelText(node) : '';
    return fromLabel || T.cleanLabel(input.getAttribute('aria-label')) || String(input.value || '').trim();
  }

  function excluded(el) {
    if (el.closest(SEL.resumeArea)) return true;
    return SEL.followCompany.some((sel) => el.matches(sel));
  }

  function build(base) {
    const field = { ...base };
    field.family = T.familyOf(field.type);
    field.key = T.questionKey(field.type, field.label);
    return field;
  }

  function fromFieldset(fs, container) {
    const legend = fs.querySelector('legend');
    const raw = rawLabelText(legend);
    const label = labelText(legend) || T.cleanLabel(fs.getAttribute('aria-label'));
    const radios = Array.from(fs.querySelectorAll('input[type="radio"]')).filter((i) => !excluded(i));
    const checks = Array.from(fs.querySelectorAll('input[type="checkbox"]')).filter((i) => !excluded(i));
    const group = fs.closest(GROUP_SELECTOR) || fs;

    if (radios.length) {
      const checked = radios.find((r) => r.checked);
      return build({
        type: 'radio',
        label,
        required: isRequired(radios[0], raw, group) || fs.getAttribute('aria-required') === 'true',
        options: radios.map(optionLabel),
        optionEls: radios,
        hasValue: !!checked,
        currentValue: checked ? optionLabel(checked) : null,
        error: errorFor(group),
        el: radios[0],
        group,
        handled: radios,
      });
    }
    if (checks.length > 1) {
      const checked = checks.filter((c) => c.checked).map(optionLabel);
      return build({
        type: 'checkboxes',
        label,
        required: isRequired(checks[0], raw, group) || fs.getAttribute('aria-required') === 'true',
        options: checks.map(optionLabel),
        optionEls: checks,
        hasValue: checked.length > 0,
        currentValue: checked,
        error: errorFor(group),
        el: checks[0],
        group,
        handled: checks,
      });
    }
    if (checks.length === 1) {
      const box = checks[0];
      return build({
        type: 'checkbox',
        label: label || optionLabel(box),
        required: isRequired(box, raw, group),
        options: [],
        optionEls: [box],
        hasValue: box.checked,
        currentValue: box.checked ? 'yes' : 'no',
        error: errorFor(group),
        el: box,
        group,
        handled: checks,
      });
    }
    return null;
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

    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox') {
      return build({
        type: 'checkbox',
        label,
        required: isRequired(el, raw, group),
        options: [],
        optionEls: [el],
        hasValue: el.checked,
        currentValue: el.checked ? 'yes' : 'no',
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

  /** Extracts every answerable field inside the Easy Apply modal. */
  function extractFields(container) {
    const fields = [];
    const handled = new Set();

    container.querySelectorAll('fieldset').forEach((fs) => {
      if (!D.isVisible(fs) || excluded(fs)) return;
      const field = fromFieldset(fs, container);
      if (!field) return;
      field.handled.forEach((i) => handled.add(i));
      delete field.handled;
      if (field.label) fields.push(field);
    });

    // Radios outside fieldsets: group them by name.
    const looseRadios = new Map();
    container.querySelectorAll('input, select, textarea').forEach((el) => {
      if (handled.has(el) || excluded(el)) return;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (el.tagName === 'INPUT' && SKIP_INPUT_TYPES.has(type)) return;
      if (el.disabled || el.readOnly) return;

      if (type === 'radio') {
        if (!el.name) return;
        if (!looseRadios.has(el.name)) looseRadios.set(el.name, []);
        looseRadios.get(el.name).push(el);
        return;
      }

      // Radio / checkbox inputs are often visually hidden; their label is what's visible.
      const target = type === 'checkbox' ? findLabelNode(el, container) || el : el;
      if (!D.isVisible(target) && !D.isVisible(el)) return;

      const field = fromControl(el, container);
      if (field && field.label) fields.push(field);
    });

    looseRadios.forEach((radios) => {
      const group = groupOf(radios[0]);
      const labelNode = group && group.querySelector('legend, label:not([for]), .fb-dash-form-element__label, span');
      const label = labelText(labelNode);
      if (!label) return;
      const checked = radios.find((r) => r.checked);
      fields.push(
        build({
          type: 'radio',
          label,
          required: isRequired(radios[0], rawLabelText(labelNode), group),
          options: radios.map(optionLabel),
          optionEls: radios,
          hasValue: !!checked,
          currentValue: checked ? optionLabel(checked) : null,
          error: errorFor(group),
          el: radios[0],
          group,
        })
      );
    });

    return fields;
  }

  // ---------------- Filling ----------------

  function clickChoice(input) {
    const label = findLabelNode(input, document);
    D.click(label && label.tagName === 'LABEL' ? label : input);
    if (!input.checked) {
      // Fallback for custom widgets that ignore label clicks.
      input.click();
    }
    return input.checked;
  }

  function setChecked(input, want) {
    if (input.checked === want) return true;
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
        return { ok: field.el.checked === want };
      }
      default:
        return { ok: false, reason: M('unsupportedType', { type: field.type }) };
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

  LAA.Fields = Object.freeze({ extractFields, fillField, toQuestion });
})(typeof globalThis !== 'undefined' ? globalThis : this);
