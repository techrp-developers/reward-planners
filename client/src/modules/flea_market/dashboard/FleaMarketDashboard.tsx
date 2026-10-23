import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchDashboardSummary, type DashboardFilters } from '../api/fleaMarketDashboardApi';
import { listFleaMarketCompanies } from '../api/fleaMarketCompaniesApi';
import { listSchedules } from '../api/fleaMarketScheduleApi';
import { routes } from '../../../routes';

const money=(value:number|string)=>Number(value).toLocaleString('en-IN',{style:'currency',currency:'INR'});
const card='rounded-2xl border border-purple-100 bg-white p-5 shadow-sm';
export default function FleaMarketDashboard() {
  const [filters,setFilters]=useState<DashboardFilters>({});
  const companies=useQuery({queryKey:['flea-market','companies'],queryFn:listFleaMarketCompanies});
  const schedules=useQuery({queryKey:['flea-market','schedules'],queryFn:()=>listSchedules()});
  const summary=useQuery({queryKey:['flea-market','dashboard',filters],queryFn:()=>fetchDashboardSummary(filters)});
  const data=summary.data;
  const update=(patch:Partial<DashboardFilters>)=>setFilters(current=>({...current,...patch}));
  const selected=schedules.data?.filter(e=>!filters.companyId||e.companyId===filters.companyId)??[];
  const cards=data ? [
    ['Events',data.metrics.totalEvents],['Participating vendors',data.metrics.participatingVendors],['Selling vendors',data.metrics.sellingVendors],
    ['Invoices',data.metrics.totalInvoices],['Customer checkouts',data.metrics.customerCheckouts],['Units sold',data.metrics.unitsSold],
    ['Gross invoiced',money(data.metrics.grossSales)],['Points redeemed',data.metrics.rewardPointsRedeemed],['Net invoiced',money(data.metrics.netInvoicedAmount)],
    ['Confirmed collections',money(data.metrics.confirmedPayments)],['Unconfirmed / outstanding',money(data.metrics.outstandingPayments)],['Assigned stock available',data.metrics.stockAvailable],
  ]:[];
  return <div className="space-y-6 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold text-[#852BAF]">Flea Market Dashboard</h1><button className="rounded-xl bg-[#852BAF] px-4 py-2 text-white" onClick={()=>void summary.refetch()}>Refresh</button></div>
    <div className={`${card} grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
      <label className="text-sm">Company<select className="mt-1 w-full rounded-lg border p-2" value={filters.companyId??''} onChange={e=>update({companyId:Number(e.target.value)||undefined,scheduleId:undefined})}><option value="">All companies</option>{companies.data?.map(c=><option key={c.companyId} value={c.companyId}>{c.companyName}</option>)}</select></label>
      <label className="text-sm">Event<select className="mt-1 w-full rounded-lg border p-2" value={filters.scheduleId??''} onChange={e=>update({scheduleId:Number(e.target.value)||undefined})}><option value="">All events</option>{selected.map(e=><option key={e.scheduleId} value={e.scheduleId}>{e.companyName} · {e.scheduledDate} · #{e.scheduleId}</option>)}</select></label>
      <label className="text-sm">Event date from<input className="mt-1 w-full rounded-lg border p-2" type="date" value={filters.fromDate??''} onChange={e=>update({fromDate:e.target.value||undefined})}/></label>
      <label className="text-sm">Event date to<input className="mt-1 w-full rounded-lg border p-2" type="date" value={filters.toDate??''} onChange={e=>update({toDate:e.target.value||undefined})}/></label>
    </div>
    {(companies.isError||schedules.isError)&&<div role="alert" className={card}>Filter options could not be loaded. <button onClick={()=>{void companies.refetch();void schedules.refetch();}}>Retry filters</button></div>}
    {summary.isPending&&<div role="status" className={card}>Loading dashboard…</div>}
    {summary.isError&&<div role="alert" className={card}>Dashboard could not be loaded. <button className="text-[#852BAF] underline" onClick={()=>void summary.refetch()}>Retry</button></div>}
    {data&&<>
      {Number(data.metrics.totalEvents)===0&&<div className={card}>No events match these filters. Create an event in Manage Event.</div>}
      {data.event&&<div className={`${card} border-l-4 border-l-[#FC3F78]`}><h2 className="font-bold">{data.event.companyName} · {data.event.locationName}</h2><p>{data.event.scheduledDate} · {data.event.startTime??'—'}–{data.event.endTime??'—'} · {data.event.status}</p></div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label,value])=><div key={String(label)} className={card}><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-[#852BAF]">{value}</p></div>)}</div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}><h2 className="mb-4 font-bold">Gross sales by invoice date</h2>{!data.salesTrend.length&&<p>No invoiced sales.</p>}{data.salesTrend.map(row=><div key={row.date} className="mb-3"><div className="flex justify-between gap-3 text-sm"><span>{row.date}</span><span>{money(row.grossSales)}</span></div><div className="mt-1 h-3 rounded bg-purple-50"><div className="h-3 rounded bg-gradient-to-r from-[#852BAF] to-[#FC3F78]" style={{width:`${Number(row.grossSales)/Math.max(...data.salesTrend.map(x=>Number(x.grossSales)),1)*100}%`}}/></div></div>)}</section>
        <section className={card}><h2 className="mb-4 font-bold">Top vendors · gross invoiced</h2>{!data.topVendors.length&&<p>No vendor sales.</p>}{data.topVendors.map(row=><div key={row.vendorId} className="mb-3"><div className="flex justify-between gap-3 text-sm"><span>{row.vendorName}</span><span>{money(row.grossSales)}</span></div><div className="mt-1 h-3 rounded bg-purple-50"><div className="h-3 rounded bg-[#852BAF]" style={{width:`${Number(row.grossSales)/Math.max(...data.topVendors.map(x=>Number(x.grossSales)),1)*100}%`}}/></div></div>)}</section>
        <section className={`${card} overflow-x-auto`}><h2 className="mb-3 font-bold">Recent invoices</h2>{!data.recentInvoices.length&&<p>No invoices.</p>}<table className="w-full text-left text-sm"><thead><tr><th>Invoice</th><th>Vendor</th><th>Net invoiced</th></tr></thead><tbody>{data.recentInvoices.map(row=><tr key={row.invoiceId} className="border-t"><td className="py-3"><Link className="text-[#852BAF] underline" to={`/flea-market/invoices/${row.invoiceId}`}>{row.invoiceNumber}</Link></td><td>{row.vendorName}</td><td>{money(row.netInvoicedAmount)}</td></tr>)}</tbody></table></section>
        <section className={card}><h2 className="mb-3 font-bold">Low assigned stock</h2>{!data.stockAlerts.length&&<p>No low-stock alerts.</p>}{data.stockAlerts.map(row=><p key={row.assignmentId} className="border-t py-2">{row.productName} · event #{row.scheduleId}: {row.stockAvailable} remaining</p>)}</section>
      </div>
      <section className={card}><h2 className="mb-3 font-bold">Payment collections</h2>{!data.paymentSummary.length&&<p>No recorded payment confirmations. Generated invoices alone do not confirm payment.</p>}{data.paymentSummary.map((row,i)=><p key={i}>{row.method} · {row.recipient} · {row.status} · {row.verification_source??'unverified'}: {money(row.amount)}</p>)}</section>
    </>}
    <nav className="flex flex-wrap gap-3">{[[routes.fleaMarket.manageEvent,'Manage Event'],[routes.fleaMarket.stock,'Add Stock'],[routes.fleaMarket.reports.vendorSales,'Vendor Sales Report'],[routes.fleaMarket.reports.purchaseHistory,'Purchase History']].map(([to,label])=><Link key={to} to={to} className="rounded-xl bg-[#852BAF] px-4 py-3 text-white">{label}</Link>)}{data?.event&&<Link className="rounded-xl bg-[#FC3F78] px-4 py-3 text-white" to={routes.fleaMarket.billing.page} state={data.event}>Start Billing</Link>}</nav>
  </div>;
}
