/*
 * reclaimLib.js — Shared library for OmniFocus ↔ Reclaim.ai sync plugin
 *
 * Loaded by action scripts via:
 *   var lib = PlugIn.find('com.kraigparkinson.omnifocus-reclaim-sync').library('reclaimLib');
 *
 * IMPORTANT: The file ends with a bare IIFE expression (no `var x = …` wrapper)
 * so that OmniAutomation's library() loader receives the exports object as the
 * file's last evaluated expression.
 */

(() => {

  // ─── Constants ────────────────────────────────────────────────────────────

  const PLUGIN_ID = 'com.kraigparkinson.omnifocus-reclaim-sync';
  const API_BASE  = 'https://api.app.reclaim.ai/api';
  const CRED_SVC  = 'com.kraigparkinson.reclaim-ai';

  const TAG_ROOT         = 'Reclaim';
  const TAG_SYNC         = 'Sync';
  const TAG_UP_NEXT      = 'Up Next';
  const TAG_HOURS_PARENT = 'Hours';

  const KEY_RECLAIM_ID    = 'reclaimTaskId';
  const KEY_RECLAIM_HOURS = 'reclaimHours';

  // ─── Tag Helpers ──────────────────────────────────────────────────────────

  function getRootTag() {
    let tag = flattenedTags.byName(TAG_ROOT);
    if (!tag) { tag = new Tag(TAG_ROOT); }
    return tag;
  }

  function getSyncTag() {
    const root = getRootTag();
    let tag = root.tagNamed(TAG_SYNC);
    if (!tag) { tag = new Tag(TAG_SYNC, root); }
    return tag;
  }

  function getUpNextTag() {
    const root = getRootTag();
    let tag = root.tagNamed(TAG_UP_NEXT);
    if (!tag) { tag = new Tag(TAG_UP_NEXT, root); }
    return tag;
  }

  function getHoursTag(hours) {
    const root = getRootTag();
    let hoursParent = root.tagNamed(TAG_HOURS_PARENT);
    if (!hoursParent) { hoursParent = new Tag(TAG_HOURS_PARENT, root); }
    const label = hours + 'h';
    let tag = hoursParent.tagNamed(label);
    if (!tag) { tag = new Tag(label, hoursParent); }
    return tag;
  }

  function removeAllHoursTags(task) {
    const root = flattenedTags.byName(TAG_ROOT);
    if (!root) { return; }
    const hoursParent = root.tagNamed(TAG_HOURS_PARENT);
    if (!hoursParent) { return; }
    const toRemove = task.tags.filter(t =>
      t.parent && t.parent.id.primaryKey === hoursParent.id.primaryKey
    );
    toRemove.forEach(t => task.removeTag(t));
  }

  function hasTag(task, tag) {
    if (!tag) { return false; }
    return task.tags.some(t => t.id.primaryKey === tag.id.primaryKey);
  }

  function isUnderTag(tag, ancestor) {
    let current = tag;
    while (current.parent) {
      if (current.parent.id.primaryKey === ancestor.id.primaryKey) { return true; }
      current = current.parent;
    }
    return false;
  }

  function getReclaimTags(task) {
    const root = flattenedTags.byName(TAG_ROOT);
    if (!root) { return []; }
    return task.tags.filter(t => isUnderTag(t, root));
  }

  function getHoursFromTags(task) {
    const root = flattenedTags.byName(TAG_ROOT);
    if (!root) { return null; }
    const hoursParent = root.tagNamed(TAG_HOURS_PARENT);
    if (!hoursParent) { return null; }
    for (const t of task.tags) {
      if (t.parent && t.parent.id.primaryKey === hoursParent.id.primaryKey) {
        const match = t.name.match(/^(\d+(?:\.\d+)?)h$/);
        if (match) { return parseFloat(match[1]); }
      }
    }
    return null;
  }

  // ─── Credential Management ────────────────────────────────────────────────

  async function getApiKey() {
    try {
      const credentials = new Credentials();
      const result = await credentials.read(CRED_SVC);
      return result ? result.password : null;
    } catch (e) {
      return null;
    }
  }

  async function saveApiKey(apiKey) {
    const credentials = new Credentials();
    await credentials.write(CRED_SVC, 'reclaim', apiKey);
  }

  async function promptForApiKey() {
    const form = new Form();
    form.addField(new Form.Field.String('apiKey', 'API Key', null));
    form.validate = f => ((f.values['apiKey'] || '').trim().length > 0);
    const response = await form.show(
      'Reclaim.ai API Key',
      'Enter your Reclaim.ai API key.\n\nFind it in Reclaim.ai \u2192 Settings \u2192 Integrations \u2192 API.'
    );
    const apiKey = response.values['apiKey'].trim();
    await saveApiKey(apiKey);
    return apiKey;
  }

  async function requireApiKey() {
    const stored = await getApiKey();
    if (stored) { return stored; }
    return promptForApiKey();
  }

  // ─── HTTP / Reclaim API Layer ─────────────────────────────────────────────

  async function reclaimFetch(method, path, body, apiKey) {
    const req = new URL.FetchRequest();
    req.url = URL.fromString(API_BASE + path);
    req.method = method;
    req.headers = {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type':  'application/json',
      'Accept':        'application/json'
    };
    if (body !== undefined && body !== null) {
      req.bodyString = JSON.stringify(body);
    }

    const res = await req.fetch();

    if (res.statusCode === 401) {
      throw new Error('Reclaim.ai API key is invalid or expired. Run "Configure Reclaim Sync" to update it.');
    }
    if (res.statusCode === 404) {
      const e = new Error('Reclaim task not found (404): ' + path);
      e.statusCode = 404;
      throw e;
    }
    if (res.statusCode >= 400) {
      throw new Error('Reclaim API error ' + res.statusCode + ': ' + res.bodyString);
    }
    if (!res.bodyString || res.bodyString.trim() === '') { return null; }
    return JSON.parse(res.bodyString);
  }

  const listTasks  = (apiKey)              => reclaimFetch('GET',    '/tasks',           null,    apiKey);
  const getTask    = (taskId, apiKey)       => reclaimFetch('GET',    '/tasks/' + taskId,  null,   apiKey);
  const createTask = (payload, apiKey)      => reclaimFetch('POST',   '/tasks',            payload, apiKey);
  const updateTask = (id, payload, apiKey)  => reclaimFetch('PATCH',  '/tasks/' + id,      payload, apiKey);
  const deleteTask = (taskId, apiKey)       => reclaimFetch('DELETE', '/tasks/' + taskId,  null,   apiKey);

  // ─── OmniFocus → Reclaim Payload ─────────────────────────────────────────

  function buildReclaimPayload(task, options) {
    options = options || {};

    const payload = {
      title:  task.name,
      notes:  task.note || '',
      status: task.completionDate ? 'COMPLETE' : 'NEW'
    };

    if (task.dueDate) {
      payload.due = task.dueDate.toISOString();
    }

    const tagHours      = getHoursFromTags(task);
    const overrideHours = options.hours;

    if (overrideHours != null) {
      const mins = Math.round(overrideHours * 60);
      payload.duration     = mins;
      payload.minChunkSize = Math.min(30, mins);
      payload.maxChunkSize = mins;
    } else if (tagHours != null) {
      const mins = Math.round(tagHours * 60);
      payload.duration     = mins;
      payload.minChunkSize = Math.min(30, mins);
      payload.maxChunkSize = mins;
    } else if (task.estimatedMinutes) {
      payload.duration     = task.estimatedMinutes;
      payload.minChunkSize = Math.min(30, task.estimatedMinutes);
      payload.maxChunkSize = task.estimatedMinutes;
    }

    // Up Next — check option flag or the tag on the task (safe null check, no ?.)
    const rootTag   = flattenedTags.byName(TAG_ROOT);
    const upNextTag = rootTag ? rootTag.tagNamed(TAG_UP_NEXT) : null;
    payload.onDeck  = (options.upNext === true) || hasTag(task, upNextTag);

    return payload;
  }

  // ─── Sync Core ────────────────────────────────────────────────────────────

  async function syncOneTask(task, apiKey, options) {
    options = options || {};
    const existingId = task.customData[KEY_RECLAIM_ID];
    const payload    = buildReclaimPayload(task, options);
    let reclaimTask;

    if (existingId) {
      try {
        reclaimTask = await updateTask(existingId, payload, apiKey);
      } catch (e) {
        if (e.statusCode === 404) {
          reclaimTask = await createTask(payload, apiKey);
          task.customData[KEY_RECLAIM_ID] = String(reclaimTask.id);
        } else {
          throw e;
        }
      }
    } else {
      reclaimTask = await createTask(payload, apiKey);
      task.customData[KEY_RECLAIM_ID] = String(reclaimTask.id);
    }

    if (reclaimTask && reclaimTask.status === 'COMPLETE' && !task.completionDate) {
      task.markComplete();
    }

    return reclaimTask;
  }

  function getAllSyncTasks() {
    const root = flattenedTags.byName(TAG_ROOT);
    if (!root) { return []; }
    const syncTag = root.tagNamed(TAG_SYNC);
    if (!syncTag) { return []; }
    return flattenedTasks.filter(t => !t.dropped && hasTag(t, syncTag));
  }

  // ─── UI Helpers ───────────────────────────────────────────────────────────

  async function showAlert(title, message) {
    const alert = new Alert(title, message);
    alert.addOption('OK');
    await alert.show();
  }

  async function showError(error) {
    await showAlert('Reclaim Sync Error', error.message || String(error));
  }

  // ─── Exports ─────────────────────────────────────────────────────────────
  // Bare return — no `var x = (…)()` wrapper — so this object IS the file's
  // last evaluated expression and becomes the library object.

  return {
    PLUGIN_ID,
    KEY_RECLAIM_ID,   KEY_RECLAIM_HOURS,
    TAG_ROOT,         TAG_SYNC,        TAG_UP_NEXT,  TAG_HOURS_PARENT,

    getRootTag,       getSyncTag,      getUpNextTag, getHoursTag,
    removeAllHoursTags, getReclaimTags, hasTag,      getHoursFromTags,

    getApiKey,        saveApiKey,      promptForApiKey, requireApiKey,

    listTasks,        getTask,         createTask,   updateTask,  deleteTask,

    buildReclaimPayload, syncOneTask,  getAllSyncTasks,

    showAlert,        showError
  };

})()
