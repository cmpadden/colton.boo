import { init, surface, target, geometry, draw, effect, frameLoop } from 'vgpu';

export type Spawn = { id: number; x: number; y: number; started: number };
export type Orbit = { yaw: number; pitch: number; zoom: number; spawns: Spawn[] }; 
type Accessor = { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string };
type Glb = {
  accessors: Accessor[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
  nodes: { name?: string; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[];
  meshes: { primitives: { attributes: { POSITION: number; NORMAL: number }; indices: number; material: number }[] }[];
  materials: { pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
};

// Deliberately scoped to this uncompressed Blender export, not a general glTF loader.
function readGhost(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  if (view.getUint32(0,true) !== 0x46546c67 || view.getUint32(4,true) !== 2) throw new Error('Invalid ghost GLB');
  const jsonLength = view.getUint32(12,true);
  const glb: Glb = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,jsonLength)));
  const bin = 28 + jsonLength;
  function values(id: number) {
    const a = glb.accessors[id], b = glb.bufferViews[a.bufferView];
    const width = a.type === 'VEC3' ? 3 : 1;
    const size = a.componentType === 5123 ? 2 : 4;
    if (![5123,5125,5126].includes(a.componentType)) throw new Error('Unsupported mesh accessor');
    const result = new Float32Array(a.count * width);
    for (let i=0;i<a.count;i++) for (let c=0;c<width;c++) {
      const offset=bin+(b.byteOffset??0)+(a.byteOffset??0)+i*(b.byteStride??width*size)+c*size;
      result[i*width+c]=a.componentType===5126?view.getFloat32(offset,true):size===2?view.getUint16(offset,true):view.getUint32(offset,true);
    }
    return result;
  }
  return glb.nodes.flatMap(node => {
    if (node.mesh === undefined) return [];
    if (node.rotation || node.matrix) throw new Error('Unsupported ghost node transform');
    return glb.meshes[node.mesh].primitives.map(p => {
      const positions=values(p.attributes.POSITION), normals=values(p.attributes.NORMAL);
      const shift=node.translation??[0,0,0]; const scale=node.scale??[1,1,1];
      for(let i=0;i<positions.length;i+=3) {
        positions[i]=positions[i]*scale[0]+shift[0]; positions[i+1]=positions[i+1]*scale[1]+shift[1]-1.08; positions[i+2]=positions[i+2]*scale[2]+shift[2];
      }
      return { positions, normals, indices: new Uint32Array(values(p.indices)),
        color: (glb.materials[p.material].pbrMetallicRoughness?.baseColorFactor??[1,1,1]).slice(0,3),
        eye: (node.name??'').startsWith('Eye inner circle') };
    });
  });
}

const meshShader = `
struct Params { yaw:f32, pitch:f32, zoom:f32, aspect:f32, time:f32, offset:vec3f, spin:f32, scale:f32, fade:f32, color:vec3f }
@group(0) @binding(0) var<uniform> u:Params;
struct Out { @builtin(position) clip:vec4f, @location(0) world:vec3f, @location(1) normal:vec3f }
fn rotate(p:vec3f)->vec3f {
  let q=vec3f(cos(u.yaw)*p.x+sin(u.yaw)*p.z,p.y,-sin(u.yaw)*p.x+cos(u.yaw)*p.z);
  return vec3f(q.x,cos(u.pitch)*q.y-sin(u.pitch)*q.z,sin(u.pitch)*q.y+cos(u.pitch)*q.z);
}
fn spin(p:vec3f)->vec3f {
  return vec3f(cos(u.spin)*p.x+sin(u.spin)*p.z,p.y,-sin(u.spin)*p.x+cos(u.spin)*p.z);
}
@vertex fn vs(@location(0) position:vec3f,@location(1) normal:vec3f)->Out {
  var o:Out; let p=rotate(spin(position)*u.scale)+u.offset+vec3f(0,sin(u.time*.8)*.035,0);
  let extent=2.0/(min(u.aspect,1.0)*u.zoom);
  o.clip=vec4f(p.x/(extent*u.aspect),p.y/extent,(5.0-p.z)/10.0,1);
  o.world=p; o.normal=rotate(spin(normal)); return o;
}
fn noise(p:vec3f)->f32 { return fract(sin(dot(p,vec3f(12.9898,78.233,37.719)))*43758.5453); }
@fragment fn fs(v:Out,@builtin(front_facing) front:bool)->@location(0) vec4f {
  // Dithered discard makes departing ghosts dissolve instead of popping out.
  if(u.fade<noise(floor(v.world*36.0))) { discard; }
  if(u.color.x<.01){
    let pulse=.38+.10*sin(u.time*1.7)+.035*sin(u.time*4.3);
    let glow=vec3f(.16,.002,.004)*pulse+vec3f(.055,.001,.002)*pulse;
    return vec4f(glow,1);
  }
  let n=normalize(select(-v.normal,v.normal,front));
  let key=normalize(vec3f(-2,3,2)-v.world);
  let rim=normalize(vec3f(2,1,-2)-v.world);
  let red=normalize(vec3f(-3,-1,.3)-v.world);
  let light=vec3f(.022,.026,.046)+vec3f(.30,.57,.76)*max(dot(n,key),0.0)*.85
    +vec3f(.43,.14,.8)*max(dot(n,rim),0.0)*.85
    +vec3f(.32,.025,.04)*max(dot(n,red),0.0)*.5;
  let sheen=pow(1.0-abs(n.z),3.0)*vec3f(.075,.055,.13);
  let c=(light+sheen)*u.color;
  return vec4f(pow(c,vec3f(1.0/2.2)),1);
}`;

