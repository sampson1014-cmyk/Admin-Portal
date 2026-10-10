const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.join(__dirname, '../AdminGroupAssignment/wwwroot/js');
const context = vm.createContext({window:{}, Intl});
vm.runInContext(fs.readFileSync(path.join(root, 'admin-list-sort.js'), 'utf8'), context);
const rows = [{id:10,name:'Zulu'}, {id:2,name:'alpha'}, {id:3,name:'Alpha'}];
for (const [mode, ids] of [['id-asc','2,3,10'], ['id-desc','10,3,2'], ['name-asc','2,3,10'], ['name-desc','10,2,3']])
    assert.equal(context.window.AdminListSort(rows, mode, row=>row.name, row=>row.id).map(row=>row.id).join(','), ids);
assert.equal(rows.map(row=>row.id).join(','), '10,2,3');
assert.equal(context.window.AdminListSort([], 'id-asc', row=>row.name, row=>row.id).length, 0);
for (const [file, helper] of [['merchant-list.js','displayMerchantValue'], ['outlets.js','displayOutletValue'], ['staff.js','displayStaffValue']]) {
    const page = vm.createContext({window:{addEventListener(){}}, document:{addEventListener(){}}, console});
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'), page);
    for (const [input, expected] of [[null,'Empty'], [undefined,'Empty'], ['   ','Empty'], [0,'0'], ['<tag>','&lt;tag&gt;']]) {
        page.input = input;
        assert.equal(vm.runInContext(helper+'(input)',page),expected);
    }
}
console.log('21 list-presentation checks passed. No API writes.');
