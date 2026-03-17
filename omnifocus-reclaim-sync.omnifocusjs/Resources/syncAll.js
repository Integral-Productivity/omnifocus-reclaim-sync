/*
 * syncAll.js — "Sync All with Reclaim"
 * Bidirectional sync for every OmniFocus task tagged "Reclaim : Sync".
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
      var tasks  = lib.getAllSyncTasks();

      if (tasks.length === 0) {
        await lib.showAlert('Sync All',
          'No tasks are tagged for Reclaim sync.\n\nUse "Enable Reclaim Sync" on tasks you want to sync.');
        return;
      }

      lib.notify('Sync All', 'Syncing ' + lib.taskWord(tasks.length) + ' with Reclaim\u2026');

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

  action.validate = function (selection, sender) { return true; };

  return action;
})();
