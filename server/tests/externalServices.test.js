const test=require('node:test');const assert=require('node:assert/strict');
const v=require('../app/ExternalServices/CleaningResto/validators/enquiryValidator');
test('IDs preserve BIGINT strings and reject unsafe numeric input',()=>{assert.equal(v.id('18446744073709551615','id'),'18446744073709551615');assert.throws(()=>v.id(Number.MAX_SAFE_INTEGER+1,'id'),{status:400});assert.throws(()=>v.id('18446744073709551616','id'),{status:400});});
test('pagination caps page size',()=>{assert.deepEqual(v.page({page:'2',limit:'10'}),[10,10]);assert.throws(()=>v.page({limit:'101'}),{status:400});});
