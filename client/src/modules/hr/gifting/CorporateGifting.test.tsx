import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CorporateGifting from './CorporateGifting';
import GiftingEnquiries from './GiftingEnquiries';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../../common/api/api', () => ({ api: mocks }));
vi.mock('../../../common/auth/useAuth', () => ({ useAuth: () => ({ user: { name: 'HR Person', email: 'hr@example.com', phone: '9123456789' } }) }));
const category = { category_id: 3, category_name: 'Accessories', image_url: null, subcategories: [{ subcategory_id: 8, subcategory_name: 'Bags' }] };
const product = { variant_id: 8, product_name: 'Welcome hamper', vendor_name: 'Gift vendor', sku: 'GIFT-8', sale_price: 100, image_url: null };
const enquiry = { id: 12, reference: 'CG-12', company_name: 'Company A', recipient_type: 'team', recipient_details: 'Engineering',
  contact_name: 'HR Person', contact_email: 'hr@example.com', contact_phone: '9876543210', delivery_address: 'Pune',
  items: [{ ...product, quantity: 10 }], status: 'new', version: 1, created_at: '2026-11-26', budget: null, manager_reply: null };
beforeEach(() => {
  mocks.get.mockImplementation((url: string) => Promise.resolve({ data: { data: url === '/employees/departments' ? [{ name: 'Engineering' }, { name: 'Sales' }] : url.includes('catalogue') ? [category] : [], hasMore: false } }));
  mocks.post.mockResolvedValue({ data: { data: { id: 12, reference: 'CG-12' } } });
  mocks.patch.mockResolvedValue({ data: { success: true } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('HR selects a category and subcategory and sends a bulk enquiry with a preferred brand', async () => {
  render(<CorporateGifting />);
  fireEvent.change(await screen.findByLabelText('Accessories subcategory'), { target: { value: '8' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Enquire about this category' }));
  fireEvent.change(screen.getByLabelText('Preferred brand (optional)'), { target: { value: 'Preferred brand' } });
  fireEvent.change(screen.getByLabelText('Estimated quantity'), { target: { value: '10' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Team / department *' }), { target: { value: 'Engineering' } });
  expect((screen.getByLabelText('Contact phone *') as HTMLInputElement).value).toBe('9123456789');
  fireEvent.change(screen.getByLabelText('Contact phone *'), { target: { value: '9876543210' } });
  fireEvent.change(screen.getByLabelText('Delivery address *'), { target: { value: 'Pune office' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to vendor manager' }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledOnce());
  const payload = mocks.post.mock.calls[0][1];
  expect(payload.recipient_type).toBe('team');
  expect(payload.contact_phone).toBe('9876543210');
  expect(payload.recipient_details).toBe('Engineering');
  expect(payload.items).toEqual([{ category_id: 3, subcategory_id: 8, preferred_brand: 'Preferred brand', quantity: 10 }]);
  expect(payload.company_id).toBeUndefined();
  expect(payload.request_key).toBeTruthy();
  expect(await screen.findByText(/Enquiry CG-12 sent/)).toBeTruthy();
});

it('individual gifting is available and failed requests retain selections for retry', async () => {
  mocks.post.mockRejectedValue(new Error('offline'));
  render(<CorporateGifting />);
  fireEvent.click(await screen.findByRole('button', { name: 'Enquire about this category' }));
  fireEvent.change(screen.getByLabelText('Gifting for'), { target: { value: 'individual' } });
  fireEvent.change(screen.getByLabelText('Recipient name *'), { target: { value: 'Employee' } });
  fireEvent.change(screen.getByLabelText('Contact phone *'), { target: { value: '9876543210' } });
  fireEvent.change(screen.getByLabelText('Delivery address *'), { target: { value: 'Office' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to vendor manager' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect((screen.getByLabelText('Estimated quantity') as HTMLInputElement).value).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'Send to vendor manager' }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
  expect(mocks.post.mock.calls[0][1].request_key).toBe(mocks.post.mock.calls[1][1].request_key);
});

it('manager inbox saves a reply and status using the current record version', async () => {
  mocks.get.mockResolvedValue({ data: { data: [enquiry], hasMore: false } });
  render(<GiftingEnquiries manager />);
  fireEvent.click(await screen.findByText('CG-12'));
  expect(screen.getByText('Welcome hamper')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Enquiry status'), { target: { value: 'quoted' } });
  fireEvent.change(screen.getByLabelText('Reply to HR'), { target: { value: 'Quote ready for review' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save update' }));
  await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/corporate-gifting/12', { status: 'quoted', manager_reply: 'Quote ready for review', version: 1 }));
});

it('HR can read a manager reply but cannot see status editing controls', async () => {
  mocks.get.mockResolvedValue({ data: { data: [{ ...enquiry, manager_reply: 'Please confirm delivery details' }], hasMore: false } });
  render(<GiftingEnquiries />);
  fireEvent.click(await screen.findByText('CG-12'));
  expect(screen.getByText('Please confirm delivery details')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save update' })).toBeNull();
});
