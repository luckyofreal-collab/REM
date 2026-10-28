importScripts('engine.js');
const KEY = 'remState';
const getState = async () => (await chrome.storage.local.get(KEY))[KEY] || { tasks: [], settings: { quietStart: '22:00', quietEnd: '08:00', sound: false, mascotSize: 110, mascotPosition: { right: 24, bottom: 24 }, personality: 'adaptive', dialogue: 'hybrid' }, inbox: [], eventIds: [], greetedSession: false };
const save = async s => { await chrome.storage.local.set({ [KEY]: s }); await updateBadge(s); };
async function updateBadge(s) { const n = s.inbox.filter(x => !x.read).length; await chrome.action.setBadgeText({ text: n ? String(Math.min(n,99)) : '' }); await chrome.action.setBadgeBackgroundColor({ color: '#7662b8' }); }
async function playSound(s) {
  if(!s.settings.sound)return;
  const url=chrome.runtime.getURL('offscreen.html');
  const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[url]});
  if(!contexts.length)await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['AUDIO_PLAYBACK'],justification:'Play the optional gentle reminder chime selected in REM preferences.'});
  chrome.runtime.sendMessage({type:'REM_SOUND'}).catch(()=>{});
}
function quiet(s, date = new Date()) {
  return REMEngine.isQuietAt(s.settings,date);
}
async function schedule() {
  const s=await getState(); const old=await chrome.alarms.getAll();
  for (const a of old) if (a.name.startsWith('rem:')) await chrome.alarms.clear(a.name);
  const candidates=s.tasks.flatMap(t=>REMEngine.eventsFor(t)).filter(e=>!s.eventIds.includes(e.id));
  for (const e of candidates) await chrome.alarms.create(`rem:${e.id}`, { when: Math.max(Date.now()+1000,e.at) });
  await chrome.alarms.create('rem:reconcile', { periodInMinutes: 5 });
}
async function deliver(eventId, fallback=false) {
  const s=await getState(); if (s.eventIds.includes(eventId)) return;
  const [taskId, occurrenceId, kind]=eventId.split(':'); const task=s.tasks.find(t=>t.id===taskId&&t.occurrenceId===occurrenceId);
  if (!task || task.status!=='active') return;
  const critical=task.priority==='critical';
  const item={ id:eventId, taskId, occurrenceId, title:task.title, priority:task.priority, kind, at:Date.now(), read:false, fallback };
  s.inbox.unshift(item); s.inbox=s.inbox.slice(0,500); s.eventIds=[...s.eventIds,eventId].slice(-1000);
  if (kind==='due' || kind==='snooze') { task.acknowledgedAt=null; task.followUpDue=Date.now()+10*60000; task.followUpSent=false; if(kind==='snooze')task.snoozedUntil=null; }
  if (kind==='followup') { task.followUpSent=true; task.followUpDue=null; }
  await save(s);
  if (!quiet(s) || critical) {
    try { await chrome.notifications.create(eventId,{ type:'basic', iconUrl:'assets/icon.svg', title:kind==='followup'?'REM · A gentle follow-up':critical?'REM · Critical reminder':'REM · Reminder', message:task.title, priority:critical?2:0, buttons:[{title:'Acknowledge'},{title:'Snooze 15 min'}] }); }
    catch { await saveInboxOnly(eventId); }
    await playSound(s).catch(()=>{});
  }
  if (kind==='due' && critical) await showCritical(task);
  await schedule();
}
async function saveInboxOnly(eventId){const s=await getState(); const i=s.inbox.find(x=>x.id===eventId); if(i)i.fallback=true; await save(s);}
async function showCritical(task){
  const tabs=await chrome.tabs.query({active:true,currentWindow:true,url:['http://*/*','https://*/*']});
  const tab=tabs[0]; if(tab?.id) chrome.tabs.sendMessage(tab.id,{type:'REM_CRITICAL',task}).catch(()=>{});
}
async function reconcile(){await save(await getState());await schedule();}
chrome.runtime.onInstalled.addListener(async()=>{const s=await getState();await save(s);await reconcile();});
chrome.runtime.onStartup.addListener(async()=>{
  const s=await getState();
  const groups=REMEngine.recoveryGroups(s.tasks);
  if(groups.length){for(const g of groups){const t=s.tasks.find(x=>x.id===g.taskId);if(t)for(const event of REMEngine.eventsFor(t))if(event.at<=Date.now())s.eventIds.push(event.id);}s.eventIds=s.eventIds.slice(-1000);const recovery={id:`recovery:${Date.now()}`,kind:'recovery',title:'You have reminders to catch up on',groups,priority:groups[0].priority,at:Date.now(),read:false};s.inbox.unshift(recovery);await save(s);if(!quiet(s)||groups[0].priority==='critical'){await chrome.notifications.create(recovery.id,{type:'basic',iconUrl:'assets/icon.svg',title:'REM · Let’s catch up gently',message:`${groups.length} reminder${groups.length===1?'':'s'} waiting, starting with ${groups[0].title}`,priority:groups[0].priority==='critical'?2:0});await playSound(s).catch(()=>{});}}
  const greeted=(await chrome.storage.session.get('greeted'))?.greeted;
  if(!greeted){s.inbox.unshift({id:`greeting:${Date.now()}`,kind:'greeting',title:'Good to see you. Let’s take things one at a time.',at:Date.now(),read:false});await chrome.storage.session.set({greeted:true});await save(s);}
  await reconcile();
});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='rem:reconcile')reconcile();else if(a.name.startsWith('rem:'))deliver(a.name.slice(4));});
const handledNotificationClosures=new Set();
chrome.notifications.onButtonClicked.addListener(async(id,index)=>{const s=await getState();const item=s.inbox.find(x=>x.id===id);if(!item)return;const task=s.tasks.find(t=>t.id===item.taskId);if(task){if(index===0)Object.assign(task,REMEngine.acknowledge(task));else{task.snoozedUntil=Date.now()+15*60000;task.snoozeId=REMEngine.id();task.status='active';task.followUpDue=null;task.followUpSent=false;}}item.read=true;await save(s);await schedule();handledNotificationClosures.add(id);chrome.notifications.clear(id);});
chrome.notifications.onClosed.addListener(async(id,byUser)=>{if(handledNotificationClosures.delete(id))return;const s=await getState(),item=s.inbox.find(x=>x.id===id),task=s.tasks.find(t=>t.id===item?.taskId);if(task){Object.assign(task,REMEngine.acknowledge(task));item.read=true;await save(s);await schedule();}});
chrome.notifications.onClicked.addListener(()=>chrome.runtime.openOptionsPage());
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  (async()=>{const s=await getState();switch(msg.type){
    case 'REM_GET': reply(s);break;
    case 'REM_OPEN_DASHBOARD': await chrome.runtime.openOptionsPage();reply(true);break;
    case 'REM_SAVE_TASK': {const task=msg.task?.id?msg.task:REMEngine.makeTask(msg.task);const i=s.tasks.findIndex(t=>t.id===task.id);if(i<0)s.tasks.push(task);else s.tasks[i]=task;await save(s);await schedule();reply(task);break;}
    case 'REM_ACTION': {const t=s.tasks.find(x=>x.id===msg.taskId);if(!t)break;if(msg.action==='start')t.status='active',t.startedAt=Date.now();if(msg.action==='ack')Object.assign(t,REMEngine.acknowledge(t));if(msg.action==='complete')Object.assign(t,REMEngine.complete(t));if(msg.action==='snooze'){t.snoozedUntil=Date.now()+Math.max(1,Number(msg.minutes)||5)*60000;t.snoozeId=REMEngine.id();t.status='active';t.acknowledgedAt=null;t.followUpDue=null;t.followUpSent=false;}if(msg.action==='delete')s.tasks=s.tasks.filter(x=>x.id!==t.id);await save(s);await schedule();reply(t);break;}
    case 'REM_SETTINGS': s.settings={...s.settings,...msg.settings};await save(s);reply(s.settings);break;
    case 'REM_MARK_READ': {const i=s.inbox.find(x=>x.id===msg.id);if(i)i.read=true;await save(s);reply(true);break;}
    case 'REM_DISMISS_ALL': s.inbox=s.inbox.map(x=>({...x,read:true}));await save(s);reply(true);break;
    case 'REM_IMPORT': {const data=msg.data;if(!data||!Array.isArray(data.tasks))throw Error('Invalid REM backup');s.tasks=data.tasks;s.settings={...s.settings,...(data.settings||{})};s.inbox=data.inbox||[];await save(s);await schedule();reply(true);break;}
  }})().catch(e=>reply({error:e.message}));return true;
});
chrome.runtime.onConnect.addListener(()=>{});
