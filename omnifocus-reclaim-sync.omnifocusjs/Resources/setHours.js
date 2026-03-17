/*
 * setHours.js — "Set Reclaim Hours"
 * Fetches the user's available scheduling hour types from Reclaim.ai and tags
 * selected tasks with "Reclaim : Hours : [scheme name]" (e.g. Working Hours).
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

      // Fetch available scheduling hour types (ACTIVE, non-transient schemes).
      var schemes = [];
      try {
        schemes = await lib.fetchActiveSchemes(apiKey);
      } catch (e) {
        await lib.showAlert('Set Reclaim Hours',
          'Could not load scheduling hours from Reclaim.ai.\n\nAPI error: ' + e.message);
        return;
      }

      if (schemes.length === 0) {
        await lib.showAlert('Set Reclaim Hours',
          'No active scheduling schemes returned by Reclaim.ai.');
        return;
      }

      // Build parallel arrays for Form.Field.Option.
      var schemeIdStrs = schemes.map(function (s) { return String(s.id); });
      var schemeNames  = schemes.map(function (s) { return lib.schemeTitle(s); });
      var tasks        = lib.getSelectedTasks(selection);
      var taskWord     = tasks.length === 1 ? 'this task' : 'these tasks';

      var form = new Form();
      form.addField(new Form.Field.Option('scheme', 'Scheduling Hours', schemeIdStrs, schemeNames, schemeIdStrs[0]));

      var response       = await form.show('Set Reclaim Hours', 'Choose the scheduling hours for ' + taskWord + '.');
      var selectedIdStr  = response.values['scheme'];
      var selectedScheme = schemes.find(function (s) { return String(s.id) === selectedIdStr; });
      var selectedName   = lib.schemeTitle(selectedScheme);

      // Apply tag: Reclaim : Hours : [friendly label]
      var root      = lib.getRootTag();
      var syncTag   = lib.getOrCreateChildTag(lib.TAG_SYNC,  root);
      var hoursRoot = lib.getOrCreateChildTag(lib.TAG_HOURS, root);
      var hoursTag  = lib.getOrCreateChildTag(selectedName,  hoursRoot);

      tasks.forEach(function (task) {
        if (!lib.hasTag(task, syncTag)) { task.addTag(syncTag); }
        lib.removeHoursTags(task);
        task.addTag(hoursTag);
      });

      var count    = tasks.length;
      var autoSync = lib.getAutoSync();
      var msg      = lib.taskWord(count) +
        ' set to schedule in \u201c' + selectedName + '\u201d.' +
        (autoSync ? '' : '\n\nRun "Sync Selected" or "Sync All" to push to Reclaim.');

      lib.notify('Hours Set', msg);
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
