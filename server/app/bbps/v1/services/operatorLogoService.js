const OperatorLogoModel = require("../models/operatorLogoModel");

const getOperatorId = (operator) =>
  operator?.operator_id ?? operator?.operatorId ?? operator?.id;

// EKO's replacement credit-card catalog uses new IDs. Reuse the existing
// uploads for confirmed equivalent billers; never change the payment ID.
const legacyCreditCardLogoIds = new Map([
  ["9205", "5295"], // BoB / BOBCARD
  ["9207", "5288"], // AU Bank
  ["9209", "5299"], // ICICI
  ["9214", "5289"], // IDBI
  ["9215", "5293"], // IDFC FIRST
  ["9217", "5294"], // Indian Bank
  ["9219", "5301"], // IOB
  ["9221", "5296"], // Punjab National Bank
  ["9222", "5290"], // One Card - South Indian
  ["9223", "5298"], // Saraswat
  ["9224", "5297"], // Union Bank
]);

const getLegacyLogoId = (operator) => {
  const category = operator?.operator_category ?? operator?.category_id;
  if (category != null && String(category) !== "7") return undefined;
  return legacyCreditCardLogoIds.get(String(getOperatorId(operator) ?? "").trim());
};

const decorateOperators = async (operators = []) => {
  if (!Array.isArray(operators) || operators.length === 0) return operators;

  const logoMap = await OperatorLogoModel.getActiveMap(
    operators.flatMap((operator) => [getOperatorId(operator), getLegacyLogoId(operator)]),
  );

  return operators.map((operator) => {
    const logo = logoMap.get(String(getOperatorId(operator) ?? "").trim())
      || logoMap.get(getLegacyLogoId(operator));

    return {
      ...operator,
      logo_url: logo?.logo_url || null,
      logo_alt: logo?.alt_text || operator?.name || null,
    };
  });
};

const decorateProviderResponse = async (response) => {
  if (!response || typeof response !== "object") return response;

  if (Array.isArray(response.data)) {
    return { ...response, data: await decorateOperators(response.data) };
  }

  // EKO operator-detail responses may return the operator at the root.
  if (getOperatorId(response) !== undefined) {
    const [decorated] = await decorateOperators([response]);
    return decorated;
  }

  if (Array.isArray(response?.data?.data)) {
    return {
      ...response,
      data: {
        ...response.data,
        data: await decorateOperators(response.data.data),
      },
    };
  }

  return response;
};

const decorateGroupedOperators = async (groups = {}) => {
  const entries = Object.entries(groups || {});
  const allOperators = entries.flatMap(([, operators]) => operators || []);
  const decorated = await decorateOperators(allOperators);
  let offset = 0;

  return Object.fromEntries(
    entries.map(([groupName, operators]) => {
      const count = (operators || []).length;
      const groupOperators = decorated.slice(offset, offset + count);
      offset += count;
      return [groupName, groupOperators];
    }),
  );
};

module.exports = {
  decorateGroupedOperators,
  decorateOperators,
  decorateProviderResponse,
};

