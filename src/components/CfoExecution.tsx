import { motion } from 'motion/react';
import type { CfoResult } from '../../shared/voiceCfo.ts';
import { inr } from '../../shared/planning.ts';
export function CfoBudgetBar({spent,limit,before,commandId}:{spent:number;limit:number;before?:number;commandId?:string}) {
 return <motion.span key={commandId} initial={before === undefined ? false : {width:`${Math.min(100,before>0?spent/before*100:100)}%`}} animate={{width:`${Math.min(100,spent/limit*100)}%`}} transition={{duration:1.5,ease:'easeInOut'}} />;
}
export function CfoExecution({result,stage=-1,onClear,onCommand}: {result: CfoResult;stage?:number;onClear:()=>void;onCommand?:(q:string)=>void}) {
 return <section className="cfo-execution" aria-live="polite"><button className="cfo-dismiss" onClick={onClear}>Dismiss</button><small>VOICE CFO · {result.kind.toUpperCase()}</small><h2>{result.kind==='rebalance' ? result.shortfall ? 'Coverage needs more surplus' : '⚡ Voice CFO Autonomous Rebalance Executed' : result.kind==='simulation' ? `Simulating ${inr(result.amount!)} Impact` : result.kind==='audit' ? `Voice Audit · ${result.ledgerFilter?.label}` : result.kind==='trace' ? 'Live agent walkthrough' : 'Executive briefing'}</h2><p>{result.answer}</p>
 {result.rebalanceActions.length>0 && <div className="cfo-deltas">{result.rebalanceActions.map(a=><article key={a.category}><strong>{a.name}</strong><span>{inr(a.before)} → {inr(a.after)}</span><b>{a.amount>0?'+':'−'}{inr(Math.abs(a.amount))}</b></article>)}</div>}
 {result.goalSimulation && <div className="cfo-deltas"><article><strong>{result.goalSimulation.goalName}</strong><span>{result.goalSimulation.delayDays===null?'Timeline unavailable':`+${result.goalSimulation.delayDays} days estimated delay`}</span></article><article><strong>Surplus offset scenario</strong><span>{inr(result.goalSimulation.neutralizable)} · {result.goalSimulation.remainingDelay===null?'timeline unavailable':`${result.goalSimulation.remainingDelay} days remaining delay`}</span></article>{result.goalSimulation.neutralizable>0 && onCommand && <button onClick={()=>onCommand(`Reallocate ${result.goalSimulation!.neutralizable} rupees to travel without touching my Emergency Fund`)}>Reserve {inr(result.goalSimulation.neutralizable)} from surplus</button>}</div>}
 {result.stages && <ol className="cfo-stages">{result.stages.map((s,i)=><li className={stage===i?'active':''} key={i}><strong>{i+1}. {s.title}</strong><p>{s.narration}</p></li>)}</ol>}
 </section>;
}
