/*
 * syncSelected.js — "Sync Selected with Reclaim"
 * Bidirectional sync for the currently selected OmniFocus tasks.
 */

(() => {

  // new Credentials() must be constructed at load time (synchronous IIFE execution
  // satisfies the OmniAutomation constraint — not inside an async context).
  var _creds = new Credentials();

  var action = new PlugIn.Action(async function (selection, sender) {
    var lib = null;
    try {
      lib = PlugIn.find('com.kraigparkinson.omnifocus-reclaim-sync').library('reclaimLib');

      var apiKey = await lib.requireApiKey(_creds);
      var tasks  = lib.getSelectedTasks(selection).filter(function (t) { return !t.dropped; });

      // quietSync is set by other actions before delegating here — suppress start notification.
      var quietSync = lib.isQuietSync();
      if (quietSync) { lib.clearQuietSync(); }

      if (tasks.length === 0) {
        await lib.showAlert('Sync Selected', 'No eligible tasks are selected.');
        return;
      }

      // Ensure every selected task has the Sync tag.
      var root    = lib.getRootTag();
      var syncTag = lib.getOrCreateChildTag(lib.TAG_SYNC, root);
      tasks.forEach(function (task) {
        if (!lib.hasTag(task, syncTag)) { task.addTag(syncTag); }
      });

      if (!quietSync) {
        lib.notify('Sync Selected', 'Syncing ' + lib.taskWord(tasks.length) + ' with Reclaim\u2026');
      }

      var results = await lib.syncTaskBatch(tasks, apiKey);
      var summary = lib.buildSyncSummary(results);
      var lines   = summary.lines;
      var errors  = summary.errors;

      if (errors.length > 0) {
        var message = lines.length > 0 ? lines.join('\n') : 'Nothing to sync.';
        message += '\n\nErrors:\n' + errors.slice(0, 5).join('\n');
        if (errors.length > 5) { message += '\n\u2026 and ' + (errors.length - 5) + ' more'; }
        await lib.showAlert('Sync Complete', message);
      } else {
        lib.notify('Sync Complete', lines.length > 0 ? lines.join(' \u00b7 ') : 'Nothing to sync.');
      }
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
