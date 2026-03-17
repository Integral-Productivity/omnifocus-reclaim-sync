/*
 * configure.js — "Configure Reclaim Sync"
 * Saves the Reclaim.ai API key to the macOS Keychain and manages plugin settings.
 */

// Credentials and Preferences must be constructed at load time (not inside functions)
var _creds = new Credentials();
var _prefs = new Preferences();
var CRED_SVC      = 'com.kraigparkinson.reclaim-ai';
var PREF_AUTO_SYNC = 'autoSyncAfterAction';

// ── Notification helper ───────────────────────────────────────────────────────

function _notify(title, subtitle) {
  var n = new Notification(title);
  if (subtitle) { n.subtitle = subtitle; }
  n.show(); // fire-and-forget — no need to await
}

var action = new PlugIn.Action(async function (selection, sender) {
  try {
    const credentials = _creds;

    // Try to read the existing key (may throw if nothing stored yet)
    let existing = null;
    try {
      const r = await credentials.read(CRED_SVC);
      existing = r ? r.password : null;
    } catch (e) { /* no key stored yet — that's fine */ }

    const currentAutoSync = _prefs.read(PREF_AUTO_SYNC) === true;

    const statusMsg = existing
      ? 'An API key is already saved. Enter a new key to replace it, or leave the field blank to keep the current one.'
      : 'No API key is saved yet.\n\nFind your key in Reclaim.ai \u2192 Settings \u2192 Integrations \u2192 API.';

    const form = new Form();
    form.addField(new Form.Field.String('apiKey', 'Reclaim.ai API Key', null));
    form.addField(new Form.Field.Checkbox(
      'autoSync',
      'Auto-sync after Enable, Up Next, Set Hours \u0026 Disable actions',
      currentAutoSync
    ));
    form.validate = function (f) {
      // If a key already exists, allow empty (= no change). Otherwise require input.
      return existing ? true : (f.values['apiKey'] || '').trim().length > 0;
    };

    const response = await form.show('Configure Reclaim Sync', statusMsg);
    const newKey      = (response.values['apiKey'] || '').trim();
    const newAutoSync = response.values['autoSync'];

    const parts = [];
    if (newKey.length > 0) {
      await credentials.write(CRED_SVC, 'reclaim', newKey);
      parts.push('API key saved.');
    } else if (!existing) {
      // Shouldn't reach here due to validate, but guard anyway
      parts.push('No API key entered.');
    }

    _prefs.write(PREF_AUTO_SYNC, newAutoSync);
    parts.push('Auto-sync after actions: ' + (newAutoSync ? 'On' : 'Off') + '.');

    _notify('Reclaim Sync Configured', parts.join(' \u00b7 '));
  } catch (e) {
    const alert = new Alert('Reclaim Sync Error', String(e));
    alert.addOption('OK');
    await alert.show();
  }
});

action.validate = function (selection, sender) {
  return true;
};

action
