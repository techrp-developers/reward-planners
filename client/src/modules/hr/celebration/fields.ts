export type CelebrationKind = 'cake' | 'event';
export type CelebrationForm = Record<string, string>;
export interface FormField { key: string; title: string; type?: string; required?: boolean; maxLength?: number; min?: number; max?: number; step?: string }
export const cakeFields: FormField[] = [
  { key: 'title', title: 'Recipient / team', required: true, maxLength: 200 },
  { key: 'occasion', title: 'Occasion', maxLength: 150 },
  { key: 'flavour', title: 'Cake flavour', required: true, maxLength: 100 },
  { key: 'weight_kg', title: 'Weight per cake (kg)', type: 'number', required: true, min: 0.25, max: 50, step: '0.25' },
  { key: 'quantity', title: 'Number of cakes', type: 'number', required: true, min: 1, max: 500, step: '1' },
  { key: 'cake_message', title: 'Message on cake', maxLength: 250 },
];
export const eventFields: FormField[] = [
  { key: 'title', title: 'Event name', required: true, maxLength: 200 },
  { key: 'event_type', title: 'Event type', required: true, maxLength: 150 },
  { key: 'occasion', title: 'Occasion', maxLength: 150 },
  { key: 'guests', title: 'Expected guests', type: 'number', required: true, min: 1, max: 100000, step: '1' },
  { key: 'duration_hours', title: 'Duration (hours)', type: 'number', required: true, min: 0.5, max: 168, step: '0.5' },
];
export const commonFields: FormField[] = [
  { key: 'date', title: 'Date', type: 'date', required: true },
  { key: 'time', title: 'Time (India time)', type: 'time', required: true },
  { key: 'contact_name', title: 'Contact name', required: true, maxLength: 150 },
  { key: 'contact_email', title: 'Contact email', type: 'email', required: true, maxLength: 254 },
  { key: 'contact_phone', title: 'Contact phone', type: 'tel', required: true, maxLength: 30 },
  { key: 'budget', title: 'Total budget in INR (optional)', type: 'number', min: 0, max: 9999999999.99, step: '0.01' },
];
export const statusLabels: Record<string, string> = { new: 'New', contacted: 'Contacted', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };
export const kindLabels: Record<CelebrationKind, string> = { cake: 'Schedule a Cake', event: 'Book Events' };
export interface CelebrationRequest {
  id: number; reference: string; company_name: string; kind: CelebrationKind;
  details: Record<string, string | number | null>; status: string; manager_reply: string | null; version: number;
}
