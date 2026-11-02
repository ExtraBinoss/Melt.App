import numpy as np, soundfile as sf
sr, dur = 48000, 180
t = np.arange(sr*dur)/sr
# Neutral progression in D major: D - Bm - G - A, one chord per 15s chapter
chords = [[293.66,369.99,440.0],[246.94,293.66,369.99],[392.0,493.88,587.33],[440.0,554.37,659.25]]
y = np.zeros_like(t)
for i, ch in enumerate(chords*3):
    m = (t >= i*15) & (t < (i+1)*15)
    tt = t[m]-i*15
    env = np.minimum(1, tt/1.2)*np.minimum(1, (15-tt)/1.5)
    for f in ch:
        y[m] += 0.055*env*np.sin(2*np.pi*f*tt) + 0.02*env*np.sin(2*np.pi*f*2*tt)
    # soft pulse each 2s
    for b in range(0, 15, 2):
        s = int((i*15+b)*sr); e = min(len(y), s+int(0.09*sr))
        y[s:e] += 0.10*np.sin(2*np.pi*180*np.arange(e-s)/sr)*np.exp(-np.arange(e-s)/(0.03*sr))
# UI clicks at chapter cuts + title landings
rng = np.random.default_rng(7)
for cut in range(12):
    for off, f0, a in [(cut*15+0.0, 2400, 0.12), (cut*15+0.65, 3200, 0.07)]:
        s = int(off*sr); n = int(0.03*sr); e = min(len(y), s+n)
        y[s:e] += a*np.sin(2*np.pi*f0*np.arange(e-s)/sr)*np.exp(-np.arange(e-s)/(0.008*sr))
y = y/np.max(np.abs(y))*0.79  # peak ~ -2 dBFS
sf.write("public/audio/soundtrack.wav", y, sr)
print("written", len(y)/sr, "s")
