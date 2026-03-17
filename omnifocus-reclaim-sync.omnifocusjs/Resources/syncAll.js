/*
 * syncAll.js — "Sync All with Reclaim"
 * Bidirectional sync for every OmniFocus task tagged "Reclaim : Sync".
 */

// ── Load-time singletons (must be constructed here, not inside functions) ─────

var _creds = new Credentials();
var _prefs = new Preferences();   // shared across all plugin scripts

var CRED_SVC = 'com.kraigparkinson.reclaim-ai';
var API_BASE = 'https://api.app.reclaim.ai/api';
var PREF_MAP = 'reclaimTaskIdMap'; // key used in Preferences

// ── Task ID mapping (stored in Preferences, keyed by task.id.primaryKey) ─────

function _getReclaimId(task) {
  var stored = _prefs.read(PREF_MAP);
  if (!stored) { return null; }
  try { return JSON.parse(stored)[task.id.primaryKey] || null; } catch (e) { return null; }
}

function _setReclaimId(task, reclaimId) {
  var stored = _prefs.read(PREF_MAP);
  var map;
  try { map = stored ? JSON.parse(stored) : {}; } catch (e) { map = {}; }
  map[task.id.primaryKey] = reclaimId;
  _prefs.write(PREF_MAP, JSON.stringify(map));
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

// Returns the display name for a time scheme, matching what setHours.js writes as the OmniFocus tag name.
// Uses the API-provided `title` field so custom schemes are handled correctly.
function _schemeTitle(scheme) {
  return (scheme.title && scheme.title.trim()) ? scheme.title.trim() : (scheme.policyType || String(scheme.id));
}

// Returns the name of the "Reclaim : Hours : *" child tag on a task (e.g.
// "Working Hours"), or null if none is set.
function _getScheduleSchemeFromTags(task) {
  var root = null;
  for (var _i = 0; _i < flattenedTags.length; _i++) {
    if (flattenedTags[_i].name === 'Reclaim' && !flattenedTags[_i].parent) { root = flattenedTags[_i]; break; }
  }
  if (!root) { return null; }
  var hoursParent = root.tagNamed('Hours');
  if (!hoursParent) { return null; }
  for (var i = 0; i < task.tags.length; i++) {
    var t = task.tags[i];
    if (t.parent && t.parent.id.primaryKey === hoursParent.id.primaryKey) { return t.name; }
  }
  return null;
}

// Maps the display-label tag names written by setPriority.js to the Reclaim API enum values.
var PRIORITY_TAG_TO_API = {
  'P1 \u2014 Critical': 'P1',
  'P2 \u2014 High':     'P2',
  'P3 \u2014 Medium':   'P3',
  'P4 \u2014 Low':      'P4'
};

// Returns the "Reclaim : Priority : *" child tag name on a task (e.g. "P2 — High"),
// or null if none is set.
function _getPriorityFromTags(task) {
  var root = null;
  for (var _i = 0; _i < flattenedTags.length; _i++) {
    if (flattenedTags[_i].name === 'Reclaim' && !flattenedTags[_i].parent) { root = flattenedTags[_i]; break; }
  }
  if (!root) { return null; }
  var priorityParent = root.tagNamed('Priority');
  if (!priorityParent) { return null; }
  for (var i = 0; i < task.tags.length; i++) {
    var t = task.tags[i];
    if (t.parent && t.parent.id.primaryKey === priorityParent.id.primaryKey) { return t.name; }
  }
  return null;
}

// ── Notification helper ───────────────────────────────────────────────────────

function _notify(title, subtitle) {
  var n = new Notification(title);
  if (subtitle) { n.subtitle = subtitle; }
  n.show(); // fire-and-forget — no need to await
}

function _getAllSyncTasks() {
  var root = null; for (var _i = 0; _i < flattenedTags.length; _i++) { if (flattenedTags[_i].name === 'Reclaim' && !flattenedTags[_i].parent) { root = flattenedTags[_i]; break; } }
  if (!root) { return []; }
  var syncTag = root.tagNamed('Sync');
  if (!syncTag) { return []; }
  return flattenedTasks.filter(function (t) { return !t.dropped && _hasTag(t, syncTag); });
}

// ── Credential helpers ────────────────────────────────────────────────────────

async function _getApiKey() {
  try {
    var r = await _creds.read(CRED_SVC);
    return r ? r.password : null;
  } catch (e) { return null; }
}

async function _promptForApiKey() {
  var form = new Form();
  form.addField(new Form.Field.String('apiKey', 'Reclaim.ai API Key', null));
  form.validate = function (f) { return (f.values['apiKey'] || '').trim().length > 0; };
  var response = await form.show(
    'Reclaim.ai API Key Required',
    'Enter your API key to enable sync.\nFind it in Reclaim.ai \u2192 Settings \u2192 Integrations \u2192 API.'
  );
  var key = response.values['apiKey'].trim();
  await _creds.write(CRED_SVC, 'reclaim', key);
  return key;
}

async function _requireApiKey() {
  var key = await _getApiKey();
  return key || (await _promptForApiKey());
}

// ── Reclaim API ───────────────────────────────────────────────────────────────

async function _reclaimFetch(method, path, body, apiKey) {
  var req = new URL.FetchRequest();
  req.url = URL.fromString(API_BASE + path);
  req.method = method;
  req.headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (body != null) { req.bodyString = JSON.stringify(body); }

  var res = await req.fetch();
  if (res.statusCode === 401) { throw new Error('Invalid API key. Run "Configure Reclaim Sync" to update it.'); }
  if (res.statusCode === 404) { var e404 = new Error('Not found: ' + path); e404.statusCode = 404; throw e404; }
  if (res.statusCode >= 400)  { throw new Error('Reclaim error ' + res.statusCode + ': ' + res.bodyString); }
  if (!res.bodyString || res.bodyString.trim() === '') { return null; }
  return JSON.parse(res.bodyString);
}

// ── Cross-link helpers ────────────────────────────────────────────────────────

// Sentinel that marks where we append the Reclaim URL in OmniFocus notes.
var RECLAIM_LINK_MARKER = '\n\n— Reclaim: ';

// Returns the task note with any previously-appended Reclaim URL stripped out.
function _baseNote(task) {
  var note = task.note || '';
  var idx  = note.indexOf(RECLAIM_LINK_MARKER);
  return idx >= 0 ? note.substring(0, idx) : note;
}

// Appends (or replaces) the Reclaim URL at the end of the OmniFocus task note.
function _writeReclaimUrl(task, reclaimId) {
  task.note = _baseNote(task) + RECLAIM_LINK_MARKER + 'View in Reclaim → https://app.reclaim.ai/tasks/' + reclaimId;
}

// Returns the OmniFocus deep-link URL for a task.
function _ofUrl(task) {
  return 'omnifocus:///task/' + task.id.primaryKey;
}

// ── Payload builder ───────────────────────────────────────────────────────────

// schemeMap: { [schemeName]: schemeId } — built once per sync batch from
// GET /timeschemes so we only make the API call once regardless of
// how many tasks are being synced.
function _buildPayload(task, schemeMap) {
  // Build the notes field: original note + OmniFocus deep link (strip any
  // previously-appended Reclaim URL so it isn't doubled up on round-trips).
  // Note: omnifocus:// links don't open from Reclaim's Safari SSB, but the
  // URL is preserved for copying or opening from a native browser.
  var base  = _baseNote(task);
  var notes = base + (base ? '\n\n' : '') + '[View in OmniFocus](' + _ofUrl(task) + ')';

  var payload = {
    title:  task.name,
    notes:  notes,
    status: task.completionDate ? 'COMPLETE' : 'NEW'
  };
  // Always include due and snoozeUntil — explicit null clears the field in Reclaim
  // when the user removes a date in OmniFocus.
  payload.due         = task.dueDate   ? task.dueDate.toISOString()   : null;
  payload.snoozeUntil = task.deferDate ? task.deferDate.toISOString() : null;

  // Duration from OmniFocus estimated minutes
  var mins = task.estimatedMinutes || null;
  if (mins) {
    payload.duration     = mins;
    payload.minChunkSize = Math.min(30, mins);
    payload.maxChunkSize = mins;
  }

  // Scheduling hours from "Reclaim : Hours : [name]" tag
  var schemeName = _getScheduleSchemeFromTags(task);
  if (schemeName && schemeMap && schemeMap[schemeName] != null) {
    payload.timeSchemeId = schemeMap[schemeName];
  }

  // Priority from "Reclaim : Priority : [label]" tag — translate display label to API enum value.
  var priorityTag = _getPriorityFromTags(task);
  if (priorityTag) {
    var priorityApi = PRIORITY_TAG_TO_API[priorityTag];
    if (priorityApi) { payload.priority = priorityApi; }
  }

  var root       = _getRootTag();
  var upNextTag  = root ? root.tagNamed('Up Next')  : null;
  var splitUpTag = root ? root.tagNamed('Split Up') : null;
  payload.onDeck  = _hasTag(task, upNextTag);
  payload.splitUp = _hasTag(task, splitUpTag);

  return payload;
}

// ── Sync one task ─────────────────────────────────────────────────────────────

async function _syncOneTask(task, apiKey, schemeMap) {
  var existingId = _getReclaimId(task);
  var payload    = _buildPayload(task, schemeMap);
  var reclaimTask;

  if (existingId) {
    try {
      reclaimTask = await _reclaimFetch('PATCH', '/tasks/' + existingId, payload, apiKey);
    } catch (e) {
      if (e.statusCode === 404) {
        reclaimTask = await _reclaimFetch('POST', '/tasks', payload, apiKey);
        _setReclaimId(task, String(reclaimTask.id));
      } else { throw e; }
    }
  } else {
    reclaimTask = await _reclaimFetch('POST', '/tasks', payload, apiKey);
    _setReclaimId(task, String(reclaimTask.id));
  }

  // Write the Reclaim URL back into the OmniFocus task note for easy navigation.
  if (reclaimTask) {
    _writeReclaimUrl(task, String(reclaimTask.id));

    // Sync dates back from Reclaim → OmniFocus (bidirectional).
    // Reclaim may adjust or receive edits the user made directly in Reclaim.
    // Only update when the field is present in the response (guard against
    // partial responses that omit the key entirely).
    if ('due' in reclaimTask) {
      task.dueDate   = reclaimTask.due        ? new Date(reclaimTask.due)        : null;
    }
    if ('snoozeUntil' in reclaimTask) {
      task.deferDate = reclaimTask.snoozeUntil ? new Date(reclaimTask.snoozeUntil) : null;
    }
  }

  if (reclaimTask && reclaimTask.status === 'COMPLETE' && !task.completionDate) {
    task.markComplete();
  }
  return reclaimTask;
}

// ── Action ────────────────────────────────────────────────────────────────────

var action = new PlugIn.Action(async function (selection, sender) {
  try {
    var apiKey = await _requireApiKey();
    var tasks  = _getAllSyncTasks();

    if (tasks.length === 0) {
      var none = new Alert('Sync All', 'No tasks are tagged for Reclaim sync.\n\nUse "Enable Reclaim Sync" on tasks you want to sync.');
      none.addOption('OK');
      await none.show();
      return;
    }

    // Tell the user sync has started so the wait feels intentional
    _notify('Sync All', 'Syncing ' + tasks.length + ' task' + (tasks.length !== 1 ? 's' : '') + ' with Reclaim\u2026');

    // Fetch available time schemes once for the whole batch so _buildPayload
    // can set timeSchemeId without an extra API call per task.
    // GET /timeschemes returns the full list including PERSONAL, CUSTOM, etc.
    var schemeMap = {};
    try {
      var schemeList = await _reclaimFetch('GET', '/timeschemes', null, apiKey);
      if (Array.isArray(schemeList)) {
        schemeList.forEach(function (s) {
          if (s && s.id != null && s.status === 'ACTIVE' &&
              s.policyType !== 'ONE_OFF' && s.policyType !== 'INHERITED') {
            schemeMap[_schemeTitle(s)] = s.id;
          }
        });
      }
    } catch (e) { /* non-fatal — tasks without an Hours tag simply omit timeSchemeId */ }

    // Run all API calls in parallel rather than sequentially
    var results = await Promise.all(tasks.map(async function (task) {
      var hadId       = !!_getReclaimId(task);
      var wasComplete = !!task.completionDate;
      try {
        await _syncOneTask(task, apiKey, schemeMap);
        return { ok: true, hadId: hadId, becameComplete: !wasComplete && !!task.completionDate };
      } catch (err) {
        return { ok: false, name: task.name, message: err.message };
      }
    }));

    var created = 0, updated = 0, completed = 0, failed = 0, errors = [];
    results.forEach(function (r) {
      if (r.ok) {
        if (!r.hadId) { created++; } else { updated++; }
        if (r.becameComplete) { completed++; }
      } else {
        failed++;
        errors.push('\u2022 ' + r.name + ': ' + r.message);
      }
    });

    var lines = [];
    if (created   > 0) { lines.push(created   + ' task' + (created   !== 1 ? 's' : '') + ' created in Reclaim'); }
    if (updated   > 0) { lines.push(updated   + ' task' + (updated   !== 1 ? 's' : '') + ' updated in Reclaim'); }
    if (completed > 0) { lines.push(completed + ' task' + (completed !== 1 ? 's' : '') + ' marked complete in OmniFocus'); }
    if (failed    > 0) { lines.push(failed    + ' task' + (failed    !== 1 ? 's' : '') + ' failed'); }

    if (errors.length > 0) {
      // Keep as modal alert so error details are visible and require acknowledgment
      var message = lines.length > 0 ? lines.join('\n') : 'Nothing to sync.';
      message += '\n\nErrors:\n' + errors.slice(0, 5).join('\n');
      if (errors.length > 5) { message += '\n\u2026 and ' + (errors.length - 5) + ' more'; }
      var alert = new Alert('Sync Complete', message);
      alert.addOption('OK');
      await alert.show();
    } else {
      _notify('Sync Complete', lines.length > 0 ? lines.join(' \u00b7 ') : 'Nothing to sync.');
    }
  } catch (e) {
    var err = new Alert('Reclaim Sync Error', String(e));
    err.addOption('OK');
    await err.show();
  }
});

action.validate = function (selection, sender) { return true; };

action
