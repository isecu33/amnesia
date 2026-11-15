"""QA de deformación y movimiento de un rig de TÓTEM (Blender headless).

Uso:
  blender -b --python tools/rig/rig_qa.py -- <in.glb> <informe.json> [dir_renders]

Evalúa la malla deformada fotograma a fotograma en todas las animaciones y mide:
  malla (estático): aristas no-manifold, caras degeneradas, vértices coincidentes sin
    soldar (costuras que se abren), islas sueltas, pesos (sin peso, >4 influencias).
  deformación: estiramiento/compresión de aristas, pliegues (cambio de ángulo diedro),
    colapso/inversión de caras, costuras que se separan e islas que se despegan.
  movimiento: velocidad y aceleración angular por hueso (tirones), rotación máxima
    respecto al reposo y congelados totales (sin "moving hold").
Con dir_renders genera vistas texturizadas y un mapa de calor (rojo = distorsión).
Sale con código 1 si algún umbral FAIL se supera.
"""
import bpy, sys, os, json, math
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

# Umbrales (FAIL bloquea; WARN se revisa a ojo en los renders).
STRETCH_FAIL, STRETCH_WARN = 1.60, 1.30       # longitud/longitud en reposo
COMPRESS_FAIL, COMPRESS_WARN = 0.45, 0.65
FOLD_FAIL_DEG, FOLD_WARN_DEG = 110.0, 70.0    # aumento del ángulo diedro (pliegue)
AREA_COLLAPSE = 0.15                          # área/área en reposo
SEAM_TOL = 1e-4                               # m: vértices "coincidentes" sin soldar
SEAM_OPEN_FAIL, SEAM_OPEN_WARN = 0.010, 0.004 # m: cuánto se abre una costura
ISLAND_GAP_FAIL = 0.03                        # m: cuánto se despega una isla del cuerpo
MAX_INFLUENCES = 4
BAD_EDGE_FRACTION_FAIL = 0.002                # fracción de aristas fuera de [COMPRESS_FAIL, STRETCH_FAIL]
MIN_ABS_CHANGE = 0.004                        # m: por debajo, el cambio de una arista no se ve (pelo, micro-aristas)
FOLD_MIN_EDGE, FOLD_MIN_AREA = 0.004, 2e-5    # m, m²: el diedro solo cuenta en aristas/caras visibles (no astillas)
FOLD_FRACTION_FAIL = 0.001                    # fracción de aristas con pliegue > FOLD_FAIL_DEG
TEAR_FAIL = 0.03                              # m: una arista que crece esto se ve como desgarro
FLOOR_FAIL = 0.03                             # m: la malla baja del suelo (z=0 del GLB) más que esto
# Una arista suelta fuera de rango (STRETCH_*/COMPRESS_*) es WARN: se juzga a ojo en el mapa de calor.
ANG_SPEED_WARN = 720.0                        # grados/s de un hueso
ANG_ACCEL_FAIL, ANG_ACCEL_WARN = 60000.0, 25000.0  # grados/s² (tirón)
REST_ROT_WARN = 150.0                         # grados respecto al reposo
FROZEN_FAIL_S = 0.6                           # s seguidos sin ningún movimiento (dentro de una animación > 1 s)
FROZEN_EPS_DEG = 0.05

args = sys.argv[sys.argv.index("--") + 1:]
glb, out_json = args[:2]
rdir = args[2] if len(args) > 2 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
mesh = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
me = mesh.data
fps = sc.render.fps / sc.render.fps_base
ad = arm.animation_data or arm.animation_data_create()
ad.use_nla = False
for t in ad.nla_tracks: t.mute = True

