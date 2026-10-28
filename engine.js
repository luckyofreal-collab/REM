/* Pure REM scheduling rules. No Chrome APIs or DOM dependencies. */
(function (root) {
  const PRIORITY = { low: 1, normal: 2, high: 3, critical: 4 };
  const id = () => (globalThis.crypto?.randomUUID?.() || `rem-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  function nextOccurrence(task, after = Date.now()) {
    if (!task.recurrence || task.recurrence.frequency === 'none') return null;
    const base = new Date(task.dueAt), cursor = new Date(after);
    const step = task.recurrence.frequency === 'daily' ? 1 : task.recurrence.frequency === 'weekly' ? 7 : null;
    for (let i = 1; i <= 366; i++) {
      const d = new Date(base); d.setDate(d.getDate() + (step || 1) * i);
      if (task.recurrence.frequency === 'weekdays' && !task.recurrence.days?.includes(d.getDay())) continue;
      if (d.getTime() > cursor.getTime()) return d.getTime();
    }
    return null;
  }
  function eventsFor(task) {
    if (task.status === 'completed' || task.status === 'cancelled') return [];
    const out = [];
    if (task.status !== 'active') return out;
    if (task.dueAt - 30 * 60000 > Date.now()) out.push({ at: task.dueAt - 30 * 60000, kind: 'prewarning' });
    out.push({ at: task.snoozedUntil || task.dueAt, kind: task.snoozedUntil ? 'snooze' : 'due' });
    if (task.followUpDue && !task.followUpSent) out.push({ at: task.followUpDue, kind: 'followup' });
    return out.map(e => ({ ...e, id: `${task.id}:${task.occurrenceId}:${e.kind}${e.kind === 'snooze' ? `:${task.snoozeId || 'initial'}` : ''}`, taskId: task.id, occurrenceId: task.occurrenceId, priority: task.priority, title: task.title }));
  }
  function makeTask(input, now = Date.now()) {
    const task = { id: id(), title: String(input.title || '').trim(), notes: input.notes || '', dueAt: Number(input.dueAt), priority: input.priority || 'normal', status: 'pending', startedAt: null,
      recurrence: input.recurrence || { frequency: 'none' }, occurrenceId: id(), createdAt: now, snoozedUntil: null, followUpSent: false, acknowledgedAt: null };
    if (!task.title || !Number.isFinite(task.dueAt) || !PRIORITY[task.priority]) throw new Error('A title, due date, and valid priority are required.');
    return task;
  }
  function acknowledge(task, now = Date.now()) { return { ...task, acknowledgedAt: now, followUpDue: null, snoozedUntil: null }; }
  function complete(task, now = Date.now()) {
    if (task.recurrence?.frequency && task.recurrence.frequency !== 'none') {
      const dueAt = nextOccurrence(task, now);
      if (dueAt) return { ...task, dueAt, occurrenceId: id(), status: 'active', snoozedUntil: null, followUpSent: false, acknowledgedAt: null, completedOccurrenceAt: now };
    }
    return { ...task, status: 'completed', completedAt: now, snoozedUntil: null };
  }
  function recoveryGroups(tasks, now = Date.now()) {
    const overdue = tasks.filter(t => t.status === 'active' && (t.snoozedUntil || t.dueAt) <= now).sort((a,b) => PRIORITY[b.priority]-PRIORITY[a.priority] || a.dueAt-b.dueAt);
    const grouped = new Map(), singles = [];
    for (const t of overdue) {
      if (t.recurrence?.frequency && t.recurrence.frequency !== 'none' && now - t.dueAt > 24*3600000) {
        let count=1, cursor=t.dueAt; for(let i=0;i<365;i++){const next=nextOccurrence(t,cursor);if(!next||next>now)break;count++;cursor=next;}
        const key = t.id; const entry = grouped.get(key) || { taskId: t.id, title: t.title, count: 0, priority: t.priority, oldestDueAt: t.dueAt, kind: 'group' };
        entry.count+=count; entry.oldestDueAt = Math.min(entry.oldestDueAt, t.dueAt); grouped.set(key, entry);
      } else singles.push({ taskId: t.id, title: t.title, count: 1, priority: t.priority, oldestDueAt: t.dueAt, kind: 'single' });
    }
    return [...singles, ...grouped.values()].sort((a,b) => PRIORITY[b.priority]-PRIORITY[a.priority] || a.oldestDueAt-b.oldestDueAt);
  }
  function isQuietAt(settings, date = new Date()) {
    const parse = value => { const [h,m] = String(value || '00:00').split(':').map(Number); return h*60+m; };
    const now=date.getHours()*60+date.getMinutes(), start=parse(settings.quietStart), end=parse(settings.quietEnd);
    return start === end ? false : start < end ? now >= start && now < end : now >= start || now < end;
  }
  const api = { PRIORITY, id, makeTask, nextOccurrence, eventsFor, acknowledge, complete, recoveryGroups, isQuietAt };
  root.REMEngine = api; if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
