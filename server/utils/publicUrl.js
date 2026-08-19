const CDN_BASE_URL = "https://cdn.rewardplanners.com";

function getPublicUrl(filePath, updatedAt) {
  if (!filePath) return null;

  const normalizedPath = String(filePath).trim();
  if (!normalizedPath) return null;

  const publicUrl = /^https?:\/\//i.test(normalizedPath)
    ? normalizedPath
    : `${CDN_BASE_URL}/${normalizedPath.replace(/^\/+/, "")}`;

  if (!updatedAt) return publicUrl;

  const version = new Date(updatedAt).getTime();
  if (!Number.isFinite(version)) return publicUrl;

  return `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${version}`;
}

module.exports = { getPublicUrl };
