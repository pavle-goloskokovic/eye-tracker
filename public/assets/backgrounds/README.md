# Background videos

Drop `.mp4` or `.webm` files in this folder and list them in `manifest.json`:

```json
{
  "videos": ["forest.mp4", "01_priority.mp4"]
}
```

Files whose name starts with `01_` are queued to play next when they appear.
The manifest is re-read every few seconds, so new entries show up without a restart.
