/*
 * disableSync.js — "Disable Reclaim Sync"
 * Removes all "Reclaim : *" tags and clears stored Reclaim IDs.
 * If auto-sync is enabled, also deletes the tasks from Reclaim.ai.
 */

(() => {

  // new Credentials() must be constructed at load time (synchronous IIFE execution
  // satisfies the OmniAutomation constraint — not inside an async context).
  var _creds = new Credentials();

  var action = new PlugIn.Action(async function (selection, sender) {
    var lib = null;
    try {
      lib = PlugIn.find('com.kraigparkinson.omnifocus-reclaim-sync').library('reclaimLib');
      var tasks = lib.getSelectedTasks(selection);

      // Read the ID map once — avoids N+1 Preferences reads.
      var idMap      = lib.readIdMap();
      var tracked    = tasks.filter(function (t) { return !!idMap[t.id.primaryKey]; });
      var autoSync   = lib.getAutoSync();
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

      // Collect Reclaim IDs before clearing them from the map.
      var idsToDelete = willDelete
        ? tracked.map(function (t) { return idMap[t.id.primaryKey]; }).filter(Boolean)
        : [];

      // Remove tags and clear IDs from the in-memory map.
      var disabled = 0;
      tasks.forEach(function (task) {
        var reclaimTags = lib.getReclaimTags(task);
        if (reclaimTags.length === 0 && !idMap[task.id.primaryKey]) { return; }
        reclaimTags.forEach(function (t) { task.removeTag(t); });
        delete idMap[task.id.primaryKey];
        disabled++;
      });

      // Single write for all cleared IDs.
      lib.writeIdMap(idMap);

      var skipped = tasks.length - disabled;
      var msg = lib.taskWord(disabled) + ' removed from Reclaim sync.';
      if (skipped > 0) {
        msg += '\n' + skipped + (skipped === 1 ? ' task was' : ' tasks were') + ' not enrolled in sync.';
      }

      // Delete from Reclaim in parallel if auto-sync is on.
      if (idsToDelete.length > 0) {
        var apiKey       = await lib.requireApiKey(_creds);
        var deleted      = 0;
        var deleteFailed = 0;
        await Promise.all(idsToDelete.map(async function (id) {
          try { await lib.reclaimDelete(id, apiKey); deleted++; }
          catch (e) { deleteFailed++; }
        }));
        if (deleted > 0) {
          msg += '\n' + lib.taskWord(deleted) + ' deleted from Reclaim.';
        }
        if (deleteFailed > 0) {
          msg += '\n' + lib.taskWord(deleteFailed) +
            ' could not be deleted from Reclaim (may already be removed).';
        }
      }

      lib.notify('Reclaim Sync Disabled', msg);
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
