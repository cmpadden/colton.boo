'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createGhostRenderer, type Spawn } from '@/lib/ghost-renderer';
import styles from './page.module.css';

export default function Home() {
  const canvas=useRef<HTMLCanvasElement>(null);
  const orbit=useRef({yaw:-0.28,pitch:-0.16,zoom:1,spawns:[] as Spawn[]});
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
    if(e.metaKey||e.ctrlKey){
      const rect=e.currentTarget.getBoundingClientRect(),aspect=rect.width/rect.height;
      const extent=2/(Math.min(aspect,1)*orbit.current.zoom);
      orbit.current.spawns.push({id:performance.now(),x:((e.clientX-rect.left)/rect.width*2-1)*extent*aspect,y:(1-(e.clientY-rect.top)/rect.height*2)*extent,started:performance.now()});
      return;
    }
    pointer.current={id:e.pointerId,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e:PointerEvent<HTMLCanvasElement>){
    const p=pointer.current;if(!p||p.id!==e.pointerId)return;
    orbit.current.yaw+=(e.clientX-p.x)*.008;
    orbit.current.pitch=Math.max(-1.1,Math.min(1.1,orbit.current.pitch+(e.clientY-p.y)*.008));
    p.x=e.clientX;p.y=e.clientY;
  }
  function reset(){orbit.current.yaw=-0.28;orbit.current.pitch=-0.16;orbit.current.zoom=1;}
  function zoom(delta:number){orbit.current.zoom=Math.max(.325,Math.min(2.5,orbit.current.zoom*Math.exp(-delta*.001)));}
  return <main className={styles.page}>
    <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{pointer.current=null;}}
      onPointerCancel={()=>{pointer.current=null;}} onLostPointerCapture={()=>{pointer.current=null;}}
      tabIndex={0} aria-label="Ghost. Command or Control-click to launch a tiny ghost; drag to rotate, scroll to zoom, or use the arrow keys."
      onWheel={e=>{e.preventDefault();zoom(e.deltaY);}}
      onKeyDown={e=>{if(e.key.startsWith('Arrow')){e.preventDefault();orbit.current.yaw+=e.key==='ArrowRight'?.1:e.key==='ArrowLeft'?-.1:0;orbit.current.pitch=Math.max(-1.1,Math.min(1.1,orbit.current.pitch+(e.key==='ArrowDown'?.1:e.key==='ArrowUp'?-.1:0)));}if(e.key==='Home')reset();}} />
    {status&&<p className={styles.status} role="status">{status}</p>}
    <footer className={styles.controls}><span>⌘/Ctrl-click to launch a ghost · Drag to turn · Scroll to zoom</span><button onClick={reset}>Reset view</button></footer>
  </main>;
}
