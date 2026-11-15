"""Render figura base vs sentado con calor de estiramiento.
Uso: blender -b --python tools/rig/rig_base_render.py -- <x.npz> <prefijo_salida>  (genera _frente.png y _lado.png)
"""
import bpy, numpy as np, sys, math
from mathutils import Vector
npz, out = sys.argv[sys.argv.index("--")+1:][:2]
z = np.load(npz); b, k, e, f = z["base"], z["baked"], z["edges"], z["faces"]
L0 = np.linalg.norm(b[e[:,0]]-b[e[:,1]],axis=1); L1 = np.linalg.norm(k[e[:,0]]-k[e[:,1]],axis=1)
s = np.where(L0 > 1e-5, np.abs(np.log(np.maximum(L1,1e-6)/np.maximum(L0,1e-6))), 0) / math.log(1.6)
s[np.abs(L1-L0) < .004] = 0
hv = np.zeros(len(b)); np.maximum.at(hv, e[:,0], s); np.maximum.at(hv, e[:,1], s); hv = np.clip(hv,0,1)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
def obj(name, co, x):
    me = bpy.data.meshes.new(name); me.from_pydata(co.tolist(), [], f.tolist())
    a = me.color_attributes.new("h", "FLOAT_COLOR", "POINT")
    a.data.foreach_set("color", np.column_stack([hv, 0.15+0*hv, 1-hv, np.ones_like(hv)]).ravel())
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); o.location.x = x; return o
c0 = b.mean(0); c1 = k.mean(0)
o0 = obj("base", b - [c0[0], c0[1], 0], -.45); o1 = obj("horneado", k - [c1[0], c1[1], 0], .45)
sc.render.engine = "BLENDER_WORKBENCH"; sh = sc.display.shading; sh.color_type = "VERTEX"; sh.light = "STUDIO"
sc.render.resolution_x, sc.render.resolution_y = 1000, 560
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.1
for tag, loc in (("frente", (0, -5, .55)), ("lado", (5, 0, .55))):
    cam.location = loc; d = Vector((0,0,.55)) - Vector(loc); cam.rotation_euler = d.to_track_quat("-Z","Y").to_euler()
    if tag == "lado": o0.location = (0, .45, 0); o1.location = (0, -.45, 0)
    sc.render.filepath = f"{out}_{tag}.png"; bpy.ops.render.render(write_still=True)
