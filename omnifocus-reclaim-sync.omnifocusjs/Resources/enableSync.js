/*
 * enableSync.js — "Enable Reclaim Sync"
 * Tags selected tasks with "Reclaim : Sync".
 */

(() => {

  var action = new PlugIn.Action(async function (selection, sender) {
    var lib = null;
    try {
      lib = PlugIn.find('com.kraigparkinson.omnifocus-reclaim-sync').library('reclaimLib');
      var root    = lib.getRootTag();
      var syncTag = lib.getOrCreateChildTag(lib.TAG_SYNC, root);
      var tagged  = 0;

      selection.tasks.forEach(function (task) {
        if (!lib.hasTag(task, syncTag)) { task.addTag(syncTag); tagged++; }
      });

      var skipped = selection.tasks.length - tagged;
      var msg = lib.taskWord(tagged) + ' tagged for Reclaim sync.';
      if (skipped > 0) {
        msg += '\n' + skipped + (skipped === 1 ? ' task was' : ' tasks were') + ' already tagged.';
      }

      lib.notify('Enable Reclaim Sync', msg);
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
