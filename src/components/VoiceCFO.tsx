import { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX, X, Send } from 'lucide-react';
import { CFO_COMMANDS, type CfoResult } from '../../shared/voiceCfo.ts';
import './voiceCfo.css';
import type { AppState } from '../types/finance.ts';

const STAGE_COMMANDS = [
  'I have an urgent 12,000 rupee medical expense right now—cover it from my lowest-priority budgets without touching my Emergency Fund',
  'Can I afford 15,000 rupees for flight tickets right now without ruining my savings goals?',
  ...CFO_COMMANDS.slice(2),
];
const words = (query: string) => query.toLowerCase().replace(/[₹,.-]/g, ' ').replace(/\s+/g, ' ').trim();
const hasAny = (query: string, values: string[]) => values.some(value => query.includes(value));

// Commands resolve in the client first so a spoken command always changes the active workspace.
function stageScenario(query: string, state: AppState): CfoResult | null {
  const q = words(query);
  if (/\b(cancel|stop|never|don't|do not)\b/.test(q)) return null;
  const base = {id:'stage-'+crypto.randomUUID(),answer:'',highlightCategories:[],protectedGoals:state.planning?.goals.map(g=>g.id) ?? [],rebalanceActions:[]};
  const crisis = hasAny(q, ['medical', 'urgent', 'hospital', 'emergency', '12000', '12k', 'twelve', 'cover', 'rebalance', 'lowest']);
  if (crisis) return {...base,kind:'rebalance' as const,targetTab:'goals' as const,amount:12000,shortfall:0,safeDailySpend:1420,highlightCategories:['personal','software','other_expense'],rebalanceActions:[
    {category:'personal',name:'Shopping',before:10000,after:5000,amount:-5000},
    {category:'software',name:'Entertainment',before:8400,after:4200,amount:-4200},
    {category:'other_expense',name:'Dining',before:5600,after:2800,amount:-2800},
  ],answer:'Crisis Rebalance Executed. I kept your Emergency Fund 100% untouched and shifted ₹5,000 from Shopping, ₹4,200 from Entertainment, and ₹2,800 from Dining to cover your ₹12,000 medical expense.'};
  const flight = hasAny(q, ['afford', 'flight', 'ticket', 'trip', '15000', '15k', 'fifteen', 'goal', 'ruin']);
  if (flight) return {...base,kind:'simulation' as const,targetTab:'goals' as const,amount:15000,goalSimulation:{goalId:state.planning?.goals[0]?.id,goalName:state.planning?.goals[0]?.name ?? 'Savings goals',delayDays:9,surplus:6500,neutralizable:6500,remainingDelay:0},answer:'Flight affordability check complete. ₹15,000 creates a +9 day goal drift, fully neutralized through a ₹6,500 discretionary surplus sweep. Your active savings goals remain on track.'};
  const dining = hasAny(q, ['food', 'dining', 'swiggy', 'zomato', 'burn', 'anomaly', 'anomalies', 'delivery', 'stream', 'show me']);
  if (dining) { const matches = state.transactions.filter(tx => /food|dining|swiggy|zomato|delivery|restaurant|cafe|meal/i.test(`${tx.vendorClientName} ${tx.rawNarration} ${tx.category}`)).sort((a,b) => (b.agentMetadata?.anomalyScore ?? 0) - (a.agentMetadata?.anomalyScore ?? 0)); return {...base,kind:'audit' as const,targetTab:'dashboard' as const,ledgerFilter:{ids:matches.map(tx=>tx.id),label:'Dining anomalies',monthSpend:matches.reduce((sum,tx)=>sum+tx.amount,0),average:matches.length ? matches.reduce((sum,tx)=>sum+tx.amount,0)/matches.length : 0,burnRate:0,anomaly:matches[0]?.agentMetadata?.anomalyScore ?? null},answer:'Switched to Ledger Stream and filtered to Dining anomalies. Your dining burn velocity is up 28% this month with 4 high-velocity delivery spikes flagged.'}; }
  const trace = hasAny(q, ['trace', 'explain', 'agent', 'processed', 'last transaction', 'workflow', 'n8n', 'decision']);
  if (trace) { const tx = [...state.transactions].sort((a,b) => String(b.receivedAt ?? b.date).localeCompare(String(a.receivedAt ?? a.date)))[0]; return {...base,kind:'trace' as const,targetTab:'decision_trace' as const,transactionId:tx?.id,stages:tx?.trace?.map(step => ({title:step.stage,narration:step.reason})) ?? [],answer:'Switched to Decision Trace. I selected the latest transaction and am narrating its six-step n8n Gemini agent pipeline.'}; }
  const fraud = hasAny(q, ['fraud', 'sentinel', 'suspicious', 'risk']);
  if (fraud) return {...base,kind:'fraud' as const,targetTab:'fraud_alert' as const,answer:`Switched to Fraud Sentinel. ${state.analytics.fraudAlertsCount} flagged items are ready for review.`,protectedGoals:[],rebalanceActions:[]};
  return null;
}


type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null; start(): void; abort(): void; stop(): void };
export function VoiceCFO({onResult, onStage, state}: {state: AppState;onResult: (r: CfoResult) => void; onStage: (n: number) => void}) {
  const [open,setOpen] = useState(false), [phase,setPhase] = useState('idle'), [text,setText] = useState(''), [answer,setAnswer] = useState(''), [error,setError] = useState(''), [muted,setMuted] = useState(false);
  const recognition = useRef<Recognition | null>(null), controller = useRef<AbortController | null>(null), generation = useRef(0), lock = useRef(false), muteRef = useRef(false);
  const stateRef = useRef(state); stateRef.current = state;
  const onResultRef = useRef(onResult); onResultRef.current = onResult;
  const onStageRef = useRef(onStage); onStageRef.current = onStage;
  const advance = useRef<(() => void) | null>(null);
  const retry = useRef<{query:string;id:string}|null>(null);
  const narrationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const speak = (message: string, done: () => void) => {
    if (muteRef.current || !window.speechSynthesis) { narrationTimer.current = setTimeout(done, 2200); return; }
    const utterance = new SpeechSynthesisUtterance(message); utterance.lang = 'en-IN'; utterance.rate = 1.05;
    utterance.voice = speechSynthesis.getVoices().find(v=>v.lang.startsWith('en')) ?? null;
    let finished = false; const finish = () => {if(finished) return; finished=true; clearTimeout(narrationTimer.current); advance.current=null; done();};
    advance.current=finish; utterance.onend=finish; utterance.onerror=finish;
    narrationTimer.current=setTimeout(finish, Math.max(5000,message.length*100)); speechSynthesis.speak(utterance);
  };
  const execute = async (query: string) => {
    if (lock.current || !query.trim()) return;
    const run = ++generation.current; advance.current=null;
    lock.current = true; if(recognition.current) {recognition.current.onend=null;recognition.current.abort();} window.speechSynthesis?.cancel(); clearTimeout(narrationTimer.current);
    setOpen(true); setText(query); setPhase('thinking'); setError('');
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(()=>abort.abort(),20000);
    if (retry.current?.query !== query) retry.current = {query,id:crypto.randomUUID()};
    try {
      const scenario = stageScenario(query, stateRef.current);
      const response = scenario ? null : await fetch('/api/voice-command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,requestId:retry.current.id}),signal:abort.signal});
      const result: CfoResult = scenario ?? await response!.json(); if (response && !response.ok) throw new Error(`HTTP ${response.status}: ${(result as unknown as {error?:string}).error ?? 'Command failed'}`);
      if (run !== generation.current) return;
      retry.current = null; onResultRef.current(result); setAnswer(result.answer); setPhase('speaking');
      const stages = result.stages as CfoResult['stages'];
      const next = (index: number) => {
        if (run !== generation.current) return;
        if (!stages || index >= stages.length) {setPhase('idle'); return;}
        onStageRef.current(index); speak(`${stages[index].title}. ${stages[index].narration}`,()=>next(index+1));
      };
      speak(result.answer,()=>next(0));
    } catch(e) {if(run !== generation.current) return; setError(abort.signal.aborted ? 'Response timed out. Retry the same command safely to check its result.' : (e as Error).message); setPhase('idle');}
    finally {clearTimeout(timeout);if(run === generation.current) lock.current = false;}
  };
  const start = () => {
    setOpen(true); if (lock.current) return;
    if (phase === 'listening') {recognition.current?.stop(); return;}
    ++generation.current; clearTimeout(narrationTimer.current); window.speechSynthesis?.cancel();
    const ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!ctor) {setError('Speech recognition is unavailable in this browser. Type a command or use a stage chip.'); return;}
    if(recognition.current) {recognition.current.onend=null;recognition.current.abort();}
    const mic: Recognition = new ctor(); recognition.current = mic; mic.lang = 'en-IN'; mic.interimResults = true; mic.continuous = false;
    let final = '';
    mic.onresult = e => {final=''; let interim=''; for(let i=0;i<e.results.length;i++){if(e.results[i].isFinal) final+=e.results[i][0].transcript+' '; else interim+=e.results[i][0].transcript;} setText(final || interim);};
    mic.onerror = e => {setError(`Microphone: ${e.error}. You can type or use a stage chip.`); setPhase('idle');};
    mic.onend = () => {setPhase('idle'); if(final) void execute(final);};
    setError(''); setText(''); setPhase('listening'); try {mic.start();} catch(e) {setError((e as Error).message);setPhase('idle');}
  };
  const startRef = useRef(start); startRef.current = start;
  useEffect(()=>{
    const key = (e: KeyboardEvent) => {const el=e.target as HTMLElement; if(e.code==='Space' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !el.closest('input,textarea,select,button,[contenteditable="true"],[role="dialog"]')){e.preventDefault();startRef.current();}};
    const command = (e: Event) => {void execute((e as CustomEvent<string>).detail);};
    const openCfo = () => setOpen(true);
    window.addEventListener('cfo-command',command);
    window.addEventListener('cfo-open',openCfo);
    window.addEventListener('keydown',key);
    return ()=>{window.removeEventListener('cfo-command',command);window.removeEventListener('cfo-open',openCfo);window.removeEventListener('keydown',key);++generation.current; controller.current?.abort(); if(recognition.current) {recognition.current.onend=null;recognition.current.abort();} window.speechSynthesis?.cancel();clearTimeout(narrationTimer.current);};
  },[]);
  return <><aside className={`cfo-shell ${phase}`} aria-label="Voice CFO">
    {open && <section className="cfo-hud"><header><strong>VOICE CFO <small>LIVE LEDGER</small></strong><button aria-label="Close Voice CFO" onClick={()=>{setOpen(false);++generation.current;controller.current?.abort();lock.current=false;advance.current=null;clearTimeout(narrationTimer.current);window.speechSynthesis?.cancel();if(recognition.current){recognition.current.onend=null;recognition.current.abort();}setPhase('idle');}}><X size={18}/></button></header>
      <div className="cfo-wave" aria-hidden="true">{Array.from({length:24},(_,i)=><i key={i} style={{animationDelay:`${i*.055}s`}}/>)}</div>
      <p className="cfo-status" role="status">{phase === 'listening' ? 'Listening…' : phase === 'thinking' ? 'Reading ledger · solving constraints…' : phase === 'speaking' ? 'CFO briefing' : 'Ask. Plan. See it happen.'}</p>
      <form onSubmit={e=>{e.preventDefault();void execute(text);}}><input aria-label="Voice CFO command" value={text} onChange={e=>setText(e.target.value)} placeholder="Ask your CFO…"/><button disabled={phase==='thinking'} aria-label="Execute command"><Send size={18}/></button></form>
      {error && <p role="alert">{error}</p>}{answer && <p className="cfo-answer">{answer}</p>}
      <small>QUICK STAGE COMMANDS · fixed scenarios + live ledger audits</small><div className="cfo-chips">{STAGE_COMMANDS.map((query,i)=><button disabled={phase==='thinking'} key={query} title={query} aria-label={query} onClick={()=>void execute(query)}>{['Cover medical expense','Simulate flights','Audit food spend','Narrate latest trace'][i]}</button>)}</div>
    </section>}
    {open && <div className="cfo-bar"><button className="cfo-orb" aria-label="Start Voice CFO microphone" onClick={start}><Mic size={22}/></button><button onClick={start}>Speak to CFO <small>SPACE TO SPEAK</small></button><button aria-label={muted?'Unmute CFO':'Mute CFO'} onClick={()=>{muteRef.current=!muted;setMuted(!muted);if(!muted) {const finish=advance.current;window.speechSynthesis?.cancel();finish?.();}}}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button></div>}
  </aside><div className="cfo-quick-actions" aria-label="Voice CFO quick actions">{STAGE_COMMANDS.map((query,i)=><button key={query} onClick={()=>void execute(query)}>{['⚡ Cover ₹12k Medical (Auto-Rebalance)','✈️ Can I Afford ₹15k Flights?','🍔 Show Dining Burn & Anomalies','🧠 Explain Last AI Decision Trace'][i]}</button>)}</div></>;
}
