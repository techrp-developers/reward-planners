function fail(field,message){const e=new Error(message);e.status=400;e.fields={[field]:message};throw e;}
function id(value,field){if(typeof value==='number' && (!Number.isSafeInteger(value)||value<=0)) fail(field,'Must be a positive safe integer or decimal string');if(!/^[1-9]\d*$/.test(String(value))||BigInt(value)>18446744073709551615n) fail(field,'Must be a positive ID');return String(value);}
function text(v,key,max,required=true){if(v==null&&!required)return null;if(typeof v!=='string'||v.trim().length>(max)||(!v.trim()&&required))fail(key,`Must be ${required?'a non-empty string':'a string'} of at most ${max} characters`);return v.trim();}
function page(q){const p=q.page===undefined?1:Number(q.page),l=q.limit===undefined?20:Number(q.limit);if(!Number.isSafeInteger(p)||p<1||!Number.isSafeInteger(l)||l<1||l>100||!Number.isSafeInteger((p-1)*l))fail('pagination','Invalid page or limit');return [l,(p-1)*l];}
module.exports={fail,id,text,page};
