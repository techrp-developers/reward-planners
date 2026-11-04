const CMS_MODULE_HEADER = 'X-CMS-Module-Version';

function createModuleCompatibility(rows, version) {
  const modern = String(version) === '2';
  const canonicalBus = rows.some(row => row.module_key === 'busbooking');
  const legacyBus = !canonicalBus && rows.some(row => row.module_key === 'dineout'
    && (row.route_key === 'BusBookingModule' || /\bbus\b/i.test(row.label || '')));
  const storageKey = canonicalBus ? 'busbooking' : legacyBus ? 'dineout' : null;
  const publicKey = modern ? 'busbooking' : 'dineout';
  const publicRoute = modern ? 'BusBookingModule' : 'DineOutModule';

  const unavailable = key => (key === 'dineout' && modern && legacyBus)
    || (!modern && ['dineout', 'busbooking'].includes(key) && !storageKey);
  const resolveKey = key => (!modern && key === 'dineout') || key === 'busbooking'
    ? storageKey || key : key;

  // Project only known identity fields and module-keyed maps. Never alter labels,
  // URLs, IDs, arbitrary strings or the database objects being serialized.
  function project(value) {
    if (Array.isArray(value)) return value.map(project).filter(item => item !== undefined);
    if (!value || typeof value !== 'object' || value instanceof Date) return value;
    const identity = value.module_key ?? value.moduleKey ?? value.module;
    if (!modern && identity === 'dineout' && storageKey !== 'dineout') return undefined;
    const isBus = storageKey && identity === storageKey;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (!modern && key === 'dineout' && storageKey !== 'dineout') continue;
      // Before migration, a modern response may contain an empty busbooking slot
      // as well as the old dineout slot. Keep the actual stored bus content.
      if (modern && legacyBus && key === 'busbooking') continue;
      const targetKey = key === storageKey ? publicKey : key;
      if (isBus && ['module', 'module_key', 'moduleKey'].includes(key)) result[key] = publicKey;
      else if (isBus && ['route_key', 'routeKey'].includes(key)) result[key] = publicRoute;
      else {
        const projected = project(item);
        if (projected !== undefined) result[targetKey] = projected;
      }
    }
    return result;
  }
  return { project, resolveKey, unavailable };
}

module.exports = { CMS_MODULE_HEADER, createModuleCompatibility };
