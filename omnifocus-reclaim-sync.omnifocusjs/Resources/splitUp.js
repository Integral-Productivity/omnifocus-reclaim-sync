/*
 * splitUp.js — "Allow Reclaim to Split Up Task"
 * Tags selected tasks with "Reclaim : Sync" and "Reclaim : Split Up",
 * setting splitUp:true in Reclaim so the scheduler can break the task
 * into multiple work sessions.
 */

(() => {

  var action = new PlugIn.Action(async function (selection, sender) {
    var lib = null;
    try {
      lib = PlugIn.find('com.kraigparkinson.omnifocus-reclaim-sync').library('reclaimLib');
      var root       = lib.getRootTag();
      var syncTag    = lib.getOrCreateChildTag(lib.TAG_SYNC,     root);
      var splitUpTag = lib.getOrCreateChildTag(lib.TAG_SPLIT_UP, root);
      var tasks      = lib.getSelectedTasks(selection);
      var tagged     = 0;

      tasks.forEach(function (task) {
        if (!lib.hasTag(task, syncTag))    { task.addTag(syncTag); }
        if (!lib.hasTag(task, splitUpTag)) { task.addTag(splitUpTag); tagged++; }
      });

      var autoSync = lib.getAutoSync();
      var skipped  = tasks.length - tagged;
      var msg      = lib.taskWord(tagged) + ' allowed to split up in Reclaim.';
      if (skipped > 0) {
        msg += '\n' + skipped + (skipped === 1 ? ' task was' : ' tasks were') + ' already set to split up.';
      }
      if (!autoSync) { msg += '\n\nRun "Sync Selected" or "Sync All" to push to Reclaim.'; }

      lib.notify('Reclaim Split Up', msg);
      await lib.maybeAutoSync(selection);
    } catch (e) {
      if (lib) { await lib.showError(e); }
      else { var _a = new Alert('Reclaim Sync Error', String(e)); _a.addOption('OK'); await _a.show(); }
    }
  });

  action.validate = function (selection, sender) {
    return selection.tasks.length > 0 || selection.projects.length > 0;
  };

  return action;
})();
