const EMAIL = /^[^\s@<>(),;:]+@[^\s@<>(),;:]+\.[^\s@<>(),;:]+$/;
const { normalize, plain, renderRich } = require('./richText');
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function validate(input, now = Date.now()) {
  const value = { ...input };
  if (value.richText !== undefined) {
    if (!value.richText || typeof value.richText !== 'object') throw new Error('Invalid formatted message.');
    value.richText = { above: normalize(value.richText.above), below: normalize(value.richText.below) };
    value.message = `${plain(value.richText.above)}\n${plain(value.richText.below)}`.trim();
  }
  if (value.images !== undefined) {
    if (!Array.isArray(value.images) || value.images.length > 5) throw new Error('Add up to 5 images.');
    value.images = value.images.map(url => {
      if (typeof url !== 'string') throw new Error('Enter a valid HTTPS image link.');
      let parsed;
      try { parsed = new URL(url); } catch { throw new Error('Enter a valid HTTPS image link.'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || url.length > 2000) throw new Error('Enter a valid HTTPS image link.');
      return url.trim();
    });
    if (!['collage', 'row', 'column'].includes(value.imageLayout)) throw new Error('Select an image arrangement.');
    if (value.mediaType === 'image' && value.mediaUrl) throw new Error('Add image links to the image gallery.');
  }
  for (const [key, max] of [['name', 120], ['subject', 200], ['message', 10000]]) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > max) throw new Error(`Enter ${key} (up to ${max} characters).`);
    value[key] = value[key].trim();
  }
  value.subject = value.subject.replace(/[\r\n]+/g, ' ');
  if (!['classic', 'hero', 'split'].includes(value.layout)) throw new Error('Select a layout.');
  if (!['company', 'all', 'custom'].includes(value.audience)) throw new Error('Select an audience.');
  if (!Number.isSafeInteger(value.companyId) || value.companyId < 1) throw new Error('Select a company.');
  if (value.audience === 'custom' && (!Array.isArray(value.employeeIds) || !value.employeeIds.length || value.employeeIds.length > 5000 || value.employeeIds.some(id => !Number.isSafeInteger(id) || id < 1))) throw new Error('Select up to 5000 employees.');
  value.mediaUrl = typeof value.mediaUrl === 'string' ? value.mediaUrl.trim() : '';
  if (value.mediaUrl) {
    let url;
    try { url = new URL(value.mediaUrl); } catch { throw new Error('Enter a valid HTTPS media link.'); }
    if (url.protocol !== 'https:' || url.username || url.password || value.mediaUrl.length > 2000) throw new Error('Enter a valid HTTPS media link.');
    if (!['image', 'video', 'document'].includes(value.mediaType)) throw new Error('Select a media type.');
  }
  if (value.scheduledAt && (!Number.isFinite(Date.parse(value.scheduledAt)) || Date.parse(value.scheduledAt) <= now)) throw new Error('Choose a future delivery time.');
  return value;
}
function render(value) {
  const body = `<h1 style="font-size:26px;color:#852baf">${escape(value.subject)}</h1><p style="line-height:1.7">${escape(value.message).replace(/\n/g, '<br>')}</p>`;
  const media = !value.mediaUrl ? '' : value.mediaType === 'image'
    ? `<img src="${escape(value.mediaUrl)}" alt="Promotion" width="100%" style="display:block;width:100%;height:auto;border-radius:12px">`
    : `<p><a href="${escape(value.mediaUrl)}" style="color:#852baf">${value.mediaType === 'video' ? 'Watch video' : 'View document'}</a></p>`;
  const gallery = renderGallery(value.images || [], value.imageLayout);
  const content = value.richText
    ? renderRich(value.richText.above) + gallery + media + renderRich(value.richText.below)
    : gallery + (value.layout === 'split' && media ? `<table role="presentation" width="100%"><tr><td width="40%" valign="top">${media}</td><td style="padding-left:20px">${body}</td></tr></table>` : value.layout === 'hero' ? media + body : body + media);
  return `<!doctype html><html><body style="margin:0;background:#f5f3f8;font-family:Arial,sans-serif;color:#334155"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" style="max-width:100%;background:white;border-radius:16px"><tr><td style="padding:28px"><p style="color:#852baf;font-weight:bold">Reward Planners</p>${content}<hr style="border:0;border-top:1px solid #eee;margin-top:28px"><p style="font-size:12px;color:#64748b">Sent by your relationship manager. Reply to this email to get in touch.</p></td></tr></table></td></tr></table></body></html>`;
}
function renderGallery(images, layout) {
  if (!images.length) return '';
  const rows = layout === 'row' ? [images] : layout === 'column' ? images.map(url => [url]) : images.length % 2 ? [images.slice(0, 1), ...Array.from({ length: Math.floor(images.length / 2) }, (_, index) => images.slice(1 + index * 2, 3 + index * 2))] : Array.from({ length: images.length / 2 }, (_, index) => images.slice(index * 2, index * 2 + 2));
  return rows.map(row => `<table role="presentation" width="100%" style="table-layout:fixed;margin:0 0 8px"><tr>${row.map(url => `<td width="${100 / row.length}%" valign="top" style="padding:${row.length > 1 ? '4px' : '0'}"><img src="${escape(url)}" alt="Promotion image ${images.indexOf(url) + 1}" width="${Math.floor(544 / row.length) - (row.length > 1 ? 8 : 0)}" style="display:block;width:100%;height:auto;border-radius:8px"></td>`).join('')}</tr></table>`).join('');
}
function recipients(rows) {
  return [...new Set(rows.map(row => String(row.email || '').trim().toLowerCase()).filter(email => email.length <= 254 && EMAIL.test(email)))];
}
module.exports = { validate, render, recipients, EMAIL };
