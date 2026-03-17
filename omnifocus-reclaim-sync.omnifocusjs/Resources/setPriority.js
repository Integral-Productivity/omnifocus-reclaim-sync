/*
 * setPriority.js — "Set Reclaim Priority"
 * Presents a picker of Reclaim's four priority levels and tags selected tasks
 * with "Reclaim : Priority : [P1–P4]" so the sync payload carries the right value.
 */

(() => {

  var action = new PlugIn.Action(async function (selection, sender) {
    var lib = null;
    try {
      lib = PlugIn.find('com.kraigparkinson.omnifocus-reclaim-sync').library('reclaimLib');
      var taskWord = selection.tasks.length === 1 ? 'this task' : 'these tasks';

      var form = new Form();
      form.addField(new Form.Field.Option(
        'priority',
        'Priority',
        lib.PRIORITY_VALUES,
        lib.PRIORITY_LABELS,
        lib.PRIORITY_VALUES[2] // default: P3 — Medium
      ));

      var response = await form.show(
        'Set Reclaim Priority',
        'Choose the scheduling priority for ' + taskWord + '.'
      );

      var selectedValue = response.values['priority'];
      var selectedLabel = lib.PRIORITY_LABELS[lib.PRIORITY_VALUES.indexOf(selectedValue)];

      // Apply tag: Reclaim : Priority : [P1 — Critical / P2 — High / …]
      // Tag names use the display label so they are self-explanatory in OmniFocus.
      var root         = lib.getRootTag();
      var syncTag      = lib.getOrCreateChildTag(lib.TAG_SYNC,     root);
      var priorityRoot = lib.getOrCreateChildTag(lib.TAG_PRIORITY, root);
      var priorityTag  = lib.getOrCreateChildTag(selectedLabel, priorityRoot);

      selection.tasks.forEach(function (task) {
        if (!lib.hasTag(task, syncTag)) { task.addTag(syncTag); }
        lib.removePriorityTags(task);
        task.addTag(priorityTag);
      });

      var count    = selection.tasks.length;
      var autoSync = lib.getAutoSync();
      var msg      = lib.taskWord(count) +
        ' set to \u201c' + selectedLabel + '\u201d.' +
        (autoSync ? '' : '\n\nRun "Sync Selected" or "Sync All" to push to Reclaim.');

      lib.notify('Priority Set', msg);
      await lib.maybeAutoSync(selection);
    } catch (e) {
      if (lib) { await lib.showError(e); }
      else { var _a = new Alert('Reclaim Sync Error', String(e)); _a.addOption('OK'); await _a.show(); }
    }
  });

  action.validate = function (selection, sender) {
    return selection.tasks.length > 0;
  };

  return action;
})();
