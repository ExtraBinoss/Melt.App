# Melt — promotional film (3 min)

Remotion 4 film presenting Melt. Real material only: homepage and dashboard
captures from the running app, the brand mascot (`public/melt.svg`), and the
retained `Melt Mascot` export. Angel.exe and Cornell Box exports are excluded.

- Spec: 1920×1080, 30 fps, 180 s, 12 chapters of 15 s.
- Sound: code-generated neutral score + UI clicks (`gen_audio.py` documents the
  recipe; the rendered WAV is produced by the Node generator used at build time).
- Render: `bunx remotion render src/index.ts Film out/film-muted.mp4 --muted`
  then mux `public/audio/soundtrack.wav` with ffmpeg.
- Deliverable: `out/melt-promo-3min.mp4`, poster `out/poster.png`.
