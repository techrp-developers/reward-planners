import { useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { eventVendors,eventProducts,addEventVendor,externalEventVendor,deactivateEventVendor,configureEventVendor,assignEventProduct,releaseEventProduct } from '../../api/fleaMarketEventApi';
import { searchVendors } from '../../api/fleaMarketVendorsApi';
import { listVendorStockPools } from '../../api/fleaMarketVendorStockApi';
import { useDebounce } from '../../../../common/hooks/useDebounce';
import type { FleaMarketSchedule } from '../../api/fleaMarketScheduleApi';

export default function EventAssignmentsPanel({event}:{event:FleaMarketSchedule}) {
  const client=useQueryClient();
  const [query,setQuery]=useState(''); const search=useDebounce(query,300);
  const [vendorId,setVendorId]=useState('');const [collection,setCollection]=useState('unconfigured');
  const [poolId,setPoolId]=useState('');const [qty,setQty]=useState('1');const [price,setPrice]=useState('');
  const [external,setExternal]=useState({companyName:'',fullName:'',email:'',phone:''});
  const vendors=useQuery({queryKey:['flea-market','event-vendors',event.scheduleId],queryFn:()=>eventVendors(event.scheduleId)});
  const products=useQuery({queryKey:['flea-market','event-products',event.scheduleId],queryFn:()=>eventProducts(event.scheduleId)});
  const options=useQuery({queryKey:['flea-market','vendor-search',search],queryFn:()=>searchVendors(search)});
  const pools=useQuery({queryKey:['flea-market','vendor-stock'],queryFn:listVendorStockPools});
  const mutation=useMutation({mutationFn:(work:()=>Promise<unknown>)=>work(),onSuccess:()=>{void client.invalidateQueries({queryKey:['flea-market']});}});
  const closed=['completed','cancelled'].includes(event.status);
  const input='rounded-lg border border-gray-200 p-2 text-sm';
  return <section className="space-y-5 rounded-2xl border border-purple-100 bg-white p-5">
    <h2 className="text-lg font-bold text-[#852BAF]">Manage Vendors & Event Products · {event.companyName} · #{event.scheduleId}</h2>
    {(vendors.isPending||products.isPending)&&<p role="status">Loading assignments…</p>}
    {(vendors.isError||products.isError||pools.isError||options.isError)&&<p role="alert">Assignments or stock options could not be loaded. <button onClick={()=>{void vendors.refetch();void products.refetch();void pools.refetch();void options.refetch();}}>Retry</button></p>}
    {mutation.isError&&<p role="alert" className="text-red-700">{mutation.error instanceof AxiosError?String(mutation.error.response?.data?.message||'Operation failed'):mutation.error.message}</p>}
    <p className="text-sm text-gray-600">{vendors.data?.filter(v=>v.status==='active').length??0} active vendors · {products.data?.length??0} product assignments · {products.data?.reduce((sum,p)=>sum+p.assigned_qty-p.sold_qty-p.released_qty,0)??0} reserved units remaining</p>
    {!closed&&<>
      <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();mutation.mutate(()=>addEventVendor(event.scheduleId,Number(vendorId),collection));}}>
        <input aria-label="Search existing vendor" placeholder="Search existing vendor" className={input} value={query} onChange={e=>setQuery(e.target.value)}/>
        <select aria-label="Existing vendor" className={input} required value={vendorId} onChange={e=>setVendorId(e.target.value)}><option value="">Select vendor</option>{options.data?.map(v=><option key={v.vendorId} value={v.vendorId}>{v.companyName||v.fullName}</option>)}</select>
        <select aria-label="Collection model" className={input} value={collection} onChange={e=>setCollection(e.target.value)}><option value="unconfigured">Collection not configured</option><option value="reward_planners">Reward Planners collects</option><option value="vendor">Vendor collects directly</option></select>
        <button disabled={mutation.isPending} className="rounded-lg bg-[#852BAF] px-3 py-2 text-white">Add vendor</button>
      </form>
      <details><summary className="cursor-pointer font-semibold">Register external vendor</summary><form className="mt-3 flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();mutation.mutate(()=>externalEventVendor(event.scheduleId,external));}}>{(['companyName','fullName','email','phone'] as const).map(key=><input key={key} aria-label={key} placeholder={key} type={key==='email'?'email':'text'} required={key!=='phone'} className={input} value={external[key]} onChange={e=>setExternal({...external,[key]:e.target.value})}/>)}<button disabled={mutation.isPending} className="rounded-lg bg-[#852BAF] px-3 py-2 text-white">Register for event</button></form></details>
    </>}
    <div className="space-y-2">{vendors.data?.map(v=><div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-purple-50 p-3 text-sm"><span className="flex-1">{v.company_name} · {v.participation_type} · {v.status}</span><select aria-label={`Collection for ${v.company_name}`} className={input} value={v.collection_model} disabled={closed||mutation.isPending} onChange={e=>mutation.mutate(()=>configureEventVendor(event.scheduleId,v.vendor_id,e.target.value))}><option value="unconfigured">Unconfigured</option><option value="reward_planners">Reward Planners collects</option><option value="vendor">Vendor collects</option></select>{!closed&&v.status==='active'&&<button disabled={mutation.isPending} onClick={()=>mutation.mutate(()=>deactivateEventVendor(event.scheduleId,v.vendor_id))}>Deactivate</button>}</div>)}</div>
    {!closed&&<form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();mutation.mutate(()=>assignEventProduct(event.scheduleId,Number(poolId),Number(qty),price));}}>
      <select aria-label="Stock pool" className={`${input} max-w-full`} value={poolId} required onChange={e=>setPoolId(e.target.value)}><option value="">Select participating vendor's stock pool</option>{pools.data?.filter(p=>p.status==='active'&&vendors.data?.some(v=>v.vendor_id===p.vendorId&&v.status==='active')).map(p=><option key={p.poolId} value={p.poolId}>{p.vendorName} · {p.productName} · {p.sku} · {p.availableQty} pooled</option>)}</select>
      <input aria-label="Assigned quantity" type="number" min="1" step="1" required className={`${input} w-28`} value={qty} onChange={e=>setQty(e.target.value)}/>
      <input aria-label="Event selling price" type="number" min="0" step="0.01" placeholder="Event price (optional)" className={input} value={price} onChange={e=>setPrice(e.target.value)}/>
      <button disabled={mutation.isPending} className="rounded-lg bg-[#FC3F78] px-3 py-2 text-white">Reserve for event</button>
    </form>}
    {!products.data?.length&&<p className="text-sm text-gray-500">No event products assigned. Top up vendor stock in Add Stock, then reserve it here.</p>}
    {products.data?.map(p=><div key={p.id} className="flex flex-wrap justify-between gap-3 border-t py-3 text-sm"><span>{p.product_name} · {p.sku} · assigned {p.assigned_qty} / sold {p.sold_qty} / released {p.released_qty} · ₹{p.sale_price} · {p.status}</span>{!closed&&p.status==='active'&&<button disabled={mutation.isPending} onClick={()=>mutation.mutate(()=>releaseEventProduct(event.scheduleId,p.id))}>Release unused reservation</button>}</div>)}
  </section>;
}
