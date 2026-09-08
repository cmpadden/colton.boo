# Ghost video bake

The capture pipeline is adapted from `../experiments-vgpu/renders/eve-slides`.
The bake runs the Ghost renderer directly with `vgpu/node` and streams
fixed-rate RGBA frames to `ffmpeg`; this avoids browser WebGPU process loss
during long captures.

Start the app in one terminal:

```sh
npm run dev
```

Then, from another terminal, render the default 10-second, 1024×1024, 60-fps
clip. The Ghost makes one slow, seamless rotation over the clip:

```sh
npm run render:ghost
```

It writes frames to `out/ghost/frames/` and the MP4 to
`out/ghost/ghost-1024x1024-60fps-10s.mp4`. `out/` is ignored by Git.

Useful options:

```sh
npm run render:ghost -- --seconds 3 --fps 30 --width 1280 --height 720
npm run render:ghost -- --no-video              # retain PNG frames only
npm run render:ghost -- --url http://127.0.0.1:3001
```

The bake requires `ffmpeg` on `PATH`.
