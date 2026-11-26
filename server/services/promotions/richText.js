const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
function normalize(ops) {
  if (!Array.isArray(ops) || ops.length > 5000) throw new Error('Invalid formatted message.');
  let length = 0;
  return ops.map(op => {
    if (!op || typeof op.insert !== 'string') throw new Error('Only text is allowed in the message editor.');
    length += op.insert.length;
    if (length > 10000) throw new Error('Message must be at most 10000 characters.');
    const source = op.attributes || {}, attributes = {};
    for (const key of ['bold', 'italic', 'underline', 'strike']) if (source[key] === true) attributes[key] = true;
    for (const key of ['color', 'background']) if (color(source[key])) attributes[key] = source[key];
    if ([1, 2, 3].includes(source.header)) attributes.header = source.header;
    if (['center', 'right', 'justify'].includes(source.align)) attributes.align = source.align;
    if (['small', 'large', 'huge'].includes(source.size)) attributes.size = source.size;
    return { insert: op.insert, attributes };
  });
}
function plain(ops) { return ops.map(op => op.insert).join(''); }
function renderRich(ops) {
  let result = '', line = '';
  const finish = attributes => {
    const tag = attributes.header ? `h${attributes.header}` : 'p';
    result += `<${tag} style="margin:0 0 12px;line-height:1.6;text-align:${attributes.align || 'left'}">${line || '<br>'}</${tag}>`;
    line = '';
  };
  for (const op of normalize(ops)) {
    const a = op.attributes;
    const pieces = op.insert.split('\n');
    pieces.forEach((piece, index) => {
      let text = escape(piece);
      for (const [key, tag] of [['bold', 'strong'], ['italic', 'em'], ['underline', 'u'], ['strike', 's']]) if (a[key]) text = `<${tag}>${text}</${tag}>`;
      const styles = [];
      if (a.color) styles.push(`color:${a.color}`);
      if (a.background) styles.push(`background-color:${a.background}`);
      if (a.size) styles.push(`font-size:${{ small: '12px', large: '20px', huge: '28px' }[a.size]}`);
      if (piece) line += styles.length ? `<span style="${styles.join(';')}">${text}</span>` : text;
      if (index < pieces.length - 1) finish(a);
    });
  }
  if (line) finish({});
  return result;
}
module.exports = { normalize, plain, renderRich };
