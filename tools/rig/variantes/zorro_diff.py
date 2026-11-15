"""Deformacion por region del zorro (horneado vs base). uso: python zorro_diff.py <npz>"""
import numpy as np, sys
z = np.load(sys.argv[1]); b, k, e, dom, g = z["base"], z["baked"], z["edges"], z["dom"], z["groups"]
L0 = np.linalg.norm(b[e[:,0]]-b[e[:,1]],axis=1); L1 = np.linalg.norm(k[e[:,0]]-k[e[:,1]],axis=1)
ok = L0 > 1e-5; r = np.where(ok, L1/np.maximum(L0,1e-9), 1); dl = np.abs(L1-L0)
bad = ((r>1.6)|(r<.45))&(dl>.004)&ok; mild = ((r>1.25)|(r<.75))&(dl>.004)&ok
mid = (b[e[:,0]]+b[e[:,1]])/2
reg = {"brazos": (np.abs(mid[:,0])>.14)&(mid[:,2]>.42)&(mid[:,2]<.9),
       "torso": (np.abs(mid[:,0])<=.14)&(mid[:,2]>.57)&(mid[:,2]<.92)&(mid[:,1]<.2),
       "cabeza": mid[:,2]>=.92,
       "falda/piernas": (mid[:,2]<=.57)&(mid[:,1]<.15),
       "cola": (mid[:,1]>=.15)&(mid[:,2]<.8),
       "manos": (np.abs(mid[:,0])>.14)&(mid[:,2]<=.42)&(mid[:,2]>.3)}
tot = ok.sum()
print(f"TOTAL malas(QA) {bad[ok].mean()*100:.2f}%  >25% {mild[ok].mean()*100:.2f}%  p99 {np.percentile(r[ok],99):.2f}")
for n, m in reg.items():
    m = m & ok
    print(f"  {n:14s} aristas {m.sum():6d}  >25% {mild[m].mean()*100 if m.sum() else 0:5.1f}%  QA {bad[m].mean()*100 if m.sum() else 0:5.1f}%")
import collections
c = collections.Counter(); t = collections.Counter()
for (i,j),m in zip(e[ok], mild[ok]):
    n = g[dom[i]].split(".")[0] if dom[i]>=0 else "-"; t[n]+=1; c[n]+=m
print("  por hueso:", ", ".join(f"{n} {c[n]/t[n]*100:.0f}%({t[n]})" for n,_ in c.most_common(12)))
