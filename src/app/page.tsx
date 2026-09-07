'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createGhostRenderer } from '@/lib/ghost-renderer';
import styles from './page.module.css';

export default function Home() {
  const canvas=useRef<HTMLCanvasElement>(null);
  const orbit=useRef({yaw:-0.28,pitch:-0.16});
  const pointer=useRef<{id:number;x:number;y:number}|null>(null);
  const [status,setStatus]=useState('Summoning…');
  useEffect(()=>{
    const controller=new AbortController();
    const fail=(e:unknown)=>{if(!controller.signal.aborted){console.error(e);setStatus('Unable to render. Please use a browser with WebGPU enabled.');}};
    void createGhostRenderer(canvas.current!,orbit.current,controller.signal,fail)
      .then(()=>{if(!controller.signal.aborted)setStatus('');}).catch(fail);
    return ()=>controller.abort();
  },[]);
  function down(e:PointerEvent<HTMLCanvasElement>){
    if(pointer.current || e.button!==0)return;
    pointer.current={id:e.pointerId,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e:PointerEvent<HTMLCanvasElement>){
    const p=pointer.current;if(!p||p.id!==e.pointerId)return;
    orbit.current.yaw+=(e.clientX-p.x)*.008;
    orbit.current.pitch=Math.max(-1.1,Math.min(1.1,orbit.current.pitch+(e.clientY-p.y)*.008));
    p.x=e.clientX;p.y=e.clientY;
  }
  function reset(){orbit.current.yaw=-0.28;orbit.current.pitch=-0.16;}
  return <main className={styles.page}>
    <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{pointer.current=null;}}
      onPointerCancel={()=>{pointer.current=null;}} onLostPointerCapture={()=>{pointer.current=null;}}
      tabIndex={0} aria-label="Ghost. Drag to rotate, or use the arrow keys."
      onKeyDown={e=>{if(e.key.startsWith('Arrow')){e.preventDefault();orbit.current.yaw+=e.key==='ArrowRight'?.1:e.key==='ArrowLeft'?-.1:0;orbit.current.pitch=Math.max(-1.1,Math.min(1.1,orbit.current.pitch+(e.key==='ArrowDown'?.1:e.key==='ArrowUp'?-.1:0)));}if(e.key==='Home')reset();}} />
    {status&&<p className={styles.status} role="status">{status}</p>}
    <footer className={styles.controls}><span>Drag to turn</span><button onClick={reset}>Reset view</button></footer>
  </main>;
}
