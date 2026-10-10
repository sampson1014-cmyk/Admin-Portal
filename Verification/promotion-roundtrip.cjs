const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const base = path.join(__dirname, '../AdminGroupAssignment/wwwroot/js');
let checks = 0;
for (const prefix of ['reward', 'voucher']) {
  const context = vm.createContext({ document: { addEventListener() {} }, console });
  vm.runInContext(fs.readFileSync(path.join(base, `${prefix}s.js`), 'utf8'), context);
  for (const original of ['2026-10-09T01:00:00', '2026-10-31T15:59:00', '2026-10-31T15:59:00Z', '2026-10-31T23:59:00+08:00']) {
    context.original = original;
    assert.equal(vm.runInContext(`${prefix}IsoDate(${prefix}DateInput(original), original)`, context), original);
    checks++;
  }
  assert.equal(vm.runInContext(`${prefix}IsoDate('', null)`, context), null); checks++;
  assert.equal(vm.runInContext(`${prefix}IsoDate('2026-10-20T10:00', '2026-10-09T01:00:00')`, context), new Date('2026-10-20T10:00').toISOString()); checks++;
  if (prefix === 'voucher') {
    for (const [expression, expected] of [
      ['voucherSavedPointMatches({Point:10},10)', true],
      ['voucherSavedPointMatches({Point:0},10)', false],
      ['voucherSavedPointMatches({Point:0},0)', true],
      ['voucherSavedPointMatches({},0)', false]
    ]) { assert.equal(vm.runInContext(expression, context), expected); checks++; }
  }
}
console.log(`${checks} promotion round-trip checks passed. No API writes.`);
