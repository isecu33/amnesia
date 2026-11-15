"""Deformación de la pose de reposo horneada frente a la figura base (FBX).

Uso: RIG_BAKE_DUMP=<x.npz> blender -b --python <script rig> -- <animal> <fbx> <out.glb>
     python tools/rig/rig_base_diff.py <dir con los .npz> <animal> [...]
malas(QA): aristas >x1,6 o <x0,45 con cambio >= 4 mm (mismo criterio que rig_qa.py).
"""
import numpy as np, sys, collections
for a in sys.argv[2:]:
    z = np.load(f"{sys.argv[1]}/{a}.npz"); b, k, e, dom, g = z["base"], z["baked"], z["edges"], z["dom"], z["groups"]
    L0 = np.linalg.norm(b[e[:,0]]-b[e[:,1]],axis=1); L1 = np.linalg.norm(k[e[:,0]]-k[e[:,1]],axis=1)
    ok = L0 > 1e-5; r = L1[ok]/L0[ok]; dl = np.abs(L1-L0)[ok]
    bad = ((r > 1.6) | (r < .45)) & (dl > .004)
    mild = ((r > 1.25) | (r < .75)) & (dl > .004)
    print(f"{a}: aristas {ok.sum()}  malas(QA) {bad.mean()*100:.2f}%  >25% {mild.mean()*100:.2f}%  p1/p50/p99 ratio {np.percentile(r,1):.2f}/{np.percentile(r,50):.2f}/{np.percentile(r,99):.2f}")
    ev = e[ok]; c = collections.Counter(); t = collections.Counter()
    for (i,j),m in zip(ev, mild):
        n = g[dom[i]] if dom[i]>=0 else "-"; t[n]+=1; c[n]+=m
    print("   por hueso (% aristas >25%):", ", ".join(f"{n} {c[n]/t[n]*100:.0f}%" for n,_ in c.most_common(8)))
