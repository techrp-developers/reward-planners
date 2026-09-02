const OperatorLogoModel = require("../models/operatorLogoModel");

const getOperatorId = (operator) =>
  operator?.operator_id ?? operator?.operatorId ?? operator?.id;

const decorateOperators = async (operators = []) => {
  if (!Array.isArray(operators) || operators.length === 0) return operators;

  const logoMap = await OperatorLogoModel.getActiveMap(
    operators.map(getOperatorId),
  );

  return operators.map((operator) => {
    const logo = logoMap.get(String(getOperatorId(operator) ?? "").trim());

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

