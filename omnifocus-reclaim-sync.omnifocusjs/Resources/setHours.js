/*
 * setHours.js — "Set Reclaim Hours"
 * Fetches the user's available scheduling hour types from Reclaim.ai and tags
 * selected tasks with "Reclaim : Hours : [scheme name]" (e.g. Working Hours).
 */

// ── Load-time singletons ──────────────────────────────────────────────────────

var _creds         = new Credentials();
var _prefs         = new Preferences();
var CRED_SVC       = 'com.kraigparkinson.reclaim-ai';
var API_BASE       = 'https://api.app.reclaim.ai/api';
var PREF_AUTO_SYNC = 'autoSyncAfterAction';
var PLUGIN_ID      = 'com.kraigparkinson.omnifocus-reclaim-sync';

// ── API helpers ───────────────────────────────────────────────────────────────

async function _getApiKey() {
  try { var r = await _creds.read(CRED_SVC); return r ? r.password : null; } catch (e) { return null; }
}

async function _requireApiKey() {
  var key = await _getApiKey();
  if (key) { return key; }
  var form = new Form();
  form.addField(new Form.Field.String('apiKey', 'Reclaim.ai API Key', null));
  form.validate = function (f) { return (f.values['apiKey'] || '').trim().length > 0; };
  var response = await form.show(
    'Reclaim.ai API Key Required',
    'Enter your API key to enable sync.\nFind it in Reclaim.ai \u2192 Settings \u2192 Integrations \u2192 API.'
  );
  var k = response.values['apiKey'].trim();
  await _creds.write(CRED_SVC, 'reclaim', k);
  return k;
}

