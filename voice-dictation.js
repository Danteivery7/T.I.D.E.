const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let active=null;
let activeEditor=null;
let activeButton=null;
let keepListening=false;
let insertBefore='';
let insertAfter='';
let finalTranscript='';

function notify(message,type='good'){
  const region=document.querySelector('#toast-region');
  if(!region)return;
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.textContent=message;
  region.append(el);
  setTimeout(()=>el.remove(),3200);
}

function addPiece(current,next){
  const piece=String(next||'').trim();
  if(!piece)return current;
  if(!current)return piece;
  return `${current}${/\s$/.test(current)?'':' '}${piece}`;
}

function composeDictation(before,spoken,after){
  const text=String(spoken||'').trim();
  if(!text)return `${before}${after}`;
  const left=before&&!/[\s\n]$/.test(before)&&!/^[,.;!?]/.test(text)?' ':'';
  const right=after&&!/^\s/.test(after)&&!/[\s\n]$/.test(text)?' ':'';
  return `${before}${left}${text}${right}${after}`;
}

function updateEditor(interim=''){
  if(!activeEditor?.isConnected)return;
  const spoken=addPiece(finalTranscript,interim);
  activeEditor.value=composeDictation(insertBefore,spoken,insertAfter);
  activeEditor.dispatchEvent(new Event('input',{bubbles:true}));
  const leftSpace=insertBefore&&!/[\s\n]$/.test(insertBefore)&&spoken&&!/^[,.;!?]/.test(spoken)?1:0;
  const caret=insertBefore.length+leftSpace+spoken.length;
  try{activeEditor.setSelectionRange(caret,caret)}catch{}
}

function setButtonListening(listening){
  if(!activeButton?.isConnected)return;
  activeButton.classList.toggle('primary',listening);
  activeButton.classList.toggle('ghost',!listening);
  activeButton.setAttribute('aria-pressed',String(listening));
  activeButton.textContent=listening?'● Listening · Stop':'🎤 Dictate';
}

function finishDictation(message='Dictation stopped.'){
  keepListening=false;
  setButtonListening(false);
  if(message)notify(message);
  active=null;
  activeEditor=null;
  activeButton=null;
  finalTranscript='';
}

function stopDictation(message='Dictation added to today.'){
  keepListening=false;
  if(active){
    try{active.stop();return}catch{}
  }
  finishDictation(message);
}

async function preferLocalDictation(recognition){
  const Native=window.SpeechRecognition;
  if(!Native||typeof Native.available!=='function'||!('processLocally' in recognition))return false;
  try{
    const availability=await Native.available({langs:['en-US'],processLocally:true,quality:'dictation'});
    if(availability==='available'){
      recognition.processLocally=true;
      return true;
    }
  }catch{}
  return false;
}

function applyContextHints(recognition){
  if(!('phrases' in recognition)||typeof window.SpeechRecognitionPhrase!=='function')return;
  try{
    recognition.phrases=['T.I.D.E.','GeoGuessr','PlayStation','Xbox','Spotify','Premiere Pro','Cloudflare'].map(phrase=>new window.SpeechRecognitionPhrase(phrase,5));
  }catch{}
}

async function startDictation(editor,button){
  if(!Recognition){
    notify('Voice dictation is not supported by this browser.','bad');
    return;
  }
  if(active)stopDictation('Previous dictation stopped.');

  activeEditor=editor;
  activeButton=button;
  keepListening=true;
  finalTranscript='';
  const start=Number.isFinite(editor.selectionStart)?editor.selectionStart:editor.value.length;
  const end=Number.isFinite(editor.selectionEnd)?editor.selectionEnd:start;
  insertBefore=editor.value.slice(0,start);
  insertAfter=editor.value.slice(end);

  const recognition=new Recognition();
  active=recognition;
  recognition.lang='en-US';
  recognition.continuous=true;
  recognition.interimResults=true;
  recognition.maxAlternatives=1;
  applyContextHints(recognition);
  const local=await preferLocalDictation(recognition);

  let announced=false;
  recognition.onstart=()=>{
    setButtonListening(true);
    if(!announced){notify(local?'Voice dictation started on this device.':'Voice dictation started.');announced=true;}
  };
  recognition.onresult=event=>{
    let interim='';
    for(let i=event.resultIndex;i<event.results.length;i++){
      const transcript=event.results[i]?.[0]?.transcript||'';
      if(event.results[i].isFinal)finalTranscript=addPiece(finalTranscript,transcript);
      else interim=addPiece(interim,transcript);
    }
    updateEditor(interim);
  };
  recognition.onerror=event=>{
    if(event.error==='no-speech')return;
    const messages={
      'not-allowed':'Microphone permission was blocked. Allow microphone access for T.I.D.E. and try again.',
      'audio-capture':'T.I.D.E. could not access a microphone.',
      'network':'Voice recognition temporarily lost its connection.'
    };
    notify(messages[event.error]||`Voice dictation error: ${event.error}`,'bad');
    keepListening=false;
  };
  recognition.onend=()=>{
    if(keepListening&&active===recognition&&activeEditor?.isConnected){
      setTimeout(()=>{
        if(!keepListening||active!==recognition)return;
        try{recognition.start()}catch{finishDictation('Dictation paused. Tap Dictate to continue.')}
      },180);
      return;
    }
    if(active===recognition)finishDictation(finalTranscript?'Dictation added to today.':'Dictation stopped.');
  };

  try{recognition.start()}catch(error){
    keepListening=false;
    finishDictation('Could not start voice dictation.');
    console.error(error);
  }
}

function attachDictation(){
  const editor=document.querySelector('#day-editor');
  if(!editor)return;
  const actions=editor.closest('.day-card')?.querySelector('.editor-actions .chip-row');
  if(!actions||actions.querySelector('#voice-dictation'))return;

  const button=document.createElement('button');
  button.type='button';
  button.id='voice-dictation';
  button.className='button ghost';
  button.textContent=Recognition?'🎤 Dictate':'🎤 Dictation unavailable';
  button.disabled=!Recognition;
  button.setAttribute('aria-pressed','false');
  button.title=Recognition?'Speak into today’s entry using your browser/device speech recognition. No OpenAI API credits are used.':'This browser does not expose voice dictation to websites.';
  button.addEventListener('click',()=>{
    if(active&&activeEditor===editor)stopDictation();
    else startDictation(editor,button);
  });

  const save=actions.querySelector('#save-day');
  actions.insertBefore(button,save||null);
}

const observer=new MutationObserver(()=>{
  if(activeEditor&&!activeEditor.isConnected)stopDictation('Dictation stopped.');
  attachDictation();
});
observer.observe(document.querySelector('#view-root')||document.body,{childList:true,subtree:true});
attachDictation();
