/*
 * sendToUpNext.js — "Send to Reclaim Up Next"
 * Tags selected tasks with "Reclaim : Sync" and "Reclaim : Up Next".
 */

(() => {

  var action = new PlugIn.Action(async function (selection, sender) {
    var lib = null;
    try {
      lib = PlugIn.find('com.kraigparkinson.omnifocus-reclaim-sync').library('reclaimLib');
      var root      = lib.getRootTag();
      var syncTag   = lib.getOrCreateChildTag(lib.TAG_SYNC,    root);
      var upNextTag = lib.getOrCreateChildTag(lib.TAG_UP_NEXT, root);
      var tagged    = 0;

      selection.tasks.forEach(function (task) {
        if (!lib.hasTag(task, syncTag))   { task.addTag(syncTag); }
        if (!lib.hasTag(task, upNextTag)) { task.addTag(upNextTag); tagged++; }
      });

      var autoSync = lib.getAutoSync();
      var skipped  = selection.tasks.length - tagged;
      var msg      = lib.taskWord(tagged) + ' marked as Up Next in Reclaim.';
      if (skipped > 0) {
        msg += '\n' + skipped + (skipped === 1 ? ' task was' : ' tasks were') + ' already marked Up Next.';
      }
      if (!autoSync) { msg += '\n\nRun "Sync Selected" or "Sync All" to push to Reclaim.'; }

      lib.notify('Reclaim Up Next', msg);
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
