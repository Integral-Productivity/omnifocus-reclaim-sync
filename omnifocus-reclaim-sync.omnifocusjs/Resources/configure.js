/*
 * SPDX-License-Identifier: MIT
 * configure.js — "Configure Reclaim Sync"
 * Saves the Reclaim.ai API key to the macOS Keychain and manages plugin settings.
 */

(() => {

  // new Credentials() must be constructed at load time (synchronous IIFE execution
  // satisfies the OmniAutomation constraint — not inside an async context).
  var _creds = new Credentials();

  var action = new PlugIn.Action(async function (selection, sender) {
    // Library is loaded inside the action (not at top level) to avoid a crash
    // during plugin initialisation — PlugIn.find() must not be called at load time.
    var lib = null;
    try {
      lib = PlugIn.find('com.kraigparkinson.omnifocus-reclaim-sync').library('reclaimLib');
      var existing      = await lib.getApiKey(_creds);
      var currentAutoSync = lib.getAutoSync();

      var statusMsg = existing
        ? 'An API key is already saved. Enter a new key to replace it, or leave the field blank to keep the current one.'
        : 'No API key is saved yet.\n\nFind your key in Reclaim.ai \u2192 Settings \u2192 Integrations \u2192 API.';

      var form = new Form();
      form.addField(new Form.Field.String('apiKey', 'Reclaim.ai API Key', null));
      form.addField(new Form.Field.Checkbox(
        'autoSync',
        'Auto-sync after Enable, Up Next, Split Up, Set Hours, Set Priority \u0026 Disable actions',
        currentAutoSync
      ));
      form.validate = function (f) {
        // If a key already exists, allow empty (= no change). Otherwise require input.
        return existing ? true : (f.values['apiKey'] || '').trim().length > 0;
      };

      var response    = await form.show('Configure Reclaim Sync', statusMsg);
      var newKey      = (response.values['apiKey'] || '').trim();
      var newAutoSync = response.values['autoSync'];

      var parts = [];
      if (newKey.length > 0) {
        await lib.saveApiKey(_creds, newKey);
        parts.push('API key saved.');
      } else if (!existing) {
        parts.push('No API key entered.');
      }

      lib.setAutoSync(newAutoSync);
      parts.push('Auto-sync after actions: ' + (newAutoSync ? 'On' : 'Off') + '.');

      lib.notify('Reclaim Sync Configured', parts.join(' \u00b7 '));
    } catch (e) {
      if (lib) { await lib.showError(e); }
      else { var _a = new Alert('Reclaim Sync Error', String(e)); _a.addOption('OK'); await _a.show(); }
    }
  });

  action.validate = function (selection, sender) { return true; };

  return action;
})();
