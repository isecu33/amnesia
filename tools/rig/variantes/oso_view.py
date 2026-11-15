"""Render de diagnóstico del oso: oso_view.py -- <x.npz> <clave base|baked> <salida.png> <azimut_deg> <zoom_cx,cz,escala> [wire]"""
import bpy, numpy as np, sys, math
from mathutils import Vector
npz, key, out, az, zoom = sys.argv[sys.argv.index("--")+1:][:5]
z = np.load(npz); f = z["faces"]; co = z[key] if key != "heat" else z["baked"]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
import math as _m
if key == "heat":
    b, k, e = z["base"], z["baked"], z["edges"]; co = k
    L0 = np.linalg.norm(b[e[:,0]]-b[e[:,1]],axis=1); L1 = np.linalg.norm(k[e[:,0]]-k[e[:,1]],axis=1)
    sv = np.where(L0 > 1e-5, np.abs(np.log(np.maximum(L1,1e-6)/np.maximum(L0,1e-6))), 0) / _m.log(1.6); sv[np.abs(L1-L0) < .004] = 0
    hv = np.zeros(len(b)); np.maximum.at(hv, e[:,0], sv); np.maximum.at(hv, e[:,1], sv); hv = np.clip(hv,0,1)
me = bpy.data.meshes.new("m"); me.from_pydata(co.tolist(), [], f.tolist())
if key == "heat":
    a_ = me.color_attributes.new("h", "FLOAT_COLOR", "POINT")
    a_.data.foreach_set("color", np.column_stack([hv, 0.15+0*hv, 1-hv, np.ones_like(hv)]).ravel())
o = bpy.data.objects.new("m", me); sc.collection.objects.link(o)
sc.render.engine = "BLENDER_WORKBENCH"; sh = sc.display.shading; sh.color_type = "VERTEX" if key == "heat" else "SINGLE"; sh.light = "STUDIO"; sh.show_cavity = False
sh.single_color = (.8, .8, .75)
sc.render.resolution_x = sc.render.resolution_y = 800
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"
cx, cz, es = [float(v) for v in zoom.split(",")]
cam.data.ortho_scale = es
a = math.radians(float(az))
d = Vector((math.sin(a), -math.cos(a), 0))   # az=0 -> desde delante (-Y); 90 -> desde +X
cy = float(co[:, 1].mean())
cam.location = Vector((cx, cy, cz)) + d * 5
cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