V, E = len(me.vertices), len(me.edges)
edges = np.empty(E * 2, np.int64); me.edges.foreach_get("vertices", edges); edges = edges.reshape(-1, 2)
P = len(me.polygons)
lstart = np.empty(P, np.int64); me.polygons.foreach_get("loop_start", lstart)
ltot = np.empty(P, np.int64); me.polygons.foreach_get("loop_total", ltot)
ledge = np.empty(len(me.loops), np.int64); me.loops.foreach_get("edge_index", ledge)
lvert = np.empty(len(me.loops), np.int64); me.loops.foreach_get("vertex_index", lvert)
loop_poly = np.repeat(np.arange(P), ltot)
# Adyacencia arista→caras: aristas con exactamente 2 caras (diedro) y >2 (no-manifold).
order = np.argsort(ledge, kind="stable"); se, sp = ledge[order], loop_poly[order]
cnt = np.bincount(ledge, minlength=E)
first = np.searchsorted(se, np.arange(E))
man = np.where(cnt == 2)[0]
dpair = np.stack([sp[first[man]], sp[first[man] + 1]], 1)
nonmanifold = int((cnt > 2).sum())
# Triángulos para áreas (abanico de cada polígono).
tl = []
for k in range(1, int(ltot.max()) - 1):
    sel = np.where(ltot > k + 1)[0]
    tl.append(np.stack([lvert[lstart[sel]], lvert[lstart[sel] + k], lvert[lstart[sel] + k + 1]], 1))
tris = np.concatenate(tl)

def coords():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg); m = ev.to_mesh()
    c = np.empty(V * 3); m.vertices.foreach_get("co", c)
    n = np.empty(P * 3); m.polygons.foreach_get("normal", n)
    ev.to_mesh_clear()
    M = np.array(mesh.matrix_world); R = M[:3, :3]
    c = c.reshape(-1, 3) @ R.T + M[:3, 3]
    n = n.reshape(-1, 3) @ R.T; n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    return c, n

def tri_area(c):
    a, b, d = c[tris[:, 0]], c[tris[:, 1]], c[tris[:, 2]]
    cr = np.cross(b - a, d - a); return np.linalg.norm(cr, axis=1) * .5, cr

def dihedral(n):
    return np.degrees(np.arccos(np.clip((n[dpair[:, 0]] * n[dpair[:, 1]]).sum(1), -1, 1)))

arm.data.pose_position = "REST"; bpy.context.view_layer.update()
c0, n0 = coords()
arm.data.pose_position = "POSE"
L0 = np.linalg.norm(c0[edges[:, 0]] - c0[edges[:, 1]], axis=1)
okE = L0 > 1e-6
A0, cr0 = tri_area(c0); okT = A0 > 1e-10
D0 = dihedral(n0)
parea = np.empty(P); me.polygons.foreach_get("area", parea); parea *= mesh.matrix_world.to_scale()[0] ** 2
okD = (L0[man] > FOLD_MIN_EDGE) & (parea[dpair[:, 0]] > FOLD_MIN_AREA) & (parea[dpair[:, 1]] > FOLD_MIN_AREA)
H =float(c0[:, 2].max() - c0[:, 2].min())

kd = KDTree(V)
for i, co in enumerate(c0): kd.insert(co, i)
kd.balance()
seams = []        # vértices coincidentes sin soldar (el exportador glTF parte la malla en cada costura de UV)
for i in range(V):
    for _, j, d in kd.find_range(c0[i], SEAM_TOL):
        if j > i: seams.append((i, j))
seams = np.array(seams, np.int64).reshape(-1, 2)

# Islas (union-find sobre aristas y costuras): piezas realmente separadas de la malla.
parent = np.arange(V)
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
for a, b in np.concatenate([edges, seams]):
    ra, rb = find(a), find(b)
    if ra != rb: parent[ra] = rb
