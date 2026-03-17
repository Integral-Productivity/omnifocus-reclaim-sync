/*
 * reclaimLib.js — Shared library for OmniFocus ↔ Reclaim.ai sync plugin
 *
 * Load INSIDE the action perform function (not at the script top level):
 *
 *   var action = new PlugIn.Action(async function(selection, sender) {
 *     var lib = PlugIn.find('com.kraigparkinson.omnifocus-reclaim-sync').library('reclaimLib');
 *     ...
 *   });
 *
 * Loading at the script top level crashes OmniFocus during plugin initialisation
 * because PlugIn.find() is called before the plugin has finished registering.
 *
 * CREDENTIALS CONSTRAINT: new Credentials() must be called at the TOP LEVEL of
 * each action script (plugin load time), not inside any function or async context.
 * This library therefore does NOT construct a Credentials instance internally.
 * Scripts that need credential access must declare:
 *
 *   var _creds = new Credentials();   // <-- top level of the action script
 *
 * and pass that instance to lib.requireApiKey(_creds), lib.getApiKey(_creds), etc.
 *
 * new Preferences() has no such constraint and is constructed here in the IIFE.
 */
/*{
	"type": "library",
	"targets": ["omnifocus"],
	"identifier": "com.kraigparkinson.omnifocus-reclaim-sync.reclaimLib",
	"version": "1.0"
}*/
(() => {

  // ── Load-time singleton (Preferences only) ────────────────────────────────
  var _prefs = new Preferences();

  // ── Constants ─────────────────────────────────────────────────────────────

  var PLUGIN_ID  = 'com.kraigparkinson.omnifocus-reclaim-sync';
  var API_BASE   = 'https://api.app.reclaim.ai/api';
  var CRED_SVC   = 'com.kraigparkinson.reclaim-ai';
  var PREF_MAP       = 'reclaimTaskIdMap';
  var PREF_AUTO_SYNC = 'autoSyncAfterAction';
  var PREF_QUIET     = 'quietSync';

  var RECLAIM_LINK_MARKER = '\n\n\u2014 Reclaim: ';

  var TAG_ROOT     = 'Reclaim';
  var TAG_SYNC     = 'Sync';
  var TAG_UP_NEXT  = 'Up Next';
  var TAG_SPLIT_UP = 'Split Up';
  var TAG_HOURS    = 'Hours';
  var TAG_PRIORITY = 'Priority';

  var PRIORITY_VALUES = ['P1', 'P2', 'P3', 'P4'];
  var PRIORITY_LABELS = ['P1 \u2014 Critical', 'P2 \u2014 High', 'P3 \u2014 Medium', 'P4 \u2014 Low'];

  var PRIORITY_TAG_TO_API = {
    'P1 \u2014 Critical': 'P1',
    'P2 \u2014 High':     'P2',
    'P3 \u2014 Medium':   'P3',
    'P4 \u2014 Low':      'P4'
  };

  // ── Tag helpers ───────────────────────────────────────────────────────────

  // Returns the root-level 'Reclaim' tag (ignores any nested tag of the same name).
  function getRootTag() {
    for (var i = 0; i < flattenedTags.length; i++) {
      if (flattenedTags[i].name === TAG_ROOT && !flattenedTags[i].parent) {
        return flattenedTags[i];
      }
    }
    return new Tag(TAG_ROOT);
  }

  function getOrCreateChildTag(name, parent) {
    var tag = parent.tagNamed(name);
    if (!tag) { tag = new Tag(name, parent); }
    return tag;
  }

  function hasTag(task, tag) {
    if (!tag) { return false; }
    return task.tags.some(function (t) { return t.id.primaryKey === tag.id.primaryKey; });
  }

  function isUnderTag(tag, ancestor) {
    var current = tag;
    while (current.parent) {
      if (current.parent.id.primaryKey === ancestor.id.primaryKey) { return true; }
      current = current.parent;
    }
    return false;
  }

  // Returns all tags on a task that are descendants of the root 'Reclaim' tag.
  function getReclaimTags(task) {
    var root = getRootTag();
    return task.tags.filter(function (t) { return isUnderTag(t, root); });
  }

  // ── Private tag-child helpers (accept a resolved parent Tag object) ─────────

  // Removes all direct children of parentTag from the task.
  function _removeChildTagsOf(task, parentTag) {
    if (!parentTag) { return; }
    var toRemove = task.tags.filter(function (t) {
      return t.parent && t.parent.id.primaryKey === parentTag.id.primaryKey;
    });
    toRemove.forEach(function (t) { task.removeTag(t); });
  }

  // Returns the name of the first direct child of parentTag found on the task, or null.
  function _getChildTagNameOf(task, parentTag) {
    if (!parentTag) { return null; }
    for (var i = 0; i < task.tags.length; i++) {
      var t = task.tags[i];
      if (t.parent && t.parent.id.primaryKey === parentTag.id.primaryKey) { return t.name; }
    }
    return null;
  }

  // Removes all 'Reclaim : Hours : *' tags from a task.
  function removeHoursTags(task) {
    _removeChildTagsOf(task, getRootTag().tagNamed(TAG_HOURS));
  }

  // Removes all 'Reclaim : Priority : *' tags from a task.
  function removePriorityTags(task) {
    _removeChildTagsOf(task, getRootTag().tagNamed(TAG_PRIORITY));
  }

  // Returns the name of the 'Reclaim : Hours : *' child tag on a task, or null.
  function getScheduleSchemeFromTags(task) {
    return _getChildTagNameOf(task, getRootTag().tagNamed(TAG_HOURS));
  }

  // Returns the name of the 'Reclaim : Priority : *' child tag on a task, or null.
  function getPriorityFromTags(task) {
    return _getChildTagNameOf(task, getRootTag().tagNamed(TAG_PRIORITY));
  }

  // Returns all non-dropped tasks tagged with 'Reclaim : Sync'.
  // Uses syncTag.tasks (the tag's own task list) rather than scanning flattenedTasks.
  function getAllSyncTasks() {
    var root = getRootTag();
    var syncTag = root.tagNamed(TAG_SYNC);
    if (!syncTag) { return []; }
    return syncTag.tasks.filter(function (t) { return !t.dropped; });
  }

  // ── Time scheme helpers ───────────────────────────────────────────────────

  // Returns the display name for a /timeschemes API object.
  function schemeTitle(scheme) {
    return (scheme.title && scheme.title.trim()) ? scheme.title.trim() : (scheme.policyType || String(scheme.id));
  }

  // ── Preferences / Auto-sync ───────────────────────────────────────────────

  function getAutoSync()        { return _prefs.read(PREF_AUTO_SYNC) === true; }
  function setAutoSync(enabled) { _prefs.write(PREF_AUTO_SYNC, enabled); }
  function isQuietSync()        { return _prefs.read(PREF_QUIET) === true; }
  function clearQuietSync()     { _prefs.write(PREF_QUIET, false); }

  // Calls syncSelected if the autoSync preference is on.
  // The quietSync flag suppresses the start notification in syncSelected.
  async function maybeAutoSync(selection) {
    if (!getAutoSync()) { return; }
    _prefs.write(PREF_QUIET, true);
    await PlugIn.find(PLUGIN_ID).action('syncSelected').perform(selection);
  }

  // ── Preferences / Task ID map ─────────────────────────────────────────────
  //
  // For batch operations (sync all / sync selected / disable), callers MUST
  // use readIdMap() + writeIdMap() rather than per-task helpers to avoid:
  //   1. The N+1 Preferences read/write pattern.
  //   2. The race condition in Promise.all where concurrent branches each read
  //      a stale map and the last writer drops all prior IDs.
  //
  // Pattern:
  //   var idMap = lib.readIdMap();
  //   await Promise.all(tasks.map(function(task) {
  //     return lib.syncOneTask(task, apiKey, schemeMap, idMap); // mutates idMap
  //   }));
  //   lib.writeIdMap(idMap);  // single write after all tasks settle

  function readIdMap() {
    var stored = _prefs.read(PREF_MAP);
    if (!stored) { return {}; }
    try { return JSON.parse(stored); } catch (e) { return {}; }
  }

  function writeIdMap(map) {
    _prefs.write(PREF_MAP, JSON.stringify(map));
  }

  // ── Credential helpers ────────────────────────────────────────────────────
  // Each function accepts the Credentials instance created at the top level of
  // the calling script. See the file header for the constraint explanation.

  async function getApiKey(creds) {
    try {
      var r = await creds.read(CRED_SVC);
      return r ? r.password : null;
    } catch (e) { return null; }
  }

  async function saveApiKey(creds, apiKey) {
    await creds.write(CRED_SVC, 'reclaim', apiKey);
  }

  async function promptForApiKey(creds) {
    var form = new Form();
    form.addField(new Form.Field.String('apiKey', 'Reclaim.ai API Key', null));
    form.validate = function (f) { return (f.values['apiKey'] || '').trim().length > 0; };
    var response = await form.show(
      'Reclaim.ai API Key Required',
      'Enter your API key to enable sync.\nFind it in Reclaim.ai \u2192 Settings \u2192 Integrations \u2192 API.'
    );
    var key = response.values['apiKey'].trim();
    await saveApiKey(creds, key);
    return key;
  }

  async function requireApiKey(creds) {
    var key = await getApiKey(creds);
    return key || (await promptForApiKey(creds));
  }

  // ── HTTP / Reclaim API ────────────────────────────────────────────────────

  async function reclaimFetch(method, path, body, apiKey) {
    var req = new URL.FetchRequest();
    req.url    = URL.fromString(API_BASE + path);
    req.method = method;
    req.headers = {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type':  'application/json',
      'Accept':        'application/json'
    };
    if (body !== null && body !== undefined) { req.bodyString = JSON.stringify(body); }

    var res = await req.fetch();
    if (res.statusCode === 401) { throw new Error('Invalid API key. Run "Configure Reclaim Sync" to update it.'); }
    if (res.statusCode === 404) { var e = new Error('Not found: ' + path); e.statusCode = 404; throw e; }
    if (res.statusCode >= 400)  { throw new Error('Reclaim error ' + res.statusCode + ': ' + res.bodyString); }
    if (!res.bodyString || res.bodyString.trim() === '') { return null; }
    return JSON.parse(res.bodyString);
  }

  // DELETE variant that treats 404 as success (task already gone from Reclaim).
  async function reclaimDelete(id, apiKey) {
    try {
      await reclaimFetch('DELETE', '/tasks/' + id, null, apiKey);
    } catch (e) {
      if (e.statusCode === 404) { return; } // already deleted — treat as success
      throw e;
    }
  }

  // Returns the filtered array of active, non-transient time scheme objects.
  // Throws on network/API error — callers should handle errors as appropriate.
  async function fetchActiveSchemes(apiKey) {
    var list = await reclaimFetch('GET', '/timeschemes', null, apiKey);
    if (!Array.isArray(list)) { throw new Error('Unexpected response from /timeschemes (non-array)'); }
    return list.filter(function (s) {
      return s && s.id != null && s.status === 'ACTIVE' &&
             s.policyType !== 'ONE_OFF' && s.policyType !== 'INHERITED';
    });
  }

  // Fetches available time schemes and returns { [schemeName]: schemeId }.
  // Returns {} on any error so callers can treat missing schemes as non-fatal.
  async function fetchSchemeMap(apiKey) {
    try {
      var schemes = await fetchActiveSchemes(apiKey);
      var map = {};
      schemes.forEach(function (s) { map[schemeTitle(s)] = s.id; });
      return map;
    } catch (e) { return {}; }
  }

  // ── Cross-link helpers ────────────────────────────────────────────────────

  // Returns the task note with any previously-appended Reclaim URL stripped.
  function baseNote(task) {
    var note = task.note || '';
    var idx  = note.indexOf(RECLAIM_LINK_MARKER);
    return idx >= 0 ? note.substring(0, idx) : note;
  }

  // Appends (or replaces) the Reclaim URL at the end of the OmniFocus task note.
  function writeReclaimUrl(task, reclaimId) {
    task.note = baseNote(task) + RECLAIM_LINK_MARKER +
      'View in Reclaim \u2192 https://app.reclaim.ai/tasks/' + reclaimId;
  }

  // Returns the OmniFocus deep-link URL for a task.
  function ofUrl(task) {
    return 'omnifocus:///task/' + task.id.primaryKey;
  }

  // ── Payload builder ───────────────────────────────────────────────────────

  // schemeMap: { [schemeName]: schemeId } from fetchSchemeMap() — pass {} if unavailable.
  function buildPayload(task, schemeMap) {
    // Resolve the root tag once; all sub-lookups reuse it to avoid repeated full scans.
    var root = getRootTag();

    var base  = baseNote(task);
    var notes = base + (base ? '\n\n' : '') + '[View in OmniFocus](' + ofUrl(task) + ')';

    var payload = {
      title:  task.name,
      notes:  notes,
      status: task.completionDate ? 'COMPLETE' : 'NEW'
    };

    // Always include due and snoozeUntil — explicit null clears the field in Reclaim
    // when the user removes a date in OmniFocus.
    payload.due         = task.dueDate   ? task.dueDate.toISOString()   : null;
    payload.snoozeUntil = task.deferDate ? task.deferDate.toISOString() : null;

    // Duration from OmniFocus estimated minutes.
    var mins = task.estimatedMinutes || null;
    if (mins) {
      payload.duration     = mins;
      payload.minChunkSize = Math.min(30, mins);
      payload.maxChunkSize = mins;
    }

    // Resolve child tag references once — each tagNamed() traverses root's children.
    var hoursParent    = root.tagNamed(TAG_HOURS);
    var priorityParent = root.tagNamed(TAG_PRIORITY);
    var upNextTag      = root.tagNamed(TAG_UP_NEXT);
    var splitUpTag     = root.tagNamed(TAG_SPLIT_UP);

    // Time scheme from 'Reclaim : Hours : [name]' tag.
    var schemeName = _getChildTagNameOf(task, hoursParent);
    if (schemeName && schemeMap && schemeMap[schemeName] != null) {
      payload.timeSchemeId = schemeMap[schemeName];
    }

    // Priority from 'Reclaim : Priority : [label]' tag.
    var priorityTagName = _getChildTagNameOf(task, priorityParent);
    if (priorityTagName) {
      var priorityApi = PRIORITY_TAG_TO_API[priorityTagName];
      if (priorityApi) { payload.priority = priorityApi; }
    }

    // onDeck and splitUp from boolean tags.
    payload.onDeck  = hasTag(task, upNextTag);
    payload.splitUp = hasTag(task, splitUpTag);

    return payload;
  }

  // ── Sync core ─────────────────────────────────────────────────────────────

  // Syncs a single task to Reclaim. idMap is the in-memory map (mutated in place
  // when a new Reclaim ID is assigned). Callers must call readIdMap() before
  // the batch and writeIdMap() after all tasks settle — see note above.
  async function syncOneTask(task, apiKey, schemeMap, idMap) {
    var existingId = idMap[task.id.primaryKey] || null;
    var payload    = buildPayload(task, schemeMap);
    var reclaimTask;

    if (existingId) {
      try {
        reclaimTask = await reclaimFetch('PATCH', '/tasks/' + existingId, payload, apiKey);
      } catch (e) {
        if (e.statusCode === 404) {
          reclaimTask = await reclaimFetch('POST', '/tasks', payload, apiKey);
          idMap[task.id.primaryKey] = String(reclaimTask.id);
        } else { throw e; }
      }
    } else {
      reclaimTask = await reclaimFetch('POST', '/tasks', payload, apiKey);
      idMap[task.id.primaryKey] = String(reclaimTask.id);
    }

    if (reclaimTask) {
      writeReclaimUrl(task, String(reclaimTask.id));

      // Bidirectional date sync: Reclaim → OmniFocus.
      // Use 'in' guard to distinguish null (clear date) from absent (don't touch).
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

  // ── Batch sync helpers ────────────────────────────────────────────────────

  // Syncs an array of tasks against the Reclaim API in parallel.
  // Fetches the scheme map once, reads/writes the ID map once.
  // Returns the raw results array for buildSyncSummary().
  async function syncTaskBatch(tasks, apiKey) {
    var schemeMap = await fetchSchemeMap(apiKey);
    var idMap     = readIdMap();

    var results = await Promise.all(tasks.map(async function (task) {
      var hadId       = !!idMap[task.id.primaryKey];
      var wasComplete = !!task.completionDate;
      try {
        await syncOneTask(task, apiKey, schemeMap, idMap);
        return { ok: true, hadId: hadId, becameComplete: !wasComplete && !!task.completionDate };
      } catch (err) {
        return { ok: false, name: task.name, message: err.message };
      }
    }));

    writeIdMap(idMap); // single write after all tasks settle
    return results;
  }

  // Tallies a results array from syncTaskBatch() into summary lines and error messages.
  // Returns { lines: string[], errors: string[] }.
  function buildSyncSummary(results) {
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
    if (created   > 0) { lines.push(taskWord(created)   + ' created in Reclaim'); }
    if (updated   > 0) { lines.push(taskWord(updated)   + ' updated in Reclaim'); }
    if (completed > 0) { lines.push(taskWord(completed) + ' marked complete in OmniFocus'); }
    if (failed    > 0) { lines.push(taskWord(failed)    + ' failed'); }

    return { lines: lines, errors: errors };
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  // Pluralises "task/tasks" for count n. Exported so action scripts share the same wording.
  function taskWord(n) { return n === 1 ? '1 task' : n + ' tasks'; }

  function notify(title, subtitle) {
    var n = new Notification(title);
    // Normalise newlines to mid-dot separators so macOS notification banners
    // display a single-line summary rather than a truncated multi-line string.
    if (subtitle) { n.subtitle = subtitle.replace(/\n/g, ' \u00b7 '); }
    n.show(); // fire-and-forget — no need to await
  }

  async function showAlert(title, message) {
    var alert = new Alert(title, message);
    alert.addOption('OK');
    await alert.show();
  }

  async function showError(e) {
    await showAlert('Reclaim Sync Error', String(e));
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  // OmniAutomation requires the library to be a PlugIn.Library instance.
  // All public functions and constants are attached as properties of this object.

  var lib = new PlugIn.Library(new Version('1.0'));

  // Constants
  lib.PLUGIN_ID           = PLUGIN_ID;
  lib.API_BASE            = API_BASE;
  lib.CRED_SVC            = CRED_SVC;
  lib.PREF_MAP            = PREF_MAP;
  lib.PREF_AUTO_SYNC      = PREF_AUTO_SYNC;
  lib.RECLAIM_LINK_MARKER = RECLAIM_LINK_MARKER;
  lib.TAG_ROOT            = TAG_ROOT;
  lib.TAG_SYNC            = TAG_SYNC;
  lib.TAG_UP_NEXT         = TAG_UP_NEXT;
  lib.TAG_SPLIT_UP        = TAG_SPLIT_UP;
  lib.TAG_HOURS           = TAG_HOURS;
  lib.TAG_PRIORITY        = TAG_PRIORITY;
  lib.PRIORITY_VALUES     = PRIORITY_VALUES;
  lib.PRIORITY_LABELS     = PRIORITY_LABELS;
  lib.PRIORITY_TAG_TO_API = PRIORITY_TAG_TO_API;

  // Tag helpers
  lib.getRootTag                = getRootTag;
  lib.getOrCreateChildTag       = getOrCreateChildTag;
  lib.hasTag                    = hasTag;
  lib.isUnderTag                = isUnderTag;
  lib.getReclaimTags            = getReclaimTags;
  lib.removeHoursTags           = removeHoursTags;
  lib.removePriorityTags        = removePriorityTags;
  lib.getScheduleSchemeFromTags = getScheduleSchemeFromTags;
  lib.getPriorityFromTags       = getPriorityFromTags;
  lib.schemeTitle               = schemeTitle;
  lib.getAllSyncTasks            = getAllSyncTasks;

  // Preferences
  lib.getAutoSync    = getAutoSync;
  lib.setAutoSync    = setAutoSync;
  lib.isQuietSync    = isQuietSync;
  lib.clearQuietSync = clearQuietSync;
  lib.maybeAutoSync  = maybeAutoSync;
  lib.readIdMap      = readIdMap;
  lib.writeIdMap     = writeIdMap;

  // Credentials (each function accepts the caller's Credentials instance)
  lib.getApiKey       = getApiKey;
  lib.saveApiKey      = saveApiKey;
  lib.promptForApiKey = promptForApiKey;
  lib.requireApiKey   = requireApiKey;

  // HTTP
  lib.reclaimFetch       = reclaimFetch;
  lib.reclaimDelete      = reclaimDelete;
  lib.fetchActiveSchemes = fetchActiveSchemes;
  lib.fetchSchemeMap     = fetchSchemeMap;

  // Cross-link
  lib.baseNote        = baseNote;
  lib.writeReclaimUrl = writeReclaimUrl;
  lib.ofUrl           = ofUrl;

  // Payload + sync
  lib.buildPayload     = buildPayload;
  lib.syncOneTask      = syncOneTask;
  lib.syncTaskBatch    = syncTaskBatch;
  lib.buildSyncSummary = buildSyncSummary;

  // UI
  lib.taskWord  = taskWord;
  lib.notify    = notify;
  lib.showAlert = showAlert;
  lib.showError = showError;

  const reclaimLib = lib;
  return reclaimLib;

})();
