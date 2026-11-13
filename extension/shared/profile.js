/**
 * Maps form labels to fields of the local user profile (name, e-mail, phone...).
 * Labels are matched after normalisation (lowercase, no accents, no punctuation),
 * in English, Portuguese and Spanish.
 */
(function (root) {
  'use strict';

  const LAA = (root.LAA = root.LAA || {});
  const T = LAA.T;

  // Order matters: more specific rules first.
  const RULES = [
    { field: 'email', test: /\b(e ?mail|email address|endereco de e ?mail|correo electronico|correo)\b/ },
    { field: 'phoneCountry', test: /\b(country code|codigo do pais|codigo de pais|codigo del pais|ddi)\b/ },
    { field: 'phone', test: /\b(phone|mobile|cell|telefone|celular|telefono|movil|numero de telefone)\b/ },
    { field: 'fullName', test: /^(full name|nome completo|nombre completo|name|nome)$/ },
    { field: 'firstName', test: /^(first name|given name|primeiro nome|nombre|prenom)$/ },
    { field: 'lastName', test: /^(last name|surname|family name|sobrenome|ultimo nome|apellidos?|nom de famille)$/ },
    {
      field: 'city',
      test: /^(city|cidade|ciudad|location city|location|localizacao|localidade|current city|current location|cidade atual|localizacao atual|ubicacion)$/,
    },
    { field: 'linkedinUrl', test: /\blinkedin\b.*\b(profile|perfil|url)\b|\b(profile|perfil|url)\b.*\blinkedin\b|^linkedin$/ },
    { field: 'website', test: /\b(website|web site|portfolio|portifolio|portafolio|site pessoal|personal site|personal website)\b/ },
  ];

  /** Returns the profile field name for a label, or null. */
  function matchProfileField(label) {
    const n = T.normalize(label);
    if (!n) return null;
    const rule = RULES.find((r) => r.test.test(n));
    return rule ? rule.field : null;
  }

  function profileValue(profile, field) {
    if (!profile || !field) return '';
    if (field === 'fullName') {
      return [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
    }
    return String(profile[field] || '').trim();
  }

  /** Field that should be updated in the profile when the user answers it. */
  function writableField(field) {
    return field === 'fullName' ? null : field;
  }

  LAA.Profile = Object.freeze({ matchProfileField, profileValue, writableField, RULES });
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = globalThis.LAA.Profile;
