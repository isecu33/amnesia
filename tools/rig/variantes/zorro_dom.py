"""Vertices base coloreados por hueso dominante (y por deformacion con 'h'). uso: zorro_dom.py npz out.png x0 x1 z0 z1 [front|side] [h]"""
import numpy as np, sys, colorsys
from PIL import Image, ImageDraw
z = np.load(sys.argv[1]); b, k, e, dom, g = z["base"], z["baked"], z["edges"], z["dom"], z["groups"]
x0, x1, z0, z1 = map(float, sys.argv[3:7]); view = sys.argv[7] if len(sys.argv) > 7 else "front"; heat = len(sys.argv) > 8
S = 900; W = int((x1-x0)*S/(z1-z0)); H = S
ax = 0 if view == "front" else 1
if view == "side": ax = 1
names = [n.split(".")[0] for n in g]; uniq = sorted(set(names))
col = {n: tuple(int(255*c) for c in colorsys.hsv_to_rgb(i/len(uniq), .9, .85)) for i, n in enumerate(uniq)}
L0 = np.linalg.norm(b[e[:,0]]-b[e[:,1]],axis=1); L1 = np.linalg.norm(k[e[:,0]]-k[e[:,1]],axis=1)
rr = np.where(L0>1e-5, L1/np.maximum(L0,1e-9), 1); mild = (((rr>1.25)|(rr<.75))&(abs(L1-L0)>.004)).astype(float)
hv = np.zeros(len(b)); np.maximum.at(hv, e[:,0], mild); np.maximum.at(hv, e[:,1], mild)
im = Image.new("RGB", (W, H), "white"); dr = ImageDraw.Draw(im)
order = np.argsort(b[:, 1 if view == "front" else 0])[::-1]
for i in order:
    x, zz = b[i, ax], b[i, 2]
    if not (x0 < x < x1 and z0 < zz < z1): continue
    c = ((255, 60, 0) if hv[i] else (40, 90, 200)) if heat else (col[names[dom[i]]] if dom[i] >= 0 else (0, 0, 0))
    X, Y = (x-x0)/(x1-x0)*W, H-(zz-z0)/(z1-z0)*H
    dr.ellipse((X-1.5, Y-1.5, X+1.5, Y+1.5), fill=c)
if not heat:
    for j, n in enumerate(uniq): dr.text((5, 5+12*j), n, fill=col[n])
im.save(sys.argv[2])
