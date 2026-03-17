/*
 * disableSync.js — "Disable Reclaim Sync"
 * Removes all "Reclaim : *" tags and clears stored Reclaim IDs.
 * If auto-sync is enabled, also deletes the tasks from Reclaim.ai.
 */

// ── Load-time singletons ──────────────────────────────────────────────────────

var _creds         = new Credentials();
var _prefs         = new Preferences();
var CRED_SVC       = 'com.kraigparkinson.reclaim-ai';
var API_BASE       = 'https://api.app.reclaim.ai/api';
var PREF_MAP       = 'reclaimTaskIdMap';
var PREF_AUTO_SYNC = 'autoSyncAfterAction';

// ── Preferences helpers ───────────────────────────────────────────────────────

function _readMap() {
  var stored = _prefs.read(PREF_MAP);
  if (!stored) { return {}; }
  try { return JSON.parse(stored); } catch (e) { return {}; }
}

function _hasReclaimId(task) {
  return !!_readMap()[task.id.primaryKey];
}

function _getReclaimId(task) {
  return _readMap()[task.id.primaryKey] || null;
}

function _clearReclaimId(task) {
  var map = _readMap();
  delete map[task.id.primaryKey];
  _prefs.write(PREF_MAP, JSON.stringify(map));
}

// ── Notification helper ───────────────────────────────────────────────────────

function _notify(title, subtitle) {
  var n = new Notification(title);
  if (subtitle) { n.subtitle = subtitle; }
  n.show(); // fire-and-forget — no need to await
}

// ── Tag helpers ───────────────────────────────────────────────────────────────

function _isUnderTag(tag, ancestor) {
  var current = tag;
  while (current.parent) {
    if (current.parent.id.primaryKey === ancestor.id.primaryKey) { return true; }
    current = current.parent;
  }
  return false;
}

function _getReclaimTags(task) {
  var root = null;
  for (var i = 0; i < flattenedTags.length; i++) {
    if (flattenedTags[i].name === 'Reclaim' && !flattenedTags[i].parent) { root = flattenedTags[i]; break; }
  }
  if (!root) { return []; }
  return task.tags.filter(function (t) { return _isUnderTag(t, root); });
}

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
    'Enter your API key to connect to Reclaim.\nFind it in Reclaim.ai \u2192 Settings \u2192 Integrations \u2192 API.'
  );
  var k = response.values['apiKey'].trim();
  await _creds.write(CRED_SVC, 'reclaim', k);
  return k;
}

async function _reclaimDelete(id, apiKey) {
  var req = new URL.FetchRequest();
  req.url = URL.fromString(API_BASE + '/tasks/' + id);
  req.method = 'DELETE';
  req.headers = { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' };
  var res = await req.fetch();
  if (res.statusCode === 401) { throw new Error('Invalid API key. Run "Configure Reclaim Sync" to update it.'); }
  // 404 means already gone from Reclaim — treat as success
  if (res.statusCode >= 400 && res.statusCode !== 404) {
    throw new Error('Reclaim error ' + res.statusCode + ': ' + res.bodyString);
  }
}

// ── Action ────────────────────────────────────────────────────────────────────

var action = new PlugIn.Action(async function (selection, sender) {
  try {
    var tasks      = selection.tasks;
    var tracked    = tasks.filter(function (t) { return _hasReclaimId(t); });
    var autoSync   = _prefs.read(PREF_AUTO_SYNC) === true;
    var willDelete = autoSync && tracked.length > 0;

    if (tracked.length > 0) {
      var confirmMsg =
        (tracked.length === 1 ? '1 task is' : tracked.length + ' tasks are') +
        ' currently tracked in Reclaim.ai.\n\n' +
        'Disabling sync will stop future synchronisation' + (willDelete
          ? ' and DELETE ' + (tracked.length === 1 ? 'it' : 'them') + ' from Reclaim.'
          : ' but will NOT delete ' + (tracked.length === 1 ? 'it' : 'them') + ' from Reclaim.') +
        ' Continue?';
      var confirm = new Alert('Disable Reclaim Sync', confirmMsg);
      confirm.addOption('Disable Sync');
      confirm.addOption('Cancel');
      var choice = await confirm.show();
      if (choice === 1) { return; }
    }

    // Collect Reclaim IDs before _clearReclaimId erases them
    var idsToDelete = willDelete
      ? tracked.map(function (t) { return _getReclaimId(t); }).filter(Boolean)
      : [];

    // Remove tags and clear stored IDs
    var disabled = 0;
    tasks.forEach(function (task) {
      var reclaimTags = _getReclaimTags(task);
      if (reclaimTags.length === 0 && !_hasReclaimId(task)) { return; }
      reclaimTags.forEach(function (t) { task.removeTag(t); });
      _clearReclaimId(task);
      disabled++;
    });

    var skipped = tasks.length - disabled;
    var msg = disabled === 1
      ? '1 task removed from Reclaim sync.'
      : disabled + ' tasks removed from Reclaim sync.';
    if (skipped > 0) {
      msg += '\n' + skipped + (skipped === 1 ? ' task was' : ' tasks were') + ' not enrolled in sync.';
    }

    // Delete from Reclaim in parallel if auto-sync is on
    if (idsToDelete.length > 0) {
      var apiKey       = await _requireApiKey();
      var deleted      = 0;
      var deleteFailed = 0;
      await Promise.all(idsToDelete.map(async function (id) {
        try { await _reclaimDelete(id, apiKey); deleted++; }
        catch (e) { deleteFailed++; }
      }));
      if (deleted > 0) {
        msg += '\n' + deleted + ' task' + (deleted !== 1 ? 's' : '') + ' deleted from Reclaim.';
      }
      if (deleteFailed > 0) {
        msg += '\n' + deleteFailed + ' task' + (deleteFailed !== 1 ? 's' : '') +
          ' could not be deleted from Reclaim (may already be removed).';
      }
    }

    _notify('Reclaim Sync Disabled', msg.replace(/\n/g, ' \u00b7 '));
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
