const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const nodes = new Map();
const node = id => { if (!nodes.has(id)) nodes.set(id, {textContent:'',innerHTML:'',value:'',querySelectorAll(){return [];}}); return nodes.get(id); };
const context = vm.createContext({window:{},document:{addEventListener(){},getElementById:node}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../AdminGroupAssignment/wwwroot/js/admin-list-sort.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../AdminGroupAssignment/wwwroot/js/staff.js'),'utf8'),context);
let checks=0;
for (const raw of [undefined,null,'',' ']) {
    context.sample={Status:raw};
    assert.equal(vm.runInContext('staffStatus(sample)',context),'Not reported'); checks++;
    assert.equal(vm.runInContext('isActive(sample) || isInactive(sample)',context),false); checks++;
}
for (const raw of ['Active',' activated ','ENABLED']) { context.sample={Status:raw}; assert.equal(vm.runInContext('isActive(sample)',context),true); checks++; }
for (const raw of ['Inactive',' deactivated ','DISABLED']) { context.sample={Status:raw}; assert.equal(vm.runInContext('isInactive(sample)',context),true); checks++; }
context.samples=[{Id:1},{Id:2,Status:'Active'},{Id:3,Status:'Inactive'},{Id:4,Status:'string'}];
vm.runInContext('staffRows=samples',context);
for (const [filter, ids] of [['',[1,2,3,4]],['Active',[2]],['Inactive',[3]],['unknown',[1,4]]]) {
    node('staffStatusFilter').value=filter; vm.runInContext('filterStaff()',context);
    assert.deepEqual(Array.from(vm.runInContext('visibleStaff.map(staffId)',context)),ids); checks++;
}
vm.runInContext('staffRows=[{Id:1},{Id:2,Status:"string"}];clearStaffFilters()',context);
assert.equal(node('activeStaff').textContent,'Not reported'); checks++;
assert.ok(node('staffTableBody').innerHTML.includes('Not reported')); checks++;
assert.equal(vm.runInContext('staffStatus({accountStatus:"Active"})',context),'Active'); checks++;
vm.runInContext('openStaffForm({Id:15,StaffName:"Disposable staff"})',context);
assert.ok(node('staffMessage').textContent.includes('No changes were sent')); checks++;
assert.equal(node('staffMessage').hidden,false); checks++;
vm.runInContext('editingStaff={Id:15};saveStaff({preventDefault(){}})',context);
assert.ok(node('staffFormError').textContent.includes('No changes were sent')); checks++;
console.log(`${checks} staff status checks passed. No API writes.`);
