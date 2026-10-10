const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const calls = [];
const context = vm.createContext({ URL, Headers, Request,
  document: { querySelector: () => ({ content: 'page-token' }) },
  window: { location: { href: 'https://localhost:7017/Admin/Members', origin: 'https://localhost:7017' },
    fetch: async (input, options) => { calls.push({ input, options }); return { ok: true }; } }
});
const root = path.join(__dirname, '../AdminGroupAssignment');
vm.runInContext(fs.readFileSync(path.join(root, 'wwwroot/js/admin-request-security.js'), 'utf8'), context);
(async () => {
  await context.window.fetch('/Admin/CreateMember', { method: 'POST', headers: { Accept: 'application/json' }, body: '{}' });
  assert.equal(calls.at(-1).options.headers.get('RequestVerificationToken'), 'page-token');
  assert.equal(calls.at(-1).options.headers.get('Accept'), 'application/json');
  assert.equal(calls.at(-1).options.body, '{}');
  const existing = { method: 'POST', headers: { RequestVerificationToken: 'form-token' } };
  await context.window.fetch('/Admin/EditMember', existing);
  assert.equal(calls.at(-1).options.headers.get('RequestVerificationToken'), 'form-token');
  assert.equal(existing.headers.RequestVerificationToken, 'form-token');
  await context.window.fetch('/Admin/Members');
  assert.equal(calls.at(-1).options, undefined);
  await context.window.fetch('https://external.invalid/Admin/CreateMember', { method: 'POST' });
  assert.equal(calls.at(-1).options.headers, undefined);
  await context.window.fetch('/Other/Action', { method: 'POST' });
  assert.equal(calls.at(-1).options.headers, undefined);
  await context.window.fetch(new Request('https://localhost:7017/Admin/CreateMember', { method: 'POST', body: '{}' }));
  assert.equal(calls.at(-1).options.headers.get('RequestVerificationToken'), 'page-token');
  const controller = fs.readFileSync(path.join(root, 'Controllers/AdminController.cs'), 'utf8');
  assert.match(controller, /\[AutoValidateAntiforgeryToken\]/);
  assert.match(controller, /override void OnActionExecuting/);
  const layout = fs.readFileSync(path.join(root, 'Views/Shared/_AdminLayout.cshtml'), 'utf8');
  assert.match(layout, /GetAndStoreTokens\(Context\)/);
  assert.ok(layout.indexOf('admin-request-security.js') < layout.indexOf('js/admin.js'));
  assert.match(controller, /\[HttpPost\]\s+public IActionResult Logout\(\)/);
  assert.match(layout, /<form[^>]*asp-action="Logout"[^>]*method="post"/);
  assert.doesNotMatch(layout, /<a[^>]*asp-action="Logout"/);
  const sidebar = fs.readFileSync(path.join(root, 'Views/Shared/_AdminSidebar.cshtml'), 'utf8');
  assert.match(sidebar, /<form[^>]*asp-action="Logout"[^>]*method="post"/);
  console.log('17 request security checks passed. No API writes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
