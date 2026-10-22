const collectionTypes = ['product', 'service'];

function contentTargetIds(entry) {
  let values = entry.target_ids;
  if (typeof values === 'string') {
    try { values = JSON.parse(values); } catch { values = []; }
  }
  const ids = Array.isArray(values) ? values.map(Number).filter(id => Number.isInteger(id) && id > 0) : [];
  if (!ids.length && Number.isInteger(Number(entry.target_id)) && Number(entry.target_id) > 0) ids.push(Number(entry.target_id));
  return [...new Set(ids)];
}

function contentNavigation(entry) {
  const type = entry.target_type;
  const ids = contentTargetIds(entry);
  if (!type || !ids.length) return null;
  if (collectionTypes.includes(type)) {
    return ids.length === 1
      ? { destination: `${type}_details`, targetId: ids[0], contentId: Number(entry.content_id) }
      : { destination: `${type}_offer`, targetIds: ids, contentId: Number(entry.content_id) };
  }
  return { destination: type === 'service_bundle' ? 'service_bundle_details' : type, targetId: Number(entry.target_id),
    ...(['category', 'subcategory', 'service_category', 'service_bundle'].includes(type) ? { contentId: Number(entry.content_id) } : {}) };
}

module.exports = { contentTargetIds, contentNavigation };
