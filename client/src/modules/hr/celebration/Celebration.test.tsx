import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Celebration from './Celebration';
import CelebrationRequests from './CelebrationRequests';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../../common/api/api', () => ({ api }));
vi.mock('../../../common/auth/useAuth', () => ({ useAuth: () => ({ user: { name: 'HR Person', email: 'hr@example.com', phone: '9876543210' } }) }));
beforeEach(() => {
  api.get.mockImplementation((url: string) => Promise.resolve({ data: { data: url === '/employees/departments' ? [{ name: 'Engineering' }] : [], hasMore: false } }));
  api.post.mockResolvedValue({ data: { data: { reference: 'CEL-12' } } });
  api.patch.mockResolvedValue({ data: { success: true } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function fill(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function dates() { fill('Date *', '2099-12-20'); fill('Time (India time) *', '15:00'); }

it('cake request prefills HR contact details and submits cake preferences', async () => {
  render(<Celebration />);
  expect((screen.getByLabelText('Contact phone *') as HTMLInputElement).value).toBe('9876543210');
  fill('Recipient / team *', 'Engineering birthdays'); fill('Cake flavour *', 'Chocolate'); dates(); fill('Delivery address *', 'Pune office');
  fireEvent.click(screen.getByRole('button', { name: 'Send cake request' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
  expect(api.post.mock.calls[0][1]).toMatchObject({ kind: 'cake', flavour: 'Chocolate', quantity: '1', contact_phone: '9876543210' });
  expect(api.post.mock.calls[0][1].company_id).toBeUndefined();
  expect(await screen.findByText(/CEL-12.*awaiting confirmation/)).toBeTruthy();
});
it('event request submits guest count, duration and services', async () => {
  render(<Celebration />); fireEvent.click(screen.getByRole('button', { name: 'Book Events' }));
  fill('Event name *', 'Annual day'); fill('Event type *', 'Company gathering'); fill('Expected guests *', '80'); dates();
  fill('Venue / preferred location *', 'Pune'); fill('Services required', 'Catering and decoration');
  fireEvent.click(screen.getByRole('button', { name: 'Send event request' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
  expect(api.post.mock.calls[0][1]).toMatchObject({ kind: 'event', guests: '80', services: 'Catering and decoration' });
});
it('Hosting & Dining stays empty and switching tabs preserves cake drafts', async () => {
  render(<Celebration />); fill('Recipient / team *', 'Birthday draft');
  fireEvent.click(screen.getByRole('button', { name: 'Hosting & Dining' }));
  expect(screen.getByRole('region', { name: 'Hosting & Dining' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Send .* request/ })).toBeNull();
  expect(screen.queryByLabelText('Contact phone *')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Schedule a Cake' }));
  expect((screen.getByLabelText('Recipient / team *') as HTMLInputElement).value).toBe('Birthday draft');
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(api.post).not.toHaveBeenCalled();
});
it('failed submissions retain entered details and the same retry key', async () => {
  api.post.mockRejectedValue(new Error('offline'));
  render(<Celebration />); fill('Recipient / team *', 'Birthday'); fill('Cake flavour *', 'Vanilla'); dates(); fill('Delivery address *', 'Office');
  fireEvent.click(screen.getByRole('button', { name: 'Send cake request' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Cake flavour *') as HTMLInputElement).value).toBe('Vanilla');
  fireEvent.click(screen.getByRole('button', { name: 'Send cake request' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  expect(api.post.mock.calls[0][1].request_key).toBe(api.post.mock.calls[1][1].request_key);
});
it('vendor manager can confirm and reply, while HR only reads replies', async () => {
  const row = { id: 12, reference: 'CEL-12', company_name: 'Company A', kind: 'cake', status: 'new', version: 1, details: { title: 'Birthday', date: '2099-12-20', time: '15:00', flavour: 'Chocolate' }, manager_reply: 'Delivery available' };
  api.get.mockResolvedValue({ data: { data: [row], hasMore: false } });
  render(<CelebrationRequests manager />); fireEvent.click(await screen.findByText('CEL-12'));
  fill('Request status', 'confirmed'); fill('Reply to HR', 'Confirmed for 3 PM');
  fireEvent.click(screen.getByRole('button', { name: 'Save update' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/celebrations/12', { status: 'confirmed', manager_reply: 'Confirmed for 3 PM', version: 1 }));
  cleanup(); render(<CelebrationRequests kind="cake" />); fireEvent.click(await screen.findByText('CEL-12'));
  expect(screen.getByText('Delivery available')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save update' })).toBeNull();
});
