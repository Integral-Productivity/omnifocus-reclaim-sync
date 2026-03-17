/*
 * sendToUpNext.js — "Send to Reclaim Up Next"
 * Tags selected tasks with "Reclaim : Sync" and "Reclaim : Up Next".
 */

// ── Load-time singletons ──────────────────────────────────────────────────────

var _prefs         = new Preferences();
var PREF_AUTO_SYNC = 'autoSyncAfterAction';
var PLUGIN_ID      = 'com.kraigparkinson.omnifocus-reclaim-sync';

// ── Notification helper ───────────────────────────────────────────────────────

function _notify(title, subtitle) {
  var n = new Notification(title);
  if (subtitle) { n.subtitle = subtitle; }
  n.show(); // fire-and-forget — no need to await
}

// ── Tag helpers ───────────────────────────────────────────────────────────────

function _getRootTag() {
  for (var i = 0; i < flattenedTags.length; i++) {
    if (flattenedTags[i].name === 'Reclaim' && !flattenedTags[i].parent) {
      return flattenedTags[i];
    }
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

// ── Action ────────────────────────────────────────────────────────────────────

var action = new PlugIn.Action(async function (selection, sender) {
  try {
    var root      = _getRootTag();
    var syncTag   = _getOrCreateChildTag('Sync', root);
    var upNextTag = _getOrCreateChildTag('Up Next', root);
    var tagged    = 0;

    selection.tasks.forEach(function (task) {
      if (!_hasTag(task, syncTag))   { task.addTag(syncTag); }
      if (!_hasTag(task, upNextTag)) { task.addTag(upNextTag); tagged++; }
    });

    var skipped = selection.tasks.length - tagged;
    var msg = tagged === 1
      ? '1 task marked as Up Next in Reclaim.'
      : tagged + ' tasks marked as Up Next in Reclaim.';
    if (skipped > 0) {
      msg += '\n' + skipped + (skipped === 1 ? ' task was' : ' tasks were') + ' already marked Up Next.';
    }
    if (_prefs.read(PREF_AUTO_SYNC) !== true) {
      msg += '\n\nRun "Sync Selected" or "Sync All" to push to Reclaim.';
    }

    _notify('Reclaim Up Next', msg.replace(/\n/g, ' \u00b7 '));

    if (_prefs.read(PREF_AUTO_SYNC) === true) {
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