island = np.array([find(i) for i in range(V)])
ids, island, isize = np.unique(island, return_inverse=True, return_counts=True)
main_isl = int(isize.argmax())
# Cada isla pequeña: par (vértice de la isla, vértice más cercano de otra isla) para medir si se despega.
anchors = []
for k in range(len(ids)):
    if k == main_isl: continue
    vs = np.where(island == k)[0]
    best = None
    for v in vs[:: max(1, len(vs) // 40)]:
        for co, j, d in kd.find_n(c0[v], 12):
            if island[j] != k and (best is None or d < best[2]): best = (v, j, d)
    if best and best[2] < .05: anchors.append(best[:2])
anchors = np.array(anchors, np.int64).reshape(-1, 2)

# Pesos.
gname = {g.index: g.name for g in mesh.vertex_groups}
deform = {b.name for b in arm.data.bones if b.use_deform}
ninf = np.zeros(V, np.int64); wsum = np.zeros(V); dom = np.empty(V, object)
for v in me.vertices:
    gs = [g for g in v.groups if g.weight > 1e-4 and gname.get(g.group) in deform]
    ninf[v.index] = len(gs); wsum[v.index] = sum(g.weight for g in gs)
    dom[v.index] = gname[max(gs, key=lambda g: g.weight).group] if gs else "-"

static = dict(
    vertices=V, edges=E, faces=P, islands=int(len(ids)), main_island_vertices=int(isize[main_isl]),
    nonmanifold_edges=nonmanifold, degenerate_tris=int((~okT).sum()),
    unwelded_seam_pairs=int(len(seams)), unweighted_vertices=int((ninf == 0).sum()),
    over_influence_vertices=int((ninf > MAX_INFLUENCES).sum()), max_influences=int(ninf.max()),
    unnormalized_vertices=int((np.abs(wsum - 1) > .02).sum()),
)

def bone_state():
    return {b.name: (arm.matrix_world @ b.matrix).to_quaternion() for b in arm.pose.bones}

def set_frame(f):
    sc.frame_set(int(f)); bpy.context.view_layer.update()

actions = [a for a in bpy.data.actions if any(fc.data_path.startswith("pose.bones") for fc in a.fcurves)]
report = dict(file=os.path.basename(glb), height_m=round(H, 3), fps=fps, static=static, actions={}, issues=[])
heats, worst_frames = {}, {}
for act in actions:
    ad.action = act
    f0, f1 = (int(x) for x in act.frame_range)
    set_frame(f0); set_frame(f0)  # la primera evaluación tras cambiar de acción llega con la pose anterior
    heat = np.zeros(V); m = dict(min_z=float(c0[:, 2].min()), min_z_bone=str(dom[int(c0[:, 2].argmin())]), stretch=1.0, compress=1.0, fold=0.0, fold_frac=0.0, collapse=1.0, max_growth_cm=0.0, bad_edge_frac=0.0,
                                  seam_open=0.0, island_gap=0.0, worst_frame=f0, worst_score=0.0)
    prev, prev_w, frozen, frozen_max = None, None, 0, 0
    ang = dict(speed=0.0, speed_bone="", accel=0.0, accel_bone="", accel_frame=f0, rest_rot=0.0, rest_bone="")
    for f in range(f0, f1 + 1):
        set_frame(f)
        c, n = coords()
        L = np.linalg.norm(c[edges[:, 0]] - c[edges[:, 1]], axis=1)
        vis = np.abs(L - L0) > MIN_ABS_CHANGE        # solo cuentan cambios que se ven
        r = np.ones(E); r[okE & vis] = L[okE & vis] / L0[okE & vis]
        A, _ = tri_area(c); ar = np.ones(len(tris)); okA = A0 > FOLD_MIN_AREA; ar[okA] = A[okA] / A0[okA]
        fold = np.where(okD, np.clip(dihedral(n) - D0, 0, None), 0.0)
        bad = (r > STRETCH_FAIL) | (r < COMPRESS_FAIL)
        sopen = np.linalg.norm(c[seams[:, 0]] - c[seams[:, 1]], axis=1).max() if len(seams) else 0.0
        if len(anchors):
            g = np.linalg.norm(c[anchors[:, 0]] - c[anchors[:, 1]], axis=1) - np.linalg.norm(c0[anchors[:, 0]] - c0[anchors[:, 1]], axis=1)
            igap = float(g.max())
        else: igap = 0.0
        # Mapa de calor por vértice: 0 = bien, 1 = umbral FAIL.
        ev = np.maximum((r - 1) / (STRETCH_FAIL - 1), (1 - r) / (1 - COMPRESS_FAIL)).clip(0, None)
        h = np.zeros(V); np.maximum.at(h, edges[:, 0], ev); np.maximum.at(h, edges[:, 1], ev)
        fv = fold / FOLD_FAIL_DEG
        np.maximum.at(h, edges[man, 0], fv); np.maximum.at(h, edges[man, 1], fv)
        heat = np.maximum(heat, h)
        score = float(h.max()) + float(bad.mean()) * 100
        m["stretch"] = max(m["stretch"], float(r.max())); m["compress"] = min(m["compress"], float(r.min()))
        m["fold"] = max(m["fold"], float(fold.max()) if len(fold) else 0.0)
        m["fold_frac"] = max(m["fold_frac"], float((fold > FOLD_FAIL_DEG).sum() / max(okD.sum(), 1)))
        m["collapse"] = min(m["collapse"], float(ar.min()))
        m["max_growth_cm"] = max(m["max_growth_cm"], float((L - L0).max()) * 100)
        if float(c[:, 2].min()) < m["min_z"]:
            m["min_z"], m["min_z_bone"] = float(c[:, 2].min()), str(dom[int(c[:, 2].argmin())])
        m["bad_edge_frac"] = max(m["bad_edge_frac"], float(bad.mean()))
        m["seam_open"] = max(m["seam_open"], float(sopen)); m["island_gap"] = max(m["island_gap"], igap)
        if score > m["worst_score"]:
            m["worst_score"], m["worst_frame"] = score, f
            names, counts = np.unique(dom[edges[bad, 0]], return_counts=True)   # dónde se concentra
            m["bad_by_bone"] = {str(n): int(k) for n, k in sorted(zip(names, counts), key=lambda x: -x[1])[:5]}
            # Muestras de los peores vértices: posición en reposo y pesos (para localizar la causa).
            m["bad_samples"] = [dict(rest=[round(float(x), 3) for x in c0[i]],
                                     weights={gname[g.group]: round(g.weight, 2) for g in me.vertices[i].groups})
                                for i in np.argsort(-h)[:400:50]]
        st = bone_state()
        if prev is not None:
            # q y -q son la misma rotación: el ángulo útil es el menor de los dos.
            w = {k: math.degrees(min(a, 2 * math.pi - a)) * fps
                 for k in st for a in [prev[k].rotation_difference(st[k]).angle]}
            mx = max(w.values())
            frozen = frozen + 1 if mx / fps < FROZEN_EPS_DEG else 0; frozen_max = max(frozen_max, frozen)
            kb = max(w, key=w.get)
            if w[kb] > ang["speed"]: ang["speed"], ang["speed_bone"] = w[kb], kb
            if prev_w is not None:
                acc = {k: abs(w[k] - prev_w[k]) * fps for k in w}
                ka = max(acc, key=acc.get)
                if acc[ka] > ang["accel"]: ang.update(accel=acc[ka], accel_bone=ka, accel_frame=f)
            prev_w = w
        prev = st
        for b in arm.pose.bones:
            a = math.degrees(b.matrix_basis.to_quaternion().angle)
            if a > ang["rest_rot"]: ang["rest_rot"], ang["rest_bone"] = a, b.name
    heats[act.name] = heat
    worst_frames[act.name] = m["worst_frame"]
    dur = (f1 - f0) / fps
    m.update({k: round(v, 3) if isinstance(v, float) else v for k, v in ang.items()})
    m["frozen_s"] = round(frozen_max / fps, 2); m["duration_s"] = round(dur, 2)
    m = {k: round(v, 4) if isinstance(v, float) else v for k, v in m.items()}
    report["actions"][act.name] = m
    def issue(level, what): report["issues"].append(dict(level=level, action=act.name, what=what))
    if m["stretch"] > STRETCH_WARN: issue("WARN", f"arista estirada x{m['stretch']:.2f}")
    if m["compress"] < COMPRESS_WARN: issue("WARN", f"arista comprimida x{m['compress']:.2f}")
    if m["min_z"] < -FLOOR_FAIL: issue("FAIL", f"atraviesa el suelo {-m['min_z']*100:.0f} cm ({m['min_z_bone']})")
    if m["max_growth_cm"] > TEAR_FAIL * 100: issue("FAIL", f"desgarro: arista crece {m['max_growth_cm']:.1f} cm")
    if m["bad_edge_frac"] > BAD_EDGE_FRACTION_FAIL: issue("FAIL", f"{m['bad_edge_frac']*100:.2f}% de aristas fuera de rango")
    if m["fold_frac"] > FOLD_FRACTION_FAIL: issue("FAIL", f"{m['fold_frac']*100:.2f}% de aristas plegadas (>{FOLD_FAIL_DEG:.0f}°)")
    elif m["fold"] > FOLD_WARN_DEG: issue("WARN", f"pliegue local de {m['fold']:.0f}°")
    if m["collapse"] < AREA_COLLAPSE: issue("WARN", f"cara colapsada al {m['collapse']*100:.0f}% de su área")
    if m["seam_open"] > SEAM_OPEN_FAIL: issue("FAIL", f"costura abierta {m['seam_open']*100:.1f} cm")
    elif m["seam_open"] > SEAM_OPEN_WARN: issue("WARN", f"costura abierta {m['seam_open']*100:.1f} cm")
    if m["island_gap"] > ISLAND_GAP_FAIL: issue("FAIL", f"pieza despegada {m['island_gap']*100:.1f} cm")
    if m["accel"] > ANG_ACCEL_FAIL: issue("FAIL", f"tirón en {m['accel_bone']} (f{m['accel_frame']}, {m['accel']:.0f}°/s²)")
    elif m["accel"] > ANG_ACCEL_WARN: issue("WARN", f"tirón en {m['accel_bone']} (f{m['accel_frame']}, {m['accel']:.0f}°/s²)")
    if m["speed"] > ANG_SPEED_WARN: issue("WARN", f"{m['speed_bone']} gira a {m['speed']:.0f}°/s")
    if m["rest_rot"] > REST_ROT_WARN: issue("WARN", f"{m['rest_bone']} girado {m['rest_rot']:.0f}° respecto al reposo")
    if dur > 1 and m["frozen_s"] > FROZEN_FAIL_S: issue("WARN", f"congelado {m['frozen_s']} s (sin moving hold)")
    print(f"QA {act.name}: {json.dumps(m)}")

if static["unweighted_vertices"]: report["issues"].append(dict(level="FAIL", action="-", what=f"{static['unweighted_vertices']} vértices sin peso"))
if static["over_influence_vertices"]: report["issues"].append(dict(level="WARN", action="-", what=f"{static['over_influence_vertices']} vértices con >{MAX_INFLUENCES} influencias"))
if static["nonmanifold_edges"]: report["issues"].append(dict(level="WARN", action="-", what=f"{static['nonmanifold_edges']} aristas no-manifold"))
report["verdict"] = "FAIL" if any(i["level"] == "FAIL" for i in report["issues"]) else "PASS"

if rdir:
    os.makedirs(rdir, exist_ok=True)
    base = os.path.splitext(os.path.basename(glb))[0]
    sc.render.engine = "BLENDER_WORKBENCH"; sc.render.resolution_x = sc.render.resolution_y = 480
    sc.display.shading.light = "STUDIO"
    cam = bpy.data.objects.new("qa_cam", bpy.data.cameras.new("qa_cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = max(H, float(np.ptp(c0[:, 0]))) * 1.3
    ctr = Vector(c0.mean(0)); ctr.z = float(c0[:, 2].min()) + H / 2
    col = me.color_attributes.new("qa_heat", "FLOAT_COLOR", "POINT")
    def paint(h):
        t = np.clip(h, 0, 1)   # azul (0) → verde (0.5) → rojo (1 = umbral FAIL)
        rgba = np.stack([t, np.where(t < .5, t * 2, (1 - t) * 2), 1 - t, np.ones(V)], 1)
        col.data.foreach_set("color", rgba.ravel())
    views = {"34": Vector((-.6, -1, .35)), "lado": Vector((-1, 0, .15)), "atras": Vector((.4, 1, .3))}
    def shot(name, d):
        sc.frame_set(sc.frame_current); bpy.context.view_layer.update()   # sin esto el render sale un fotograma atrasado
        cam.location = ctr + d.normalized() * 5
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(rdir, name); bpy.ops.render.render(write_still=True)
    arm.data.pose_position = "REST"; sc.display.shading.color_type = "TEXTURE"
    shot(f"{base}_reposo_bind_tex.png", views["34"])
    arm.data.pose_position = "POSE"
    for act in actions:
        ad.action = act; f0, f1 = (int(x) for x in act.frame_range)
        set_frame(f0); set_frame(f0)
        for f in sorted({f0, (f0 + f1) // 3, 2 * (f0 + f1) // 3, worst_frames[act.name]}):
            set_frame(f); sc.display.shading.color_type = "TEXTURE"
            shot(f"{base}_{act.name}_f{f}_tex.png", views["34"])
        set_frame(worst_frames[act.name])
        paint(heats[act.name]); sc.display.shading.color_type = "VERTEX"
        for vn, d in views.items(): shot(f"{base}_{act.name}_peor_f{worst_frames[act.name]}_calor_{vn}.png", d)
    report["renders"] = rdir

with open(out_json, "w", encoding="utf-8") as fh: json.dump(report, fh, ensure_ascii=False, indent=1)
print("VEREDICTO", report["verdict"], json.dumps(report["issues"], ensure_ascii=False))
sys.exit(1 if report["verdict"] == "FAIL" else 0)
