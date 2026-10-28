chrome.runtime.onMessage.addListener(message=>{
  if(message.type!=='REM_SOUND')return;
  try{
    const AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext;
    const context=new AudioContextClass();
    const now=context.currentTime;
    [659.25,880].forEach((frequency,index)=>{
      const oscillator=context.createOscillator(),gain=context.createGain();
      oscillator.type='sine';oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0.0001,now+index*.13);
      gain.gain.exponentialRampToValueAtTime(.045,now+index*.13+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,now+index*.13+.42);
      oscillator.connect(gain);gain.connect(context.destination);
      oscillator.start(now+index*.13);oscillator.stop(now+index*.13+.45);
    });
    setTimeout(()=>context.close(),1000);
  }catch{}
});
