import { fleaMarketClient } from './fleaMarketClient';
export interface EventVendor {id:number;vendor_id:number;company_name:string;full_name:string;participation_type:string;status:string;collection_model:string}
export interface EventProduct {id:number;pool_id:number;product_name:string;sku:string;vendor_id:number;assigned_qty:number;sold_qty:number;released_qty:number;sale_price:string;status:string}
const path=(id:number)=>`/schedules/${id}/manage`;
export const eventVendors=async(id:number)=>(await fleaMarketClient.get<{data:EventVendor[]}>(`${path(id)}/vendors`)).data.data;
export const eventProducts=async(id:number)=>(await fleaMarketClient.get<{data:EventProduct[]}>(`${path(id)}/products`)).data.data;
export const addEventVendor=async(id:number,vendorId:number,collectionModel:string)=>fleaMarketClient.post(`${path(id)}/vendors`,{vendorId,collectionModel});
export const externalEventVendor=async(id:number,body:{companyName:string;fullName:string;email:string;phone:string})=>fleaMarketClient.post(`${path(id)}/external-vendors`,body);
export const deactivateEventVendor=async(id:number,vendorId:number)=>fleaMarketClient.delete(`${path(id)}/vendors/${vendorId}`);
export const configureEventVendor=async(id:number,vendorId:number,collectionModel:string)=>fleaMarketClient.patch(`${path(id)}/vendors/${vendorId}`,{collectionModel});
export const assignEventProduct=async(id:number,poolId:number,assignedQty:number,eventSellingPrice:string)=>fleaMarketClient.post(`${path(id)}/products`,{poolId,assignedQty,eventSellingPrice:eventSellingPrice===''?null:eventSellingPrice});
export const releaseEventProduct=async(id:number,assignmentId:number)=>fleaMarketClient.delete(`${path(id)}/products/${assignmentId}`);
