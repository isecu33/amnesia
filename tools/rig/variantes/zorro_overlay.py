"""Superpone esqueleto (medidas A) sobre la malla base del zorro. uso: python zorro_overlay.py npz out.png"""
import numpy as np, sys
from PIL import Image, ImageDraw
z = np.load(sys.argv[1]); b = z["base"]
sh, el, wr, tip = (.13, .85), (.21, .73), (.26, .62), (.27, .46)
if len(sys.argv) > 3:
    import json; d = json.loads(sys.argv[3]); sh, el, wr, tip = d["sh"], d["el"], d["wr"], d["tip"]
S = 1200; x0, x1, z0, z1 = -.05, .35, .3, 1.1
W = int((x1-x0)*S/ (z1-z0)); H = S
def px(x, zz): return ((x-x0)/(x1-x0)*W, H-(zz-z0)/(z1-z0)*H)
im = Image.new("RGB", (W, H), "white"); dr = ImageDraw.Draw(im)
m = (b[:,0] > x0) & (b[:,0] < x1) & (b[:,2] > z0) & (b[:,2] < z1)
for x, y, zz in b[m]:
    X, Y = px(x, zz); dr.point((X, Y), fill=(170, 170, 200))
pts = [(0, .85), sh, el, wr, tip]
dr.line([px(*q) for q in pts], fill=(255, 0, 0), width=3)
for q in pts:
    X, Y = px(*q); dr.ellipse((X-5, Y-5, X+5, Y+5), outline=(0, 160, 0), width=3)
for zz in (.3, .4, .5, .6, .7, .8, .9, 1.0): dr.text((2, px(0, zz)[1]), f"{zz:.1f}", fill=(0, 0, 0))
im.save(sys.argv[2])