async function _reclaimFetch(method, path, body, apiKey) {
  var req = new URL.FetchRequest();
  req.url = URL.fromString(API_BASE + path);
  req.method = method;
  req.headers = { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (body != null) { req.bodyString = JSON.stringify(body); }
  var res = await req.fetch();
  if (res.statusCode === 401) { throw new Error('Invalid API key. Run "Configure Reclaim Sync" to update it.'); }
  if (res.statusCode >= 400)  { throw new Error('Reclaim error ' + res.statusCode + ': ' + res.bodyString); }
  if (!res.bodyString || res.bodyString.trim() === '') { return null; }
  return JSON.parse(res.bodyString);
}

// ── Scheme helpers ────────────────────────────────────────────────────────────

// Returns the display name for a scheme object.
// Uses the API-provided `title` field (already human-readable for both
// built-in and custom schemes) and falls back to policyType if absent.
function _schemeTitle(scheme) {
  return (scheme.title && scheme.title.trim()) ? scheme.title.trim() : (scheme.policyType || String(scheme.id));
}

// ── Notification helper ───────────────────────────────────────────────────────

function _notify(title, subtitle) {
  var n = new Notification(title);
  if (subtitle) { n.subtitle = subtitle; }
  n.show(); // fire-and-forget — no need to await
}

// ── Tag helpers ───────────────────────────────────────────────────────────────

function _getRootTag() {
  for (var i = 0; i < flattenedTags.length; i++) {
    if (flattenedTags[i].name === 'Reclaim' && !flattenedTags[i].parent) { return flattenedTags[i]; }
  }
  return new Tag('Reclaim');
}

function _getOrCreateChildTag(name, parent) {
  var tag = parent.tagNamed(name);
  if (!tag) { tag = new Tag(name, parent); }
  return tag;
}

function _hasTag(task, tag) {
  if (!tag) { return false; }
  return task.tags.some(function (t) { return t.id.primaryKey === tag.id.primaryKey; });
}

function _removeHoursTags(task) {
  var root = null;
  for (var i = 0; i < flattenedTags.length; i++) {
    if (flattenedTags[i].name === 'Reclaim' && !flattenedTags[i].parent) { root = flattenedTags[i]; break; }
  }
  if (!root) { return; }
  var hoursParent = root.tagNamed('Hours');
  if (!hoursParent) { return; }
  var toRemove = task.tags.filter(function (t) {
    return t.parent && t.parent.id.primaryKey === hoursParent.id.primaryKey;
  });
  toRemove.forEach(function (t) { task.removeTag(t); });
}

// ── Action ────────────────────────────────────────────────────────────────────

var action = new PlugIn.Action(async function (selection, sender) {
  try {
    var apiKey = await _requireApiKey();

    // Fetch available scheduling hour types from the user's Reclaim account.
    // GET /api/timeschemes returns the full list (WORK, PERSONAL, MEETING, CUSTOM, etc.)
    // including user-created custom schemes. Inline the request so we can
    // capture the raw HTTP status code for diagnostics.
    var schemes = [];
    var fetchError = null;
    try {
      var schemeReq = new URL.FetchRequest();
      schemeReq.url = URL.fromString(API_BASE + '/timeschemes');
      schemeReq.method = 'GET';
      schemeReq.headers = { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' };
      var schemeRes = await schemeReq.fetch();
      var body = schemeRes.bodyString ? schemeRes.bodyString.trim() : '';

      console.log('[setHours] GET /timeschemes → HTTP ' + schemeRes.statusCode);
      console.log('[setHours] Response body: ' + body);

      if (schemeRes.statusCode === 401) {
        fetchError = new Error('HTTP 401 — API key rejected');
      } else if (schemeRes.statusCode >= 400) {
        fetchError = new Error('HTTP ' + schemeRes.statusCode + ': ' + body.slice(0, 200));
      } else if (!body) {
        fetchError = new Error('HTTP ' + schemeRes.statusCode + ' with empty response body');
      } else {
        var parsed = JSON.parse(body);
        if (Array.isArray(parsed)) {
          // Each item has { id, userId, status, policyType, title, ... }.
          // Only show ACTIVE schemes; skip ONE_OFF (task-specific) and INHERITED (system defaults).
          schemes = parsed.filter(function (s) {
            return s && s.id != null && s.status === 'ACTIVE' &&
                   s.policyType !== 'ONE_OFF' && s.policyType !== 'INHERITED';
          });
          console.log('[setHours] Usable schemes: ' + schemes.map(function(s){ return _schemeTitle(s); }).join(', '));
          if (schemes.length === 0) {
            fetchError = new Error('HTTP ' + schemeRes.statusCode + ' — no active schemes. Raw: ' + body.slice(0, 300));
          }
        } else {
          fetchError = new Error('HTTP ' + schemeRes.statusCode + ' — non-array body: ' + body.slice(0, 300));
        }
      }
    } catch (e) { fetchError = fetchError || e; }

    if (schemes.length === 0) {
      var detail = fetchError
        ? '\n\nAPI error: ' + fetchError.message
        : '\n\nThe endpoint returned no scheduling hours.';
      var noSchemes = new Alert('Set Reclaim Hours',
        'Could not load scheduling hours from Reclaim.ai.' + detail);
      noSchemes.addOption('OK');
      await noSchemes.show();
      return;
    }

    // Build parallel arrays for Form.Field.Option.
    // Values are UUID strings; labels use the API-provided title (works for built-in and custom schemes).
    var schemeIdStrs = schemes.map(function (s) { return String(s.id); });
    var schemeNames  = schemes.map(function (s) { return _schemeTitle(s); });
    var taskWord     = selection.tasks.length === 1 ? 'this task' : 'these tasks';

    var form = new Form();
    form.addField(new Form.Field.Option('scheme', 'Scheduling Hours', schemeIdStrs, schemeNames, schemeIdStrs[0]));

    var response = await form.show(
      'Set Reclaim Hours',
      'Confirm Scheduling Hours.'
    );

    var selectedIdStr = response.values['scheme'];
    var selectedScheme = schemes.filter(function (s) { return String(s.id) === selectedIdStr; })[0];
    var selectedName  = _schemeTitle(selectedScheme);

    // Apply tag: Reclaim : Hours : [friendly label]
    var root      = _getRootTag();
    var syncTag   = _getOrCreateChildTag('Sync', root);
    var hoursRoot = _getOrCreateChildTag('Hours', root);
    var hoursTag  = _getOrCreateChildTag(selectedName, hoursRoot);

    selection.tasks.forEach(function (task) {
      if (!_hasTag(task, syncTag)) { task.addTag(syncTag); }
      _removeHoursTags(task);
      task.addTag(hoursTag);
    });

    var count    = selection.tasks.length;
    var autoSync = _prefs.read(PREF_AUTO_SYNC) === true;
    var msg      = (count === 1 ? '1 task' : count + ' tasks') +
      ' set to schedule in \u201c' + selectedName + '\u201d.' +
      (autoSync ? '' : '\n\nRun "Sync Selected" or "Sync All" to push to Reclaim.');

    _notify('Hours Set', msg.replace(/\n/g, ' \u00b7 '));

    if (autoSync) {
      _prefs.write('quietSync', true);
      await PlugIn.find(PLUGIN_ID).action('syncSelected').perform(selection);
    }
  } catch (e) {
    var err = new Alert('Reclaim Sync Error', String(e));
    err.addOption('OK');
    await err.show();
  }
});

action.validate = function (selection, sender) {
  return selection.tasks.length > 0;
};

action
