const statuses = ['new', 'contacted', 'confirmed', 'completed', 'cancelled'];
function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
function positiveId(value) {
  return (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))
    && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
function text(value, name, max, required = false) {
  if (value != null && typeof value !== 'string') throw invalid(`${name} must be text`);
  const result = (value || '').trim();
  if (required && !result) throw invalid(`${name} is required`);
  if (result.length > max) throw invalid(`${name} must be at most ${max} characters`);
  return result;
}
function number(value, name, min, max, whole = false) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw invalid(`${name} is required`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (whole && !Number.isInteger(result))) throw invalid(`${name} must be ${whole ? 'a whole number ' : ''}between ${min} and ${max}`);
  return result;
}
function normalize(body = {}, now = Date.now()) {
  if (!['cake', 'event'].includes(body.kind)) throw invalid('Choose Schedule a Cake or Book Events');
  const date = text(body.date, 'Date', 10, true);
  const time = text(body.time, 'Time', 5, true);
  const calendar = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== date
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw invalid('Choose a valid date and time');
  const scheduled = new Date(`${date}T${time}:00+05:30`);
  if (scheduled.getTime() <= now) throw invalid('Choose a future date and time (India time)');
  const details = {
    title: text(body.title, body.kind === 'cake' ? 'Recipient / team' : 'Event name', 200, true),
    occasion: text(body.occasion, 'Occasion', 150),
    department: text(body.department, 'Department', 100),
    date, time,
    location: text(body.location, 'Delivery address / venue', 1000, true),
    contact_name: text(body.contact_name, 'Contact name', 150, true),
    contact_email: text(body.contact_email, 'Contact email', 254, true).toLowerCase(),
    contact_phone: text(body.contact_phone, 'Contact phone', 30, true),
    budget: body.budget == null || body.budget === '' ? null : number(body.budget, 'Total budget', 0, 9999999999.99),
    requirements: text(body.requirements, 'Special requirements', 4000),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.contact_email)) throw invalid('Enter a valid contact email');
  if (!/^[+\d()\s-]+$/.test(details.contact_phone) || details.contact_phone.replace(/\D/g, '').length < 7) throw invalid('Enter a valid contact phone');
  if (body.kind === 'cake') {
    details.flavour = text(body.flavour, 'Cake flavour', 100, true);
    details.weight_kg = number(body.weight_kg, 'Weight per cake (kg)', 0.25, 50);
    details.quantity = number(body.quantity, 'Number of cakes', 1, 500, true);
    if (!['eggless', 'with_egg', 'no_preference'].includes(body.dietary)) throw invalid('Choose a cake dietary preference');
    details.dietary = body.dietary;
    details.cake_message = text(body.cake_message, 'Message on cake', 250);
  } else {
    details.event_type = text(body.event_type, 'Event type', 150, true);
    details.guests = number(body.guests, 'Expected guests', 1, 100000, true);
    details.duration_hours = number(body.duration_hours, 'Duration (hours)', 0.5, 168);
    details.services = text(body.services, 'Services required', 2000);
  }
  return { kind: body.kind, scheduled_at: `${date} ${time}:00`, details };
}
module.exports = { normalize, invalid, positiveId, text, statuses };
