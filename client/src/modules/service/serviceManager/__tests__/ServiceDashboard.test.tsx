import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../../common/api/api', () => ({ api: mockApi }));
import ServiceDashboard from '../dashboard/pages/ServiceDashboard';
const summary = {
  metrics: { services: 7, partner_services: 0, categories: 2, active_services: 5, active_variants: 12, orders: 3, active_orders: 2, completed_orders: 1, pending_enquiries: 1, pending_cancellations: 0, revenue: '450.25', coins_issued: 20, unclassified_services: 3, delayed_orders: 0 },
  performance: [{ status: 'completed', total: 1 }], trend: [{ month: '2026-11', amount: '450.25' }], top: [], recentOrders: [], recentEnquiries: [], recentServices: [], activity: [],
  definitions: { revenue: 'Paid completed item value.', coins: 'Actual credits.', dates: 'UTC creation dates.' },
};
beforeEach(() => { mockApi.get.mockReset(); });
afterEach(cleanup);
const mount = (inHouse = false) => render(<MemoryRouter><ServiceDashboard inHouse={inHouse} /></MemoryRouter>);
describe('Service Manager live dashboard', () => {
  it('shows server values, INR amounts and classification review without invented activity', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: summary } }); mount();
    const metrics = await screen.findByRole('region', { name: 'Key performance indicators' });
    expect(within(metrics).getByText('7')).toBeTruthy();
    expect(within(metrics).getByText('₹450.25')).toBeTruthy();
    expect(screen.getByText('3 services need classification.')).toBeTruthy();
    expect(screen.getByText('No recorded changes yet')).toBeTruthy();
    expect(mockApi.get).toHaveBeenCalledWith('/v1/service-manager/dashboard/summary', expect.any(Object));
  });
  it('displays API failures and retries instead of substituting zero metrics', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('Migration required')).mockResolvedValue({ data: { success: true, data: summary } });
    mount(); expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Key performance indicators' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Key performance indicators' })).toBeTruthy();
  });
  it('uses the separate In-House endpoint and shows its catalogue metrics', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: summary } }); mount(true);
    const metrics = await screen.findByRole('region', { name: 'Key performance indicators' });
    expect(within(metrics).getByText('Active Variants')).toBeTruthy();
    expect(within(metrics).queryByText('Partner Services')).toBeNull();
    expect(mockApi.get).toHaveBeenCalledWith('/v1/service-manager/in-house/summary', expect.any(Object));
  });
  it('sends date filters to the backend rather than calculating revenue in React', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: summary } }); mount();
    await screen.findByRole('region', { name: 'Key performance indicators' });
    const from = screen.getByLabelText('From');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(from, { target: { value: '2026-11-01' } });
    await vi.waitFor(() => expect(mockApi.get).toHaveBeenLastCalledWith('/v1/service-manager/dashboard/summary', { params: { from: '2026-11-01', to: undefined } }));
  });
});
