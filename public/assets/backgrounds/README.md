# Background videos

Drop `.mp4` or `.webm` files in this folder and list them in `manifest.json`:

```json
{
  "videos": ["tv_static.mp4", "vhs_static.mp4", "01_priority.mp4"]
}
```

Files whose name starts with `01_` are queued to play next when they appear.
The manifest is re-read every few seconds, so new entries show up without a restart.

For best results on low-end hardware, encode at 640x360 or 640x480, 24 fps,
H.264, with no audio:

```bash
ffmpeg -i input.mp4 -vf scale=640:360 -r 24 -c:v libx264 -crf 26 -pix_fmt yuv420p -movflags +faststart -an output.mp4
```

ffmpeg can also read straight from a URL, so a short cut of a large remote
file does not require downloading all of it:

```bash
ffmpeg -ss 5 -i https://example.com/big.webm -t 8 -vf scale=640:480 -r 24 -c:v libx264 -crf 30 -pix_fmt yuv420p -movflags +faststart -an cut.mp4
```

## Included placeholders

`tv_static.mp4` is an 8-second loop of a black-and-white analog CRT television
showing a noise pattern.

- Source: ["Analog TV noise.ogv"](https://commons.wikimedia.org/wiki/File:Analog_TV_noise.ogv) on Wikimedia Commons
- Author: JussiClone
- License: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- Changes: trimmed to 8 s, re-encoded to 640x480 H.264 at 24 fps, audio removed

`vhs_static.mp4` is an 8-second loop of full-frame VHS tape static.

- Source: ["FREE real VHS static.webm"](https://commons.wikimedia.org/wiki/File:FREE_real_VHS_static.webm) on Wikimedia Commons
- Author: Caleb Minear
- License: [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
- Changes: 8 s cut starting at 5 s, re-encoded to 640x480 H.264 at 24 fps, audio removed
