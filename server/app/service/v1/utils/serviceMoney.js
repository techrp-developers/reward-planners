// Paise and percentage values are parsed as decimal strings, never rounded from
// binary floating point. Public JSON may use numbers only after exact arithmetic.
function failure(message, code='INVALID_SERVICE_AMOUNT', status=409) { return Object.assign(new Error(message),{code,status}); }
function paise(value) {
  const raw=String(value??'0');
  if(!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(raw))throw failure('Invalid non-negative service amount.');
  const [whole,fraction='']=raw.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
}
function decimal(value) { const n=typeof value==='bigint'?value:paise(value);if(n<0n)throw failure('Negative service amount.');return `${n/100n}.${String(n%100n).padStart(2,'0')}`; }
function coins(value) {const raw=String(value??0);if(!/^\d{1,10}(?:\.0{1,2})?$/.test(raw))throw failure('Coins must be non-negative whole integers.');const n=BigInt(raw.split('.')[0]);if(n>2147483647n)throw failure('Coin balance exceeds its database range.');return Number(n);}
function reference(value){if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)throw failure('A stable positive financial reference is required.','INVALID_SERVICE_REFERENCE');return Number(value);}
function payable(price,redeemed=0){const result=paise(price)-BigInt(coins(redeemed))*100n;if(result<0n)throw failure('Redeemed coins exceed the saved order price.');return decimal(result);}
function percentageCoins(price,value){return Number(paise(price)*paise(value)/1000000n);}
function split(prices,total){const weights=prices.map(paise),target=paise(total),base=weights.reduce((a,b)=>a+b,0n);if(target>base)throw failure('Bundle offer exceeds its base value.');let remaining=target;return weights.map((weight,i)=>{const part=i===weights.length-1?remaining:base?target*weight/base:0n;remaining-=part;return Number(decimal(part));});}
function sum(values){return decimal(values.reduce((total,value)=>total+paise(value),0n));}
function line(price,quantity=1){return decimal(paise(price)*BigInt(reference(quantity)));}
module.exports={failure,paise,decimal,coins,reference,payable,percentageCoins,split,sum,line};
