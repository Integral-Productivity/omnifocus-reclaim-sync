/*
 * setPriority.js — "Set Reclaim Priority"
 * Presents a picker of Reclaim's four priority levels and tags selected tasks
 * with "Reclaim : Priority : [P1–P4]" so the sync payload carries the right value.
 */

// ── Load-time singletons ──────────────────────────────────────────────────────

var _prefs         = new Preferences();
var PREF_AUTO_SYNC = 'autoSyncAfterAction';
var PLUGIN_ID      = 'com.kraigparkinson.omnifocus-reclaim-sync';

// ── Priority definitions ──────────────────────────────────────────────────────

// Values are the exact Reclaim API enum strings; labels are the picker display text.
var PRIORITY_VALUES = ['P1', 'P2', 'P3', 'P4'];
var PRIORITY_LABELS = ['P1 — Critical', 'P2 — High', 'P3 — Medium', 'P4 — Low'];

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

// Removes any existing "Reclaim : Priority : *" tag before applying a new one.
function _removePriorityTags(task) {
  var root = null;
  for (var i = 0; i < flattenedTags.length; i++) {
    if (flattenedTags[i].name === 'Reclaim' && !flattenedTags[i].parent) { root = flattenedTags[i]; break; }
  }
  if (!root) { return; }
  var priorityParent = root.tagNamed('Priority');
  if (!priorityParent) { return; }
  var toRemove = task.tags.filter(function (t) {
    return t.parent && t.parent.id.primaryKey === priorityParent.id.primaryKey;
  });
  toRemove.forEach(function (t) { task.removeTag(t); });
}

// ── Action ────────────────────────────────────────────────────────────────────

var action = new PlugIn.Action(async function (selection, sender) {
  try {
    var taskWord = selection.tasks.length === 1 ? 'this task' : 'these tasks';

    var form = new Form();
    form.addField(new Form.Field.Option(
      'priority',
      'Priority',
      PRIORITY_VALUES,
      PRIORITY_LABELS,
      PRIORITY_VALUES[2] // default: P3 — Medium
    ));

    var response = await form.show(
      'Set Reclaim Priority',
      'Choose the scheduling priority for ' + taskWord + '.'
    );

    var selectedValue = response.values['priority'];
    var selectedLabel = PRIORITY_LABELS[PRIORITY_VALUES.indexOf(selectedValue)];

    // Apply tag: Reclaim : Priority : [P1 — Critical / P2 — High / …]
    // Tag names use the display label so they are self-explanatory in OmniFocus.
    var root         = _getRootTag();
    var syncTag      = _getOrCreateChildTag('Sync', root);
    var priorityRoot = _getOrCreateChildTag('Priority', root);
    var priorityTag  = _getOrCreateChildTag(selectedLabel, priorityRoot);

    selection.tasks.forEach(function (task) {
      if (!_hasTag(task, syncTag)) { task.addTag(syncTag); }
      _removePriorityTags(task);
      task.addTag(priorityTag);
    });

    var count    = selection.tasks.length;
    var autoSync = _prefs.read(PREF_AUTO_SYNC) === true;
    var msg = (count === 1 ? '1 task' : count + ' tasks') +
      ' set to \u201c' + selectedLabel + '\u201d.' +
      (autoSync ? '' : '\n\nRun "Sync Selected" or "Sync All" to push to Reclaim.');

    _notify('Priority Set', msg.replace(/\n/g, ' \u00b7 '));

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
