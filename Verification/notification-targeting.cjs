const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let audience = 'device';
const fields = {};
const field = id => fields[id] ||= { value: '', hidden: false, reset() {} };
const calls = [];
const context = vm.createContext({
  document: {
    addEventListener() {}, getElementById: field,
    querySelector: () => ({ value: audience, checked: true })
  },
  window: { adminFetch: async (endpoint, options) => {
    calls.push({ endpoint, payload: JSON.parse(options.body) });
    return { ok: true, status: 200, text: async () => '"Send Success"' };
  } }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../AdminGroupAssignment/wwwroot/js/notifications.js'), 'utf8'), context);
const submit = () => context.sendNotification({ preventDefault() {} });
(async () => {
  field('notificationTitle').value = 'Receipt'; field('notificationBody').value = 'Recorded';
  field('notificationTarget').value = 'device-only';
  field('notificationPhone').value = '';
  await submit(); assert.equal(calls.length, 0);
  field('notificationPhone').value = '+60123456789';
  await submit(); assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.PhoneNumber, '+60123456789');
  assert.equal(calls[0].payload.DeviceId, 'device-only');
  assert.equal(calls[0].endpoint, '/Admin/SendNotificationByDevice');
  audience = 'all'; await submit();
  assert.equal(calls[1].endpoint, '/Admin/SendMemberNotification');
  assert.equal('PhoneNumber' in calls[1].payload, false);
  console.log('7 notification targeting checks passed. No API writes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