const compositeShader=`
@group(0) @binding(0) var scene:texture_2d<f32>;
@group(0) @binding(1) var<uniform> aspect:f32;
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f {
  let size=vec2f(textureDimensions(scene)); let uv=p.xy/size;
  let q=(uv-.5)*vec2f(aspect,1);
  let halo=exp(-dot(q*vec2f(1.5,1.1),q*vec2f(1.5,1.1))*7.0);
  var bg=vec3f(.008,.009,.02)+vec3f(.045,.027,.085)*halo;
  let floor=exp(-pow(q.x*3.0,2.0)-pow((q.y-.31)*18.0,2.0));
  bg+=vec3f(.035,.018,.062)*floor;
  let pixel=textureLoad(scene,vec2i(p.xy),0);
  return vec4f(mix(bg,pixel.rgb,pixel.a),1);
}`;

export async function createGhostRenderer(canvas:HTMLCanvasElement, orbit:Orbit, signal:AbortSignal, onError:(e:unknown)=>void) {
  const response=await fetch('/models/ghost.glb',{signal});
  if(!response.ok) throw new Error('Could not load the ghost model');
  const parts=readGhost(await response.arrayBuffer());
  if(signal.aborted) return;
  const gpu=await init();
  if(signal.aborted){gpu.dispose();return;}
  signal.addEventListener('abort',()=>gpu.dispose(),{once:true});
  try {
    gpu.onError(onError);
    const screen=surface(gpu,canvas,{dpr:[1,2]});
    const scene=target(gpu,{size:[1,1],depth:true,msaa:4,format:'rgba8unorm',clearColor:[0,0,0,0]});
    const meshes=[...parts].sort((a,b)=>Number(a.eye)-Number(b.eye)).map(p=>draw(gpu,{shader:meshShader,depth:p.eye?false:undefined,geometry:geometry(gpu,{
      buffers:[{attributes:{position:'float32x3'},data:p.positions},{attributes:{normal:'float32x3'},data:p.normals}],indices:p.indices,
    }),set:{u:{yaw:0,pitch:0,zoom:1,aspect:1,time:0,offset:[0,0,0],spin:0,scale:1,fade:1,color:p.color}}}));
    const makeMeshes=()=>[...parts].sort((a,b)=>Number(a.eye)-Number(b.eye)).map(p=>draw(gpu,{shader:meshShader,depth:p.eye?false:undefined,geometry:geometry(gpu,{
      buffers:[{attributes:{position:'float32x3'},data:p.positions},{attributes:{normal:'float32x3'},data:p.normals}],indices:p.indices,
    }),set:{u:{yaw:0,pitch:0,zoom:1,aspect:1,time:0,offset:[0,0,0],spin:0,scale:.34,fade:1,color:p.color}}}));
    const spawned: { id:number; started:number; x:number; y:number; meshes:ReturnType<typeof makeMeshes> }[]=[];
    const composite=effect(gpu,compositeShader);
    const started=performance.now();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    frameLoop(gpu,frame=>{
      try {
        const [w,h]=screen.size;
        if(scene.size[0]!==w||scene.size[1]!==h) scene.resize([w,h]);
        const aspect=w/h;
        const time=reduced?0:(performance.now()-started)/1000;
        meshes.forEach(m=>m.set({yaw:orbit.yaw,pitch:orbit.pitch,zoom:orbit.zoom,aspect,time,offset:[0,0,0],spin:0,scale:1,fade:1}));
        const now=performance.now();
        orbit.spawns=(orbit.spawns??[]).filter(spawn=>now-spawn.started<2500);
        for(const spawn of orbit.spawns) if(!spawned.some(s=>s.id===spawn.id)) spawned.push({...spawn,meshes:makeMeshes()});
        const active=spawned.filter(spawn=>now-spawn.started<2500);
        spawned.splice(0,spawned.length,...active);
        for(const spawn of spawned) {
          const age=(now-spawn.started)/1000;
          const variation=((Math.sin(spawn.id*12.9898)*43758.5453)%1+1)%1;
          const progress=Math.min(1,age/2.5), flight=progress*progress;
          // Ease in, then accelerate away; each ghost gets its own arc and spin.
          const offset:[number,number,number]=[spawn.x+(variation-.5)*1.1*flight+Math.sin(age*(4+variation*4))*.08*flight,spawn.y+(2.9+variation*1.1)*flight,.9];
          spawn.meshes.forEach(m=>m.set({yaw:orbit.yaw,pitch:orbit.pitch,zoom:orbit.zoom,aspect,time,offset,spin:age*(8+variation*9),scale:.34,fade:Math.max(0,Math.min(1,(2.5-age)/.7))}));
        }
        frame.pass(scene,pass=>{meshes.forEach(m=>pass.draw(m));spawned.forEach(spawn=>spawn.meshes.forEach(m=>pass.draw(m)));});
        composite.set({scene:scene.color,aspect});frame.pass(screen,composite);
      } catch(e) { onError(e); throw e; }
    });
  } catch(e) {gpu.dispose();throw e;}
}
