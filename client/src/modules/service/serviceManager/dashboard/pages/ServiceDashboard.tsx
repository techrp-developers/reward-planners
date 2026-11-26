import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CircleDollarSign, Coins, Inbox, Layers, List, Plus, RefreshCw, ShoppingBag, Tags, XCircle } from 'lucide-react';
import { api } from '../../../../../common/api/api';
import { workspaceApi, workspaceError, inr, dateLabel } from '../../shared/workspaceApi';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../shared/WorkspaceUI';
interface Summary {
  metrics: Record<string, number | string>;
  performance: { status: string; total: number }[];
  trend: { month: string; amount: string }[];
  top: { id: number; name: string; completed_orders: number; amount: string }[];
  recentOrders: { id: number; parent_order_id: string; order_ref: string; service_name: string; status: string; price: string }[];
  recentEnquiries: { id: number; enquiry_ref: string; name: string; status: string }[];
  recentServices: { id: number; name: string; status: number; created_at: string }[];
  activity: { id: number; action: string; entity_type: string; actor_name: string; reason: string; created_at: string }[];
  definitions: { revenue: string; coins: string; dates: string };
}
const shortcuts = [
  { label: 'Categories', text: 'Organise your catalogue', to: '/service/catalog/categories', Icon: List },
  { label: 'Services', text: 'Manage service details', to: '/service/catalog/services', Icon: Layers },
  { label: 'Variants', text: 'Options and configurations', to: '/service/catalog/variants', Icon: Tags },
  { label: 'Pricing', text: 'Prices and change history', to: '/service/pricing', Icon: CircleDollarSign },
  { label: 'Reward Rules', text: 'Earning and redemption', to: '/service/rewards', Icon: Coins },
  { label: 'Enquiries', text: 'Follow up customer requests', to: '/service/enquiries', Icon: Inbox },
  { label: 'Orders', text: 'Track service fulfilment', to: '/service/orders', Icon: ShoppingBag },
  { label: 'Cancellations', text: 'Review requests and refunds', to: '/service/cancellations', Icon: XCircle },
];
export default function ServiceDashboard({ inHouse = false, reports = false }: { inHouse?: boolean; reports?: boolean }) {
  const [data, setData] = useState<Summary | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const response = await api.get(`${workspaceApi}/${inHouse ? 'in-house' : 'dashboard'}/summary`, { params: { from: from || undefined, to: to || undefined } }); setData(response.data.data); } catch (err) { setError(workspaceError(err)); } finally { setLoading(false); } }, [inHouse, from, to]);
  useEffect(() => { void load(); }, [load]);
  const metrics = inHouse ? [['Total Categories','categories'],['Active Services','active_services'],['Active Variants','active_variants'],['Pending Enquiries','pending_enquiries'],['Active Orders','active_orders'],['Completed Orders','completed_orders'],['Pending Cancellations','pending_cancellations'],['Service Revenue','revenue']]
    : [['In-House Services','services'],['Partner Services','partner_services'],['Active Orders','active_orders'],['Pending Enquiries','pending_enquiries'],['Completed Orders','completed_orders'],['Pending Cancellations','pending_cancellations'],['Service Revenue','revenue'],['Reward Coins Issued','coins_issued']];
  return <div className="sm-workspace">
    <PageHeader eyebrow={reports ? 'Management' : inHouse ? 'In-House Services' : 'Service operations'} title={reports ? 'Reports & Analytics' : inHouse ? 'In-House Services' : 'Service overview'} description={inHouse ? 'Manage your service catalogue, pricing, rewards and fulfilment in one workspace.' : 'A clear view of your catalogue and daily service operations.'}>
      <button className="sm-btn" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh</button><Link className="sm-btn sm-primary" to="/service/catalog/services?add=1"><Plus size={16} />Add Service</Link>
    </PageHeader>
    <div className="sm-toolbar"><span className="sm-badge sm-purple">Live workspace data</span><div className="sm-actions"><label className="sm-date">From<input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label><label className="sm-date">To<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>{(from || to) && <button className="sm-btn" onClick={() => { setFrom(''); setTo(''); }}>All time</button>}</div></div>
    {error ? <ErrorState message={error} retry={() => void load()} /> : loading ? <LoadingState /> : data && <>
      {Number(data.metrics.unclassified_services) > 0 && <div className="sm-notice"><strong>{data.metrics.unclassified_services} services need classification.</strong><span> Review existing records before they appear in workspace statistics.</span><Link to="/service/classification">Review catalogue <ArrowUpRight size={14} /></Link></div>}
      <section aria-label="Key performance indicators" className="sm-kpis">{metrics.map(([label, key]) => <article className="sm-kpi" key={key}><p>{label}</p><strong>{key === 'revenue' ? inr(data.metrics[key]) : Number(data.metrics[key] || 0).toLocaleString('en-IN')}</strong><span>{key === 'partner_services' ? 'Explicitly classified catalogue' : key === 'coins_issued' ? 'Actual wallet credits' : key === 'revenue' ? 'Paid completed item value' : 'In-House workspace'}</span></article>)}</section>
      <section><div className="sm-section-title"><h2>Manage your workspace</h2><Link to="/service/in-house">In-House overview <ArrowUpRight size={15} /></Link></div><div className="sm-shortcuts">{shortcuts.map(({ label, text, to: path, Icon }) => <Link key={label} to={path} className="sm-shortcut"><Icon size={19} /><strong>{label}</strong><span>{text}</span><ArrowUpRight size={14} /></Link>)}</div></section>
      <div className="sm-two-col"><section className="sm-panel"><div className="sm-section-title"><h2>Service performance</h2><span>Order items</span></div>{!data.performance.length ? <EmptyState /> : <div className="sm-bars">{data.performance.map(row => <div key={row.status}><div><StatusBadge status={row.status} /><strong>{row.total}</strong></div><progress aria-label={row.status} value={Number(row.total)} max={Math.max(1, Number(data.metrics.orders))} /></div>)}</div>}</section>
      <section className="sm-panel"><div className="sm-section-title"><h2>Revenue analytics</h2><span>INR</span></div>{!data.trend.length ? <EmptyState title="No completed paid orders" /> : <div className="sm-bars">{data.trend.map(row => <div key={row.month}><div><span>{row.month}</span><strong>{inr(row.amount)}</strong></div><progress aria-label={`${row.month} revenue`} value={Number(row.amount)} max={Math.max(1,...data.trend.map(item => Number(item.amount)))} /></div>)}</div>}<p className="sm-help">{data.definitions.revenue}</p></section></div>
      <div className="sm-two-col"><section className="sm-panel"><div className="sm-section-title"><h2>Recent orders</h2><Link to="/service/orders">View orders <ArrowUpRight size={14} /></Link></div><div className="sm-table-wrap"><table className="sm-table"><thead><tr><th>Order / Service</th><th>Value</th><th>Status</th></tr></thead><tbody>{data.recentOrders.map(row => <tr key={row.id}><td><Link to={`/service/orders/${row.parent_order_id}`}>{row.order_ref || `#${row.id}`}</Link><small>{row.service_name}</small></td><td>{inr(row.price)}</td><td><StatusBadge status={row.status} /></td></tr>)}</tbody></table>{!data.recentOrders.length && <EmptyState title="No orders in this period" />}</div></section>
      <section className="sm-panel"><div className="sm-section-title"><h2>Pending follow-ups</h2><Link to="/service/enquiries">Enquiries <ArrowUpRight size={14} /></Link></div>{data.recentEnquiries.filter(row => ['new','contacted'].includes(row.status)).map(row => <Link className="sm-list-row" key={row.id} to={`/service/enquiries/${row.id}`}><div><strong>{row.enquiry_ref}</strong><span>{row.name}</span></div><StatusBadge status={row.status} /></Link>)}{!data.recentEnquiries.some(row => ['new','contacted'].includes(row.status)) && <EmptyState title="No recent pending follow-ups" />}<div className="sm-notice">{data.metrics.delayed_orders} orders exceed the service’s configured processing days. <Link to="/service/orders">Review orders</Link></div></section></div>
      <div className="sm-two-col"><section className="sm-panel"><div className="sm-section-title"><h2>Top performing services</h2><span>Completed paid items</span></div>{data.top.map((row, index) => <div key={row.id} className="sm-list-row"><div><strong>{index + 1}. {row.name}</strong><span>{row.completed_orders} completed items</span></div><strong>{inr(row.amount)}</strong></div>)}{!data.top.length && <EmptyState />}</section><section className="sm-panel"><div className="sm-section-title"><h2>Recent activity</h2><Link to="/service/activity">All activity <ArrowUpRight size={14} /></Link></div>{data.activity.map(row => <div key={row.id} className="sm-activity"><span className="sm-activity-dot" /><div><strong>{row.actor_name || 'Manager'} · {row.action} {row.entity_type}</strong><p>{row.reason}</p><small>{dateLabel(row.created_at)}</small></div></div>)}{!data.activity.length && <EmptyState title="No recorded changes yet" description="Catalogue, pricing and reward edits will appear here." />}</section></div>
      {inHouse && <section className="sm-panel"><div className="sm-section-title"><h2>Recently added services</h2><Link to="/service/pricing">Manage pricing</Link><Link to="/service/rewards">Configure rewards</Link></div>{data.recentServices.map(row => <div className="sm-list-row" key={row.id}><div><strong>{row.name}</strong><span>{dateLabel(row.created_at)}</span></div><StatusBadge status={Number(row.status)} /></div>)}{!data.recentServices.length && <EmptyState />}</section>}
      <p className="sm-help">{data.definitions.dates} Operational metrics cover In-House services only. Partner operations await an approved ownership model.</p>
    </>}
  </div>;
}
