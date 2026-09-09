const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let active=null;
let activeEditor=null;
let activeButton=null;
let keepListening=false;
let insertBefore='';
let insertAfter='';
let finalTranscript='';
let lastFinalAt=0;

const TERM_RULES=[
  {canonical:'ChatGPT',aliases:[/\bchat\s*g\s*p\s*t\b/gi,/\bchat\s*gbt\b/gi,/\bchat\s*gtp\b/gi,/\bchibis\b/gi,/\bchibi(?:'s)?\b/gi,/\bchat jee pee tee\b/gi]},
  {canonical:'Codex',aliases:[/\bcode\s*x\b/gi,/\bcod\s*x\b/gi]},
  {canonical:'T.I.D.E.',aliases:[/\btide\b/gi,/\bt\.i\.d\.e\.?\b/gi]},
  {canonical:'GeoGuessr',aliases:[/\bgeo\s*guesser\b/gi,/\bgeoguesser\b/gi,/\bgeo guesser\b/gi]},
  {canonical:'PlayStation',aliases:[/\bplay\s*station\b/gi]},
  {canonical:'Cloudflare',aliases:[/\bcloud\s*flare\b/gi]},
  {canonical:'Premiere Pro',aliases:[/\bpremier pro\b/gi,/\bpremiere pro\b/gi]},
  {canonical:'OpenAI',aliases:[/\bopen\s*a\s*i\b/gi]}
];

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

function normalizeDomainTerms(text){
  let out=String(text||'');
  for(const rule of TERM_RULES){
    for(const alias of rule.aliases)out=out.replace(alias,rule.canonical);
  }
  out=out.replace(/\b((?:worked|working|work|used|using|use|opened|opening|open|typed|typing|wrote|writing|coded|coding|ran|run)\s+(?:in|on|with|using)\s+(?:the\s+)?)kodak\b/gi,'$1Codex');
  out=out.replace(/\b((?:in|on|with|using)\s+(?:the\s+)?)kodak\b/gi,'$1Codex');
  return out;
}

function normalizePunctuationCommands(text){
  let out=String(text||'');
  const commands=[
    [/\bnew\s+paragraph\b/gi,'\n\n'],
    [/\bnew\s+line\b/gi,'\n'],
    [/\bquestion\s+mark\b/gi,'?'],
    [/\bexclamation\s+(?:point|mark)\b/gi,'!'],
    [/\bfull\s+stop\b/gi,'.'],
    [/\bsemi\s*colon\b/gi,';'],
    [/\bcolon\b/gi,':'],
    [/\bcomma\b/gi,','],
    [/\bperiod\b/gi,'.']
  ];
  for(const [pattern,replacement] of commands)out=out.replace(pattern,replacement);
  out=out.replace(/[ \t]+([,.;:!?])/g,'$1');
  out=out.replace(/([,;:])(?=\S)/g,'$1 ');
  out=out.replace(/([.!?])(?=[A-Za-z0-9])/g,'$1 ');
  out=out.replace(/[ \t]*\n[ \t]*/g,'\n');
  out=out.replace(/\bi\b/g,'I');
  out=out.replace(/(^|[.!?]\s+|\n+)([a-z])/g,(m,prefix,letter)=>prefix+letter.toUpperCase());
  return out;
}

function polishTranscript(text){
  return normalizePunctuationCommands(normalizeDomainTerms(text));
}

function transcriptScore(text,confidence=0){
  const normalized=polishTranscript(text);
  let score=Number(confidence)||0;
  const lower=normalized.toLowerCase();
  for(const term of ['chatgpt','codex','t.i.d.e.','geoguessr','playstation','cloudflare','premiere pro','openai']){
    if(lower.includes(term))score+=3;
  }
  if(/\b(?:kodak|chibis|chibi's|chat gbt|chat gtp|geo guesser|cloud flare|premier pro)\b/i.test(text))score+=1.5;
  return score;
}

function bestAlternative(result){
  const options=[];
  for(let i=0;i<result.length;i++){
    const alt=result[i];
    options.push({text:alt?.transcript||'',confidence:alt?.confidence||0});
  }
  if(!options.length)return '';
  options.sort((a,b)=>transcriptScore(b.text,b.confidence)-transcriptScore(a.text,a.confidence));
  return polishTranscript(options[0].text);
}

function addFinalPiece(current,next,gapMs=0){
  let piece=polishTranscript(next).trim();
  if(!piece)return polishTranscript(current);
  let base=polishTranscript(current).trimEnd();
  if(!base)return piece;

  if(!/[.!?,;:\n]$/.test(base)&&!/^[,.;:!?]/.test(piece)){
    if(gapMs>=1800)base+='.';
    else if(gapMs>=850)base+=',';
  }

  if(/[.!?]$/.test(base)||/\n\s*$/.test(base)){
    piece=piece.replace(/^([a-z])/,m=>m.toUpperCase());
  }
  return polishTranscript(`${base} ${piece}`);
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
  const spoken=polishTranscript(addPiece(finalTranscript,interim));
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
  lastFinalAt=0;
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
  lastFinalAt=0;
  const start=Number.isFinite(editor.selectionStart)?editor.selectionStart:editor.value.length;
  const end=Number.isFinite(editor.selectionEnd)?editor.selectionEnd:start;
  insertBefore=editor.value.slice(0,start);
  insertAfter=editor.value.slice(end);

  const recognition=new Recognition();
  active=recognition;
  recognition.lang='en-US';
  recognition.continuous=true;
  recognition.interimResults=true;
  recognition.maxAlternatives=5;
  const local=await preferLocalDictation(recognition);

  let announced=false;
  recognition.onstart=()=>{
    setButtonListening(true);
    if(!announced){notify(local?'Voice dictation started on this device.':'Voice dictation started.');announced=true;}
  };
  recognition.onresult=event=>{
    let interim='';
    const now=Date.now();
    for(let i=event.resultIndex;i<event.results.length;i++){
      const result=event.results[i];
      const transcript=bestAlternative(result);
      if(result.isFinal){
        const gap=lastFinalAt?now-lastFinalAt:0;
        finalTranscript=addFinalPiece(finalTranscript,transcript,gap);
        lastFinalAt=now;
      }else{
        interim=addPiece(interim,transcript);
      }
    }
    finalTranscript=polishTranscript(finalTranscript);
    updateEditor(interim);
  };
  recognition.onerror=event=>{
    if(event.error==='no-speech')return;
    const messages={
      'not-allowed':'Microphone permission was blocked. Allow microphone access for T.I.D.E. and try again.',
      'audio-capture':'T.I.D.E. could not access a microphone.',
      'network':'Voice recognition temporarily lost its connection.',
      'language-not-supported':'English voice recognition is not available in this browser.',
      'phrases-not-supported':'This browser does not support optional phrase hints.'
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
  button.title=Recognition?'Speak naturally. Say comma, period, question mark, exclamation point, new line, or new paragraph for punctuation. No OpenAI API credits are used.':'This browser does not expose voice dictation to websites.';
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
