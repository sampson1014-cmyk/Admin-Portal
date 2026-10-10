const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const base = path.join(__dirname, '../AdminGroupAssignment/wwwroot/js');
const context = vm.createContext({ document: { addEventListener() {} }, console });
vm.runInContext(fs.readFileSync(path.join(base, 'transactions.js'), 'utf8'), context);
let checks = 0;
function check(expression, expected) {
    assert.equal(vm.runInContext(expression, context), expected, expression);
    checks++;
}
check('referenceValue({Id:22,ReferenceNumber:"SALE-001"})', 'SALE-001');
check('memberValue({MemberId:"internal",MemberPhone:"+600000000001"})', '+600000000001');
check('memberValue({UserPhoneNumber:"+600000000001"})', '+600000000001');
check('memberValue({MemberName:"Lee",PhoneNumber:"+600000000001"})', 'Lee');
for (const key of ['DateAssign', 'ClaimDate', 'CreateDate', 'SpendTime', 'DateTime', 'AssignDate'])
    check(`dateValue({${key}:"2026-10-10T09:00:00"})`, '2026-10-10T09:00:00');
check('statusValue({})', 'Not reported');
check('statusValue({IsPaid:false})', 'Unpaid');
check('statusValue({IsPaid:true})', 'Paid');
check('statusValue({Status:"Void"})', 'Void');
vm.runInContext('currentTransactionType="stamps"', context);
check('amountValue({Id:3,TotalUseStamp:6,Amount:99})', 6);
check('statusValue({TotalUseStamp:6})', 'Redeemed');
check('amountValue({TotalAssignStamp:2})', 2);
check('statusValue({TotalAssignStamp:2})', 'Earned');
check('statusValue({TotalUseStamp:0})', 'No stamps redeemed');
check('statusValue({TotalUseStamp:0,TotalAssignStamp:1})', 'Earned');
check('amountValue({TotalUseStamp:0,TotalAssignStamp:1})', 1);
check('dateValue({ReceiveDate:"2026-10-10T09:00:00"})', '2026-10-10T09:00:00');
check('memberValue({Phone:"+600000000001"})', '+600000000001');
check('formatValue(amountValue({}))', '—');
check('formatValue(amountValue({TotalAssignStamp:0}))', '0 stamps');
vm.runInContext('currentTransactionType="topups"', context);
check('formatValue(amountValue({Amount:100}))', 'RM 100.00');
check('formatValue(amountValue({}))', '—');
vm.runInContext(fs.readFileSync(path.join(base, 'app-versions.js'), 'utf8'), context);
context.form = { elements: { namedItem(key) { return { value: {
    AndroidBuildNumber: '1.2.0', AndroidVersionCode: '12', IOSBuildNumber: '1.2.0', IOSVersionCode: '12', Setting: 'provider-value'
}[key] }; } } };
check('versionPayload(form).AndroidVersionCode', 12);
check('versionPayload(form).Setting', 'provider-value');
check('expandVersionRows([{AndroidBuildNumber:"1.2",AndroidVersionCode:12,IOSBuildNumber:"1.3",IOSVersionCode:13}]).length', 2);
check('expandVersionRows([{AndroidBuildNumber:"1.2",AndroidVersionCode:12}])[0].VersionCode', 12);
check('versionStatus({})', 'Not reported');
check('extractVersionArray({AndroidBuildNumber:"1.2"}).length', 1);
check('versionPlatform({OperatingSystem:"Android"})', 'Android');
check('versionNumber({BuildNumber:"1.0.0"})', '1.0.0');
check('versionMinimum({VersionCode:0})', '0');
check('versionEditSource({},[{OperatingSystem:"Android",BuildNumber:"1.0.0",VersionCode:1,Setting:"0"},{OperatingSystem:"iOS",BuildNumber:"1.1.0",VersionCode:2,Setting:"0"}]).Setting', '0');
check('versionEditSource({},[{OperatingSystem:"Android",Setting:"0"},{OperatingSystem:"iOS",Setting:"1"}]).Setting', '');
for (const invalid of ['', '-1', '1.5', '2147483648', 'abc']) {
    context.form.elements.namedItem = key => ({ value: key.endsWith('VersionCode') ? invalid : 'existing-value' });
    assert.throws(() => vm.runInContext('versionPayload(form)', context)); checks++;
}
console.log(`${checks} transaction and version checks passed. No API writes were made.`);
