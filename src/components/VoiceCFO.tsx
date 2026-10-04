import { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX, X, Send } from 'lucide-react';
import { CFO_COMMANDS, type CfoResult } from '../../shared/voiceCfo.ts';
import './voiceCfo.css';

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null; start(): void; abort(): void; stop(): void };
export function VoiceCFO({onResult, onStage}: {onResult: (r: CfoResult) => void; onStage: (n: number) => void}) {
  const [open,setOpen] = useState(false), [phase,setPhase] = useState('idle'), [text,setText] = useState(''), [answer,setAnswer] = useState(''), [error,setError] = useState(''), [muted,setMuted] = useState(false);
  const recognition = useRef<Recognition | null>(null), controller = useRef<AbortController | null>(null), generation = useRef(0), lock = useRef(false), muteRef = useRef(false);
  const retry = useRef<{query:string;id:string}|null>(null);
  const narrationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const speak = (message: string, done: () => void) => {
    if (muteRef.current || !window.speechSynthesis) { narrationTimer.current = setTimeout(done, 2200); return; }
    const utterance = new SpeechSynthesisUtterance(message); utterance.lang = 'en-IN'; utterance.rate = 1.05;
    utterance.voice = speechSynthesis.getVoices().find(v=>v.lang.startsWith('en')) ?? null;
    utterance.onend = done; utterance.onerror = done; speechSynthesis.speak(utterance);
  };
  const execute = async (query: string) => {
    if (lock.current || !query.trim()) return;
    lock.current = true; if(recognition.current) {recognition.current.onend=null;recognition.current.abort();} window.speechSynthesis?.cancel(); clearTimeout(narrationTimer.current);
    const run = ++generation.current; setOpen(true); setText(query); setPhase('thinking'); setError('');
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(()=>abort.abort(),20000);
    if (retry.current?.query !== query) retry.current = {query,id:crypto.randomUUID()};
    try {
      const response = await fetch('/api/voice-command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,requestId:retry.current.id}),signal:abort.signal});
      const result = await response.json(); if (!response.ok) throw new Error(`HTTP ${response.status}: ${result.error ?? 'Command failed'}`);
      if (run !== generation.current) return;
      retry.current = null; onResult(result); setAnswer(result.answer); setPhase('speaking');
      const stages = result.stages as CfoResult['stages'];
      const next = (index: number) => {
        if (run !== generation.current) return;
        if (!stages || index >= stages.length) {setPhase('idle'); return;}
        onStage(index); speak(`${stages[index].title}. ${stages[index].narration}`,()=>next(index+1));
      };
      speak(result.answer,()=>next(0));
    } catch(e) {setError(abort.signal.aborted ? 'Response timed out. Retry the same command safely to check its result.' : (e as Error).message); setPhase('idle');}
    finally {clearTimeout(timeout);lock.current = false;}
  };
  const start = () => {
    setOpen(true); if (lock.current) return;
    if (phase === 'listening') {recognition.current?.stop(); return;}
    ++generation.current; clearTimeout(narrationTimer.current); window.speechSynthesis?.cancel();
    const ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!ctor) {setError('Speech recognition is unavailable in this browser. Type a command or use a stage chip.'); return;}
    recognition.current?.abort();
    const mic: Recognition = new ctor(); recognition.current = mic; mic.lang = 'en-IN'; mic.interimResults = true; mic.continuous = false;
    let final = '';
    mic.onresult = e => {let interim=''; for(let i=0;i<e.results.length;i++){if(e.results[i].isFinal) final=e.results[i][0].transcript; else interim+=e.results[i][0].transcript;} setText(final || interim);};
    mic.onerror = e => {setError(`Microphone: ${e.error}. You can type or use a stage chip.`); setPhase('idle');};
    mic.onend = () => {setPhase('idle'); if(final) void execute(final);};
    setError(''); setText(''); setPhase('listening'); try {mic.start();} catch(e) {setError((e as Error).message);setPhase('idle');}
  };
  const startRef = useRef(start); startRef.current = start;
  useEffect(()=>{
    const key = (e: KeyboardEvent) => {const el=e.target as HTMLElement; if(e.code==='Space' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !el.closest('input,textarea,select,button,[contenteditable="true"],[role="dialog"]')){e.preventDefault();startRef.current();}};
    const command = (e: Event) => {void execute((e as CustomEvent<string>).detail);};
    window.addEventListener('cfo-command',command);
    window.addEventListener('keydown',key);
    return ()=>{window.removeEventListener('cfo-command',command);window.removeEventListener('keydown',key);++generation.current; controller.current?.abort(); if(recognition.current) {recognition.current.onend=null;recognition.current.abort();} window.speechSynthesis?.cancel();clearTimeout(narrationTimer.current);};
  },[]);
  return <aside className={`cfo-shell ${phase}`} aria-label="Voice CFO">
    {open && <section className="cfo-hud"><header><strong>VOICE CFO <small>LIVE LEDGER</small></strong><button aria-label="Close Voice CFO" onClick={()=>{setOpen(false);++generation.current;clearTimeout(narrationTimer.current);window.speechSynthesis?.cancel();if(recognition.current){recognition.current.onend=null;recognition.current.abort();}setPhase('idle');}}><X size={18}/></button></header>
      <div className="cfo-wave" aria-hidden="true">{Array.from({length:24},(_,i)=><i key={i} style={{animationDelay:`${i*.055}s`}}/>)}</div>
      <p className="cfo-status" role="status">{phase === 'listening' ? 'Listening…' : phase === 'thinking' ? 'Reading ledger · solving constraints…' : phase === 'speaking' ? 'CFO briefing' : 'Ask. Plan. See it happen.'}</p>
      <form onSubmit={e=>{e.preventDefault();void execute(text);}}><input aria-label="Voice CFO command" value={text} onChange={e=>setText(e.target.value)} placeholder="Ask your CFO…"/><button disabled={phase==='thinking'} aria-label="Execute command"><Send size={18}/></button></form>
      {error && <p role="alert">{error}</p>}{answer && <p className="cfo-answer">{answer}</p>}
      <small>STAGE COMMANDS · executes the same ledger engine</small><div className="cfo-chips">{CFO_COMMANDS.map((query,i)=><button disabled={phase==='thinking'} key={query} title={query} onClick={()=>void execute(query)}>{['Cover medical expense','Simulate flights','Audit food spend','Narrate latest trace'][i]}</button>)}</div>
    </section>}
    <div className="cfo-bar"><button className="cfo-orb" aria-label="Start Voice CFO microphone" onClick={start}><Mic size={22}/></button><button onClick={()=>setOpen(v=>!v)}>Voice CFO <small>SPACE TO SPEAK</small></button><button aria-label={muted?'Unmute CFO':'Mute CFO'} onClick={()=>{muteRef.current=!muted;setMuted(!muted);if(!muted) window.speechSynthesis?.cancel();}}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button></div>
  </aside>;
}
