'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createGhostRenderer, type Spawn } from '@/lib/ghost-renderer';
import styles from './page.module.css';

export default function Home() {
  const canvas=useRef<HTMLCanvasElement>(null);
  const orbit=useRef({yaw:-0.28,pitch:-0.16,zoom:1,spawns:[] as Spawn[]});
  const pointer=useRef<{id:number;x:number;y:number;startX:number;startY:number;moved:boolean}|null>(null);
  const lastTap=useRef<{time:number;x:number;y:number}|null>(null);
  const [status,setStatus]=useState('Summoning…');
  const [launchMode,setLaunchMode]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    const fail=(e:unknown)=>{if(!controller.signal.aborted){console.error(e);setStatus('Unable to render. Please use a browser with WebGPU enabled.');}};
    void createGhostRenderer(canvas.current!,orbit.current,controller.signal,fail)
      .then(()=>{if(!controller.signal.aborted)setStatus('');}).catch(fail);
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    const update=(e:KeyboardEvent)=>setLaunchMode(e.metaKey||e.ctrlKey);
    const clear=()=>setLaunchMode(false);
    addEventListener('keydown',update);addEventListener('keyup',update);addEventListener('blur',clear);
    return ()=>{removeEventListener('keydown',update);removeEventListener('keyup',update);removeEventListener('blur',clear);};
  },[]);
  function launch(e:PointerEvent<HTMLCanvasElement>){
    const rect=e.currentTarget.getBoundingClientRect(),aspect=rect.width/rect.height;
    const extent=2/(Math.min(aspect,1)*orbit.current.zoom);
    (orbit.current.spawns??=[]).push({id:performance.now(),x:((e.clientX-rect.left)/rect.width*2-1)*extent*aspect,y:(1-(e.clientY-rect.top)/rect.height*2)*extent,started:performance.now()});
  }
  function down(e:PointerEvent<HTMLCanvasElement>){
    if(pointer.current || e.button!==0)return;
    if(e.metaKey||e.ctrlKey){e.preventDefault();launch(e);return;}
    pointer.current={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);
  }
  function up(e:PointerEvent<HTMLCanvasElement>){
    const p=pointer.current;if(!p||p.id!==e.pointerId)return;
    pointer.current=null;
    if(e.pointerType!=='touch'||p.moved)return;
    const time=performance.now(),previous=lastTap.current;
    if(previous&&time-previous.time<320&&Math.hypot(e.clientX-previous.x,e.clientY-previous.y)<32){launch(e);lastTap.current=null;}
    else lastTap.current={time,x:e.clientX,y:e.clientY};
  }
  function move(e:PointerEvent<HTMLCanvasElement>){
    const p=pointer.current;if(!p||p.id!==e.pointerId)return;
    orbit.current.yaw+=(e.clientX-p.x)*.008;
    orbit.current.pitch=Math.max(-1.1,Math.min(1.1,orbit.current.pitch+(e.clientY-p.y)*.008));
    if(Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>8)p.moved=true;
    p.x=e.clientX;p.y=e.clientY;
  }
  function reset(){orbit.current.yaw=-0.28;orbit.current.pitch=-0.16;orbit.current.zoom=1;}
  function zoom(delta:number){orbit.current.zoom=Math.max(.325,Math.min(2.5,orbit.current.zoom*Math.exp(-delta*.001)));}
  return <main className={styles.page}>
    <canvas className={launchMode?styles.launchMode:undefined} ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onContextMenu={e=>e.preventDefault()}
      onPointerCancel={()=>{pointer.current=null;}} onLostPointerCapture={()=>{pointer.current=null;}}
      tabIndex={0} aria-label="Ghost. Command-click or double-tap to launch a tiny ghost; drag to rotate, scroll to zoom, or use the arrow keys."
      onWheel={e=>{e.preventDefault();zoom(e.deltaY);}}
      onKeyDown={e=>{if(e.key.startsWith('Arrow')){e.preventDefault();orbit.current.yaw+=e.key==='ArrowRight'?.1:e.key==='ArrowLeft'?-.1:0;orbit.current.pitch=Math.max(-1.1,Math.min(1.1,orbit.current.pitch+(e.key==='ArrowDown'?.1:e.key==='ArrowUp'?-.1:0)));}if(e.key==='Home')reset();}} />
    {status&&<p className={styles.status} role="status">{status}</p>}
    <footer className={styles.controls}>⌘-click or double-tap · Drag to turn · Scroll to zoom</footer>
  </main>;
}
