const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
process.env.TZ = 'Asia/Kuala_Lumpur';
let passed = 0;
for (const [file, input, iso] of [
  ['banners.js', 'bannerDateInput', 'bannerIsoDate'],
  ['stamp-campaigns.js', 'stampDateInput', 'stampIsoDate']
]) {
  const context = vm.createContext({ document: { addEventListener() {} }, Date, Set });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../AdminGroupAssignment/wwwroot/js', file), 'utf8'), context);
  for (const original of ['2026-10-31T15:59:00', '2026-10-10T04:00:00.1234567']) {
    assert.equal(context[iso](context[input](original), original), original);
    passed++;
  }
  assert.equal(context[iso]('2026-11-01T12:00', '2026-10-31T15:59:00'), '2026-11-01T04:00:00.000Z');
  passed++;
}
const controller = fs.readFileSync(path.join(__dirname, '../AdminGroupAssignment/Controllers/AdminController.cs'), 'utf8');
assert.equal((controller.match(/\/api\/ManageStamp\/GetAllStampPortal/g) || []).length, 2);
assert.equal(controller.includes('/api/ManageStamp/GetAllStamps'), false);
passed++;
console.log(`${passed} inactive-record/date checks passed`);
