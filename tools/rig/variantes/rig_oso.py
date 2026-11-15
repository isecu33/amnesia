"""Rig ligero + animaciones simples para los animales de TÓTEM (Blender headless).

Uso:
  blender -b --python tools/rig/rig_animal.py -- <animal> <in.fbx> <out.glb> [dir_renders]

Esqueleto común (raíz, cadera, columna, pecho, cuello, cabeza, brazos) + extremidades
según lo que tiene cada animal:
  mitón (oso, zorro, ciervo): pulgar + dedos      garra (serpiente): pulgar + 2 dedos
  ala (búho): ala_1                               ala con plumas (cuervo): 3 plumas
Pose base: sentado a la mesa (asiento a SEAT m). Animaciones (mismo movimiento en todos,
adaptado a la anatomía): reposo, coger_carta, mirar_izq, mirar_der (30 fps).
El personaje mira hacia -Y; su derecha es -X.
"""
import bpy, sys, os, math
from mathutils import Vector

# Medidas en metros leídas de las mallas (A/T-pose). Lado +X; se espeja para -X.
# sh/el/wr/tip: hombro, codo, muñeca, punta de la mano (x, z). hip/spine/neck/head: alturas z.
A = {
    "oso":       dict(hand="miton",  sh=(.19, .88), el=(.27, .68), wr=(.31, .50), tip=(.32, .35), hip=.52, spine=.70, neck=.93, head=1.04, legs=True,
                      dy=dict(el=-.003, wr=-.029, tip=-.052)),   # el antebrazo/mano van adelantados respecto a ymid (medido en la malla)
    "zorro":     dict(hand="miton",  sh=(.13, .85), el=(.21, .73), wr=(.26, .62), tip=(.27, .46), hip=.57, spine=.72, neck=.92, head=1.00, legs=True),
    "ciervo":    dict(hand="miton",  sh=(.12, .73), el=(.30, .73), wr=(.40, .72), tip=(.51, .70), hip=.55, spine=.68, neck=.78, head=.90,  legs=True),
    "serpiente": dict(hand="garra",  sh=(.09, .62), el=(.27, .53), wr=(.38, .46), tip=(.47, .37), hip=.20, spine=.40, neck=.72, head=.78,  legs=False),
    "buho":      dict(hand="ala",    sh=(.08, .38), el=(.25, .38), wr=(.42, .37), tip=(.58, .35), hip=.12, spine=.26, neck=.45, head=.50,  legs=False),
    "cuervo":    dict(hand="plumas", sh=(.08, .36), el=(.22, .35), wr=(.36, .34), tip=(.53, .33), hip=.11, spine=.23, neck=.40, head=.44,  legs=False),
}

animal, fbx, out = sys.argv[sys.argv.index("--")+1:][:3]
rdir = (sys.argv[sys.argv.index("--")+1:] + [None])[3]
p = A[animal]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
mesh = [o for o in bpy.data.objects if o.type == "MESH"][0]
mesh.name = animal
import numpy as np
bb = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
H = max(v.z for v in bb)
# Centro del cuerpo en Y medido en el torso (entre columna y hombros, cerca del eje): la caja
# envolvente no sirve porque colas y enroscados la alargan (zorro −13 cm, serpiente −10, búho −9,5)
# y el esqueleto quedaba detrás del cuerpo, con pesos de piernas y brazos sin sentido.
_co = np.array([tuple(mesh.matrix_world @ v.co) for v in mesh.data.vertices])
_t = _co[(_co[:, 2] > p["spine"]) & (_co[:, 2] < p["sh"][1]) & (np.abs(_co[:, 0]) < .12), 1]
ymid = float(np.percentile(_t, 5) + np.percentile(_t, 95)) / 2

# --- OSO: separar antebrazo y costado (cinturón/falda) -------------------------------------------
# En la figura base cada antebrazo cuelga pegado al cinturón, soldado por ~70 caras puente. Al girar el
# antebrazo hacia delante esa soldadura se estira como un ala. Se borran las caras que unen antebrazo y
# costado y cada lado se cierra con su propia tapa (el borde del corte es un lazo con dos vértices "libres"
# que siguen compartidos, donde el antebrazo nace del codo). Resultado: dos superficies cerradas e
# independientes que pueden moverse sin tirar la una de la otra.
import bmesh, collections
OSO_ARM = np.array([(.27, .013, .68), (.305, .02, .60), (.31, -.01, .50), (.318, -.04, .42), (.32, -.034, .35)])  # eje del antebrazo+mano (x>0)
OSO_ZH, OSO_ZL = float(os.environ.get('OSO_ZH', .52)), float(os.environ.get('OSO_ZL', .32))
OSO_ZA, OSO_ZB = float(os.environ.get('OSO_ZA', .50)), float(os.environ.get('OSO_ZB', .70))
OSO_TILT = float(os.environ.get('OSO_TILT', 50))
OSO_SH_IT = int(os.environ.get('OSO_SH_IT', 120))
OSO_R, OSO_ZT = .07, float(os.environ.get('OSO_ZT', .75))        # radio del tubo y altura sobre la que el brazo queda "libre" (codo)
def _dist_poly(pts, P):
    best = np.full(len(pts), 9.0)
    for a_, c_ in zip(P[:-1], P[1:]):
        ab = c_ - a_; t = np.clip(((pts - a_) @ ab) / (ab @ ab), 0, 1)
        best = np.minimum(best, np.linalg.norm(pts - (a_ + t[:, None] * ab), axis=1))
    return best
def oso_labels():
    """Etiquetas por vértice: 1 = antebrazo/mano (tubo bajo el codo), 2 = costado/falda, 0 = libre (codo y arriba)."""
    q = _co.copy(); q[:, 0] = np.abs(q[:, 0]); d_ = _dist_poly(q, OSO_ARM)
    arm_ = (d_ < OSO_R) & (q[:, 2] < OSO_ZT) & (q[:, 0] > .15)
    free_ = (d_ < OSO_R) & (q[:, 2] >= OSO_ZT)
    lab = np.full(len(_co), 2, np.int8); lab[free_] = 0; lab[arm_] = 1
    return lab
def oso_cut():
    lab = oso_labels()
    bm = bmesh.new(); bm.from_mesh(mesh.data); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    vuv = {}
    for f in bm.faces:
        for l in f.loops: vuv.setdefault(l.vert.index, l[uv].uv.copy())
    mixed = [f for f in bm.faces if any(lab[v.index] == 1 for v in f.verts) and any(lab[v.index] == 2 for v in f.verts)]
    bmesh.ops.delete(bm, geom=mixed, context="FACES_ONLY")
    for e_ in [e for e in bm.edges if not e.link_faces]: bm.edges.remove(e_)   # sin aristas sueltas (los vértices se conservan)
    nb = collections.defaultdict(list)
    for e in bm.edges:
        if e.is_boundary:
            a_, b_ = e.verts; nb[a_.index].append(b_.index); nb[b_.index].append(a_.index)
    done = set(); newf = []; global OSO_F; OSO_F = []
    for v0 in list(nb):
        if v0 in done: continue
        seq = [v0]; done.add(v0); prev = None; cur = v0
        while True:
            nxt = [y for y in nb[cur] if y != prev and y not in done]
            if not nxt: break
            prev, cur = cur, nxt[0]; seq.append(cur); done.add(cur)
        fr = [i for i, v in enumerate(seq) if lab[v] == 0]
        if not fr:   # lazo limpio (todo antebrazo o todo costado): una sola tapa
            if len(seq) >= 3:
                f = bm.faces.new([bm.verts[i] for i in seq]); newf.append(f)
                for l in f.loops: l[uv].uv = vuv[l.vert.index]
            continue
        if len(fr) != 2: print("OSO_CUT aviso: lazo con", len(fr), "vértices libres, no se tapa"); continue
        OSO_F += [seq[i] for i in fr]
        seq = seq[fr[0]:] + seq[:fr[0]]; k = seq.index(next(v for v in seq[1:] if lab[v] == 0))   # F1 .. k=F2
        for poly in (seq[:k + 1], seq[k:] + seq[:1]):
            if len(poly) < 3: continue
            f = bm.faces.new([bm.verts[i] for i in poly]); newf.append(f)
            for l in f.loops: l[uv].uv = vuv[l.vert.index]
    if newf: bmesh.ops.triangulate(bm, faces=newf, quad_method='BEAUTY', ngon_method='BEAUTY')
    assert len(bm.verts) == len(_co), "oso_cut no debe cambiar el número de vértices"
    print(f"OSO_CUT: {len(mixed)} caras puente borradas, {len(newf)} tapas")
    bm.to_mesh(mesh.data); bm.free(); mesh.data.update()
    return lab
OSO_LAB = oso_cut()

arm = bpy.data.objects.new("Armature", bpy.data.armatures.new("Armature"))
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones

def P(x, z, dy=0.0): return Vector((x, ymid + dy, z))
def bone(name, head, tail, parent=None):
    b = eb.new(name); b.head, b.tail = head, tail
    if parent: b.parent = eb[parent]
    return b

bone("raiz", P(0, 0), P(0, p["hip"] * .5)).use_deform = False   # la raíz mueve el rig, no deforma (si no, pezuñas y bajos se hunden al sentarse)
bone("cadera", P(0, p["hip"] * .5), P(0, p["hip"]), "raiz")
bone("columna", P(0, p["hip"]), P(0, p["spine"]), "cadera")
bone("pecho", P(0, p["spine"]), P(0, p["sh"][1]), "columna")
bone("cuello", P(0, p["sh"][1]), P(0, p["neck"]), "pecho")
bone("cabeza", P(0, p["neck"]), P(0, p["head"]), "cuello")

# Lado: D = derecha del personaje (-X), I = izquierda (+X).
for side, s in (("D", -1), ("I", 1)):
    sh, el, wr, tip = (P(s * p[k][0], p[k][1], p.get("dy", {}).get(k, 0.0)) for k in ("sh", "el", "wr", "tip"))
    bone(f"hombro.{side}", P(0, p["sh"][1]), sh, "pecho")
    bone(f"brazo.{side}", sh, el, f"hombro.{side}")
    bone(f"antebrazo.{side}", el, wr, f"brazo.{side}")
    d = (tip - wr)  # eje de la mano
    n = Vector((0, -1, 0))  # delante
    inward = Vector((-s, 0, 0)) if p["hand"] in ("miton", "garra") and abs(d.x) < abs(d.z) else Vector((0, 0, -1))
    L = d.length
    h = p["hand"]
    if h == "miton":
        bone(f"mano.{side}", wr, wr + d * .35, f"antebrazo.{side}")
        base = wr + d * .35
        bone(f"dedos_1.{side}", base, base + d * .35, f"mano.{side}")
        bone(f"dedos_2.{side}", base + d * .35, tip, f"dedos_1.{side}")
        pb = wr + d * .25 + inward * L * .22 + n * L * .1
        bone(f"pulgar_1.{side}", pb, pb + d * .3 + inward * L * .12, f"mano.{side}")
        bone(f"pulgar_2.{side}", pb + d * .3 + inward * L * .12, pb + d * .6 + inward * L * .2, f"pulgar_1.{side}")
    elif h == "garra":
        bone(f"mano.{side}", wr, wr + d * .3, f"antebrazo.{side}")
        base = wr + d * .3
        for i, off in enumerate((-.12, 0.0, .12)):
            o = (Vector((0, 1, 0)) * off * L)
            nm = ("pulgar", "dedo_1", "dedo_2")[i]
            bone(f"{nm}_1.{side}", base + o, base + o + d * .35, f"mano.{side}")
            bone(f"{nm}_2.{side}", base + o + d * .35, base + o + d * .7, f"{nm}_1.{side}")
    elif h == "ala":
        bone(f"mano.{side}", wr, wr + d * .5, f"antebrazo.{side}")
        bone(f"ala_1.{side}", wr + d * .5, tip, f"mano.{side}")
    else:  # plumas: el ala termina en un abanico de 3 plumas
        bone(f"mano.{side}", wr, wr + d * .5, f"antebrazo.{side}")
        base = wr + d * .5
        for i, dz in enumerate((.04, 0.0, -.05)):
            end = tip + Vector((0, 0, dz)) + Vector((0, (i - 1) * .02, 0))
            bone(f"pluma_{i+1}.{side}", base, end, f"mano.{side}")
    if p["legs"]:
        lx = s * .07
        bone(f"muslo.{side}", P(lx, p["hip"]), P(lx, p["hip"] * .5), "cadera")
        bone(f"pierna.{side}", P(lx, p["hip"] * .5), P(lx, .02), f"muslo.{side}")
# Cola larga (zorro): hueso propio, para que al sentarse no siga a la cadera hasta atravesar asiento y suelo.
TAIL = animal in ("zorro",)
if TAIL:
    _tv = _co[(_co[:, 1] > ymid + .15) & (_co[:, 2] < p["hip"] * 1.2)]
    _d = _tv[:, 1] - ymid
    _near, _far = _tv[_d < np.percentile(_d, 20)].mean(0), _tv[_d > np.percentile(_d, 80)].mean(0)
    bone("cola", Vector((0, ymid + .08, _near[2])), Vector((0, _far[1], _far[2])), "cadera")
bpy.ops.object.mode_set(mode="OBJECT")

SEAT = .26                       # altura del asiento sobre el suelo (m)
DROP = (p["hip"] - SEAT) if p["legs"] else 0.0
CUSTOM = animal in ("serpiente", "buho", "cuervo")   # telas/plumas: pesos por cercanía
HAND = ("mano", "dedo", "pulgar", "ala", "pluma")
LIMB = ("brazo", "antebrazo") + HAND
WINGS = p["hand"] in ("ala", "plumas")
LIMB_R = {"serpiente": .30}.get(animal, 9.0)   # radio de influencia de las extremidades
LIMB_ZMIN = {"serpiente": .30}.get(animal, -9.0)  # y altura mínima (la cola enroscada no sigue a los brazos)   # radio de influencia de las extremidades

def seg_dist(pt, a, b):
    ab = b - a; t = max(0.0, min(1.0, (pt - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (pt - (a + ab * t)).length
ebones = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones}

def attach(kind):
    for m in list(mesh.modifiers): mesh.modifiers.remove(m)
    mesh.vertex_groups.clear(); mesh.parent = None
    bpy.ops.object.select_all(action="DESELECT"); mesh.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type=kind)

if CUSTOM:
    # Cada vértice sigue a sus 3 huesos más cercanos (ponderado por 1/d^4): telas y plumas no se rompen.
    attach("ARMATURE_NAME")
    deform = [n for n in ebones if n != "raiz"]
    groups = {n: mesh.vertex_groups.get(n) or mesh.vertex_groups.new(name=n) for n in deform}
    for v in mesh.data.vertices:
        co = mesh.matrix_world @ v.co
        cand = [(seg_dist(co, *ebones[n]), n) for n in deform]
        # una extremidad solo arrastra vértices cercanos (la cola de la serpiente no sigue al brazo)
        near = sorted(c for c in cand if c[1].split(".")[0].split("_")[0] not in LIMB or (c[0] < LIMB_R and co.z > LIMB_ZMIN))[:3]
        ws = [1 / (d + .015) ** 4 for d, _ in near]; tot = sum(ws)
        for (_, n), w in zip(near, ws): groups[n].add([v.index], w / tot, "REPLACE")
    print(f"PESOS {animal}: por cercanía, {len(mesh.data.vertices)} vértices")
else:
    attach("ARMATURE_AUTO")
    # Limpieza: un vértice lejos de un hueso de brazo/mano no debe seguirlo (falda, capa...).
    SEAM_R = .012
    LONG_EDGE = .006
    MAXD = {"oso": (.05, .045), "zorro": (.125, .06), "ciervo": (.16, .08)}[animal]
    LEGR = {"zorro": .09, "ciervo": .09}   # faldón/capa lejos de las piernas: sigue a la cadera, no al muslo
    body = [n for n in ebones if n.split(".")[0] in ("cadera", "columna", "pecho", "muslo", "pierna")]
    gname = {g.index: g.name for g in mesh.vertex_groups}
    for v in mesh.data.vertices:
        co = mesh.matrix_world @ v.co
        for g in list(v.groups):
            n = gname[g.group]; base = n.split(".")[0].split("_")[0]
            if base in LIMB and seg_dist(co, *ebones[n]) > MAXD[1 if base in HAND else 0]:
                mesh.vertex_groups[n].remove([v.index])
        if animal in LEGR and co.z < p["hip"] and co.y < ymid + .10:   # la cola (detrás) conserva sus pesos
            legs = [n for n in ebones if n.split(".")[0] in ("muslo", "pierna")]
            if min(seg_dist(co, *ebones[n]) for n in legs) > LEGR[animal]:
                for n in legs: mesh.vertex_groups[n].remove([v.index])
                t = max(0.0, min(1.0, co.z / p["hip"]))   # arriba: cadera; abajo: pierna (llega al suelo)
                side = "D" if co.x < 0 else "I"
                mesh.vertex_groups["cadera"].add([v.index], t, "ADD")
                mesh.vertex_groups[f"pierna.{side}"].add([v.index], 1 - t, "ADD")
        if not any(g.weight > 0 for g in v.groups):
            near = min(body, key=lambda n: seg_dist(co, *ebones[n]))
            mesh.vertex_groups[near].add([v.index], 1.0, "REPLACE")
    # Costuras: vértices casi coincidentes de láminas distintas (capa, hombrera) deben moverse igual → promedio de pesos.
    from mathutils.kdtree import KDTree
    kd = KDTree(len(mesh.data.vertices))
    for v in mesh.data.vertices: kd.insert(mesh.matrix_world @ v.co, v.index)
    kd.balance()
    allw = {v.index: {gname[g.group]: g.weight for g in v.groups} for v in mesh.data.vertices}
    for v in mesh.data.vertices:
        near = [i for _, i, _ in kd.find_range(mesh.matrix_world @ v.co, SEAM_R)]
        if len(near) < 2: continue
        acc = {}
        for i in near:
            for n, w in allw[i].items(): acc[n] = acc.get(n, 0.0) + w / len(near)
        tot = sum(acc.values()) or 1.0
        for g in list(v.groups): mesh.vertex_groups[gname[g.group]].remove([v.index])
        for n, w in acc.items():
            if w / tot > .01: mesh.vertex_groups[n].add([v.index], w / tot, "REPLACE")
    # Aristas largas entre vértices con pesos muy distintos (manga ↔ capa) se estiran al mover el brazo: se mezclan sus pesos.
    me = mesh.data
    wv = lambda i: {gname[g.group]: g.weight for g in me.vertices[i].groups}
    for _ in range(8):
        cur = {v.index: wv(v.index) for v in me.vertices}
        blend = {}
        for e in me.edges:
            a, b = e.vertices
            if (me.vertices[a].co - me.vertices[b].co).length * mesh.matrix_world.to_scale()[0] < LONG_EDGE: continue
            wa, wb = cur[a], cur[b]; ta, tb = sum(wa.values()) or 1.0, sum(wb.values()) or 1.0
            if sum(abs(wa.get(n, 0) / ta - wb.get(n, 0) / tb) for n in set(wa) | set(wb)) < .3: continue
            for x, y in ((a, wb), (b, wa)): blend.setdefault(x, []).append(y)
        for i, others in blend.items():
            w0 = cur[i]; t0 = sum(w0.values()) or 1.0
            acc = {n: w / t0 * .5 for n, w in w0.items()}
            for o in others:
                to = sum(o.values()) or 1.0
                for n, w in o.items(): acc[n] = acc.get(n, 0.0) + w / to * .5 / len(others)
            for g in list(me.vertices[i].groups): mesh.vertex_groups[gname[g.group]].remove([i])
            for n, w in acc.items():
                if w > .01: mesh.vertex_groups[n].add([i], w, "REPLACE")
    if animal == "oso":
        # Tras el corte, el antebrazo/mano solo sigue a huesos de brazo y el costado/falda no sigue al antebrazo.
        ARMB = ("brazo", "antebrazo", "mano", "dedos", "pulgar")
        isarm = lambda n: n.split(".")[0].split("_")[0] in ARMB
        armbones = [n for n in ebones if isarm(n)]
        nolimb = [n for n in ebones if n.split(".")[0].split("_")[0] in ("antebrazo", "mano", "dedos", "pulgar")]
        for v in mesh.data.vertices:
            lb = OSO_LAB[v.index]
            if lb == 0: continue
            co = mesh.matrix_world @ v.co
            for g in list(v.groups):
                n = gname[g.group]
                if (lb == 1 and not isarm(n)) or (lb == 2 and n in nolimb):
                    mesh.vertex_groups[n].remove([v.index])
            if not any(g.weight > 0 for g in v.groups):
                pool = armbones if lb == 1 else body
                mesh.vertex_groups[min(pool, key=lambda n: seg_dist(co, *ebones[n]))].add([v.index], 1.0, "REPLACE")
    if animal == "oso":
        # El calor óseo reparte pesos de muslo por el torso y de columna por el muslo: al doblar la cadera 90° se pliega
        # el cinturón y el vientre. La pierna manda bajo la falda (z < OSO_ZL), el torso sobre el cinturón (z > OSO_ZH)
        # y entre ambos la fracción de pierna baja suavemente (el pliegue queda bajo el cinturón).
        LEG = ("muslo", "pierna")
        isleg = lambda n: n.split(".")[0] in LEG
        ss = lambda t: (lambda u: u * u * (3 - 2 * u))(min(max(t, 0.0), 1.0))
        for v in mesh.data.vertices:
            if OSO_LAB[v.index] == 1: continue
            cw = mesh.matrix_world @ v.co
            wl = ss((OSO_ZH - cw.z) / (OSO_ZH - OSO_ZL))                 # fracción de pierna
            st = ss((cw.z - OSO_ZA) / (OSO_ZB - OSO_ZA)) if OSO_TILT else 1.0   # fracción de torso (columna...) frente a pelvis
            W = {gname[g.group]: g.weight for g in v.groups}
            if wl == 0 and st == 1 and not any(isleg(n) for n in W): continue
            tl = sum(w_ for n, w_ in W.items() if isleg(n)); tn = sum(w_ for n, w_ in W.items() if not isleg(n))
            if tl == 0 and wl > 0: W[f"muslo.{'D' if cw.x < 0 else 'I'}"] = tl = 1.0
            if tn == 0 and wl < 1: W["cadera"] = tn = 1.0
            F = {}
            for n, w_ in W.items():
                if isleg(n): F[n] = w_ / tl * wl
                elif n == "cadera": F[n] = w_ / tn * (1 - wl)
                else: F[n] = w_ / tn * (1 - wl) * st
            F["cadera"] = F.get("cadera", 0.0) + sum(w_ / tn * (1 - wl) * (1 - st) for n, w_ in W.items() if not isleg(n) and n != "cadera")
            for g in list(v.groups): mesh.vertex_groups[gname[g.group]].remove([v.index])
            for n, w_ in F.items():
                if w_ > .005: mesh.vertex_groups[n].add([v.index], w_, "REPLACE")
    print(f"PESOS {animal}: automáticos + limpieza")

# Pesos: transición suave de 1–2 anillos en cada articulación (un corte duro 1/0 pliega la malla),
# máximo 4 influencias y normalizados (lo que espera glTF/three.js).
WEIGHT_SMOOTH = 12 if CUSTOM else 6   # plumas y escamas (pesos por cercanía) piden transiciones más anchas
MAX_INF = 4
def smooth_weights():
    me = mesh.data; nv = len(me.vertices); groups = list(mesh.vertex_groups)
    W = np.zeros((nv, len(groups)))
    for v in me.vertices:
        for g in v.groups: W[v.index, g.group] = g.weight
    ed = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get("vertices", ed); ed = ed.reshape(-1, 2)
    deg = np.bincount(ed.ravel(), minlength=nv).astype(float)[:, None].clip(1, None)
    for _ in range(WEIGHT_SMOOTH):
        acc = np.zeros_like(W); np.add.at(acc, ed[:, 0], W[ed[:, 1]]); np.add.at(acc, ed[:, 1], W[ed[:, 0]])
        W = W * .5 + acc / deg * .5
    if animal == "oso" and OSO_SH_IT:
        # Axila/hombro: el brazo nace de la malla del torso (no hay tubo cerrado); ahí los pesos se difuminan más
        # (solo en los vértices libres, sin tocar el antebrazo ni el cinturón) para que el giro del hombro no estire.
        msk = (OSO_LAB == 0) | ((np.abs(_co[:, 0]) > .12) & (_co[:, 2] > .60))
        for _ in range(OSO_SH_IT):
            acc = np.zeros_like(W); np.add.at(acc, ed[:, 0], W[ed[:, 1]]); np.add.at(acc, ed[:, 1], W[ed[:, 0]])
            W[msk] = (W * .5 + acc / deg * .5)[msk]
    if animal == "oso":   # el suavizado no puede filtrar pesos del torso al antebrazo ni al revés (a través de los vértices libres)
        gn_ = [g.name for g in groups]; base_ = [n.split(".")[0].split("_")[0] for n in gn_]
        isarm_ = np.array([b_ in ("brazo", "antebrazo", "mano", "dedos", "pulgar") for b_ in base_])
        islimb_ = np.array([b_ in ("antebrazo", "mano", "dedos", "pulgar") for b_ in base_])
        W[np.ix_(OSO_LAB == 1, ~isarm_)] = 0.0
        W[np.ix_(OSO_LAB == 2, islimb_)] = 0.0
        for r_ in np.nonzero(W.sum(1) < 1e-6)[0]:
            W[r_, gn_.index("cadera" if OSO_LAB[r_] != 1 else ("antebrazo.I" if _co[r_, 0] > 0 else "antebrazo.D"))] = 1.0
    top = np.argsort(-W, axis=1)[:, MAX_INF:]           # solo las MAX_INF mayores influencias
    np.put_along_axis(W, top, 0.0, axis=1); W[W < .01] = 0.0
    W /= W.sum(1, keepdims=True).clip(1e-9, None)
    for g in groups: g.remove(range(nv))
    for gi, g in enumerate(groups):
        for i in np.nonzero(W[:, gi])[0]: g.add([int(i)], float(W[i, gi]), "REPLACE")
smooth_weights()

from mathutils import Matrix
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
pb = arm.pose.bones
def upd(): bpy.context.view_layer.update()
def dir_of(b): return (b.tail - b.head).normalized()
def aim(name, target, frac=1.0):
    """Gira el hueso (en torno a su cabeza) hacia `target` una fracción `frac` del ángulo total."""
    b = pb[name]; cur = dir_of(b); tgt = Vector(target).normalized()
    ang = cur.angle(tgt)
    if ang < 1e-4: return
    R = Matrix.Rotation(ang * frac, 4, cur.cross(tgt).normalized())
    h = b.head.copy()
    b.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ b.matrix
    upd()
def yaw(name, deg):
    b = pb[name]; h = b.head.copy()
    b.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, "Z") @ Matrix.Translation(-h) @ b.matrix
    upd()
def reset():
    for b in pb: b.rotation_mode = "QUATERNION"; b.rotation_quaternion = (1, 0, 0, 0); b.location = (0, 0, 0)
    upd()
def key(f):
    for b in pb: b.keyframe_insert("rotation_quaternion", frame=f); b.keyframe_insert("location", frame=f)

FRONT = Vector((0, -1, 0))
def outward(s): return Vector((-1 if s == "D" else 1, 0, 0))
def fingers(s): return [b.name for b in pb if b.name.endswith("." + s) and b.name.split(".")[0].split("_")[0] in ("dedos", "dedo", "pulgar", "ala", "pluma")]

IK = animal in ("oso", "zorro")
SEATED_REST = False              # True tras hornear la pose sentada como reposo (bake_seated)
TABLE = .44                      # altura del tablero (m); EDGE: borde de la mesa respecto al centro del cuerpo
# REST_FWD: muñecas en reposo sobre la mesa, adelantadas. Así el gran giro de hombro (brazo colgando →
# antebrazo sobre la mesa) queda en el horneado suavizado y alcanzar la carta es un movimiento corto.
EDGE, CARD_FWD, CARD_X, REST_FWD, REST_X = .24, .46, -.10, .28, float(os.environ.get('OSO_RX', .20))
HL = (Vector((p["tip"][0], 0, p["tip"][1])) - Vector((p["wr"][0], 0, p["wr"][1]))).length   # largo de la mano

def pitch(name, deg):
    """Inclina el hueso hacia delante (deg > 0) girando en torno a su cabeza."""
    b = pb[name]; h = b.head.copy()
    b.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, "X") @ Matrix.Translation(-h) @ b.matrix
    upd()

OSO_TILT = float(os.environ.get("OSO_TILT", 50))
def tilt_pelvis(deg):
    """La flexión de cadera de 90° se reparte: la pelvis se inclina `deg` grados hacia delante en torno a la
    articulación de la cadera y la columna lo compensa; así el pliegue no cae todo en la unión muslo-cinturón."""
    b = pb["cadera"]; h = b.tail.copy()
    b.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(-deg), 4, "X") @ Matrix.Translation(-h) @ b.matrix; upd()
    aim("columna", Vector((0, 0, 1)))

def at(x, fwd, z): return Vector((x, ymid - fwd, z))

PARAM = dict(a=float(os.environ.get("OSO_A", 20)), b=float(os.environ.get("OSO_B", 80)))
def arm_pose(s, a, b, hand=0.0):
    """Brazo colgando que se adelanta `a` grados desde la vertical y antebrazo `b` grados (desde la vertical, hacia delante).
    Dos giros de articulación, sin IK: la malla se dobla donde ya está el codo."""
    o = outward(s)
    ra, rb = math.radians(a), math.radians(b)
    aim(f"brazo.{s}", Vector((o.x * .10, -math.sin(ra), -math.cos(ra))))
    aim(f"antebrazo.{s}", Vector((o.x * .03, -math.sin(rb), -math.cos(rb))))
    if hand:
        for n in ("mano", "dedos_1", "dedos_2", "pulgar_1", "pulgar_2"): pass

def reach_wrist(s, target, pole=None):
    """IK de 2 huesos: lleva la muñeca de `s` a `target` (codo hacia `pole`)."""
    br, ab = pb[f"brazo.{s}"], pb[f"antebrazo.{s}"]
    S = br.head.copy(); L1 = (br.tail - br.head).length; L2 = (ab.tail - ab.head).length
    d = target - S; dist = min(max(d.length, abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3); u = d.normalized()
    pole = pole if pole is not None else outward(s) * .6 + Vector((0, .15, -.8))   # codo abajo y hacia fuera
    perp = (pole - u * pole.dot(u)); perp = perp.normalized() if perp.length > 1e-6 else Vector((0, 0, -1))
    a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist); h = max(L1 * L1 - a * a, 0) ** .5
    elbow = S + u * a + perp * h
    aim(f"brazo.{s}", elbow - S); aim(f"antebrazo.{s}", S + u * dist - elbow)

def flat_hand(s, down=.3):
    """La mano (mitón) sale de la muñeca hacia delante y algo abajo: palma sobre la mesa/carta, no colgando."""
    aim(f"mano.{s}", FRONT + Vector((0, 0, -down)))

# El cliente pega la carta a la cabeza del hueso mano (= la muñeca) con +4 cm adelante y +3 cm arriba:
# en el agarre la muñeca queda 4 cm por detrás del centro de la carta (la palma cubre la carta).
def card_wrist(): return at(CARD_X, CARD_FWD - float(os.environ.get('OSO_CF', .13)), TABLE + .05)
def lift_wrist(): return at(CARD_X + .04, .24, TABLE + .11)   # carta a media altura, bajo el hocico

def sentado():
    """Pose base: sentado a la mesa, antebrazos apoyados delante (alas plegadas en las aves)."""
    if DROP and not SEATED_REST:
        b = pb["raiz"]; b.matrix = Matrix.Translation((0, 0, -DROP)) @ b.matrix; upd()
        for s in "DI":
            if animal == "oso" and s == "D" and OSO_TILT:
                tilt_pelvis(OSO_TILT)
            if not os.environ.get("OSO_NOLEG"):
                aim(f"muslo.{s}", FRONT)
                aim(f"pierna.{s}", Vector((0, .05, -1)))
        if TAIL: aim("cola", Vector((0, 1, .6)))   # cola hacia atrás y algo arriba: no atraviesa asiento ni suelo
    for s in "DI":
        o = outward(s)
        if IK:
            reach_wrist(s, at(o.x * REST_X, REST_FWD, TABLE + .04)); flat_hand(s)   # manos apoyadas en el borde de la mesa
        elif WINGS:
            aim(f"brazo.{s}", o * .35 + Vector((0, .6, -.6)))      # ala plegada: atrás y abajo...
            aim(f"antebrazo.{s}", o * .05 + Vector((0, 1, .15)))   # ...y el antebrazo hacia atrás
        else:
            aim(f"brazo.{s}", o * .15 + FRONT * .35 + Vector((0, 0, -1)))
            aim(f"antebrazo.{s}", FRONT + o * .1 + Vector((0, 0, -.15)))

# Inclinación del tronco hacia la mesa (grados) en cada fase: alcanzar implica a la espalda, no solo al brazo.
_LR = float(os.environ.get("OSO_LR", 16))
LEAN = {"prep": -2.0, "reach": _LR, "grip": _LR - 1, "lift": 3.0, "hold": 2.0}
# Fracción del giro de brazo/ala en el gesto sin IK: un ala o garra bajo capa se rasga con el giro completo;
# el tronco (LEAN) y la cabeza completan el gesto.
AMP = {"buho": .4, "cuervo": .45, "serpiente": .6}
def lean(deg):
    """Inclina el tronco hacia delante (deg > 0), repartido entre columna y pecho como una espalda real."""
    pitch("columna", deg * .4); pitch("pecho", deg * .6)

def breathe(t):
    """Respiración y balanceo leve de la cabeza en la fase t ∈ [0, 1] (t=0 y t=1 coinciden: bucle limpio)."""
    w = 2 * math.pi * t
    pitch("pecho", -1.2 * math.sin(w)); pitch("cabeza", .8 * math.sin(w - .7)); yaw("cabeza", 1.5 * math.sin(w + 1.3))

def card(stage):
    """Mano derecha: anticipar (prep), alcanzar la carta (reach), agarrarla (grip), llevarla ante los ojos (lift)
    y sostenerla con un leve reajuste (hold) para que la pausa no quede congelada."""
    sentado(); lean(LEAN.get(stage, 0.0))
    s = "D"; o = outward(s)
    if stage == "prep":   # anticipación: el tronco cede un poco y la mirada se adelanta a la mano
        aim("cabeza", Vector((0, -.8, -.45)), .12)
        return
    held = stage in ("lift", "hold")
    if IK:
        tgt = lift_wrist() + (Vector((.01, .02, .01)) if stage == "hold" else Vector())
        reach_wrist(s, tgt if held else card_wrist()); flat_hand(s, .15 if held else .3)
        aim("cabeza", Vector((0, -1, -.5)) if held else Vector((0, -.8, -.45)), .15)
        if stage == "hold": yaw("cabeza", 4)
        if stage in ("grip", "lift", "hold"):
            for n in fingers(s): aim(n, FRONT * .3 + Vector((0, 0, -1)), float(os.environ.get('OSO_CURL', .1)))   # dedos casi rectos: sin muñeca doblada
        return
    a = AMP.get(animal, 1.0)
    if held:
        if WINGS:
            aim(f"brazo.{s}", o * .4 + FRONT * .5 + Vector((0, 0, -.5)), a)
            aim(f"antebrazo.{s}", o * .1 + FRONT * .5 + Vector((0, 0, .8)), a)
        else:
            aim(f"brazo.{s}", o * .25 + FRONT * .25 + Vector((0, 0, -1)), a)
            aim(f"antebrazo.{s}", o * .1 + FRONT * .5 + Vector((0, 0, .85)), a)
    else:
        if WINGS:
            aim(f"brazo.{s}", o * .7 + FRONT * .7 + Vector((0, 0, -.45)), a)
            aim(f"antebrazo.{s}", o * .3 + FRONT + Vector((0, 0, -.55)), a)
        else:
            aim(f"brazo.{s}", o * .15 + FRONT * .75 + Vector((0, 0, -.75)), a)
            aim(f"antebrazo.{s}", FRONT + o * .15 + Vector((0, 0, -.4)), a)
    aim("cabeza", FRONT * .8 + Vector((0, 0, -.45)), .25)
    if stage == "hold": yaw("cabeza", 4)
    if stage in ("grip", "lift", "hold"):
        grip = FRONT * .4 + Vector((0, 0, -1))
        for n in fingers(s): aim(n, grip, .85)

def mirar(d, amt=1.0):
    # El giro se reparte por toda la columna: concentrado en el cuello retuerce el cuello de pelo.
    sentado(); yaw("columna", 5 * d * amt); yaw("pecho", 9 * d * amt); yaw("cuello", 14 * d * amt); yaw("cabeza", 18 * d * amt)

CS_ITER = int(os.environ.get("OSO_CS", 10))   # iteraciones de Corrective Smooth al hornear la pose sentada
def bake_seated():
    """La pose sentada pasa a ser el reposo del rig. La malla se hornea deformada y suavizada con
    Corrective Smooth (quita pellizcos de hombros y caderas sin perder detalle; glTF no exporta ese
    modificador, por eso se aplica aquí) y todas las animaciones parten de ella con giros pequeños."""
    global SEATED_REST
    reset(); sentado()
    bpy.ops.object.mode_set(mode="OBJECT")
    cs = mesh.modifiers.new("suavizado", "CORRECTIVE_SMOOTH")
    cs.smooth_type, cs.rest_source, cs.iterations, cs.use_pin_boundary = "LENGTH_WEIGHTED", "ORCO", CS_ITER, True
    ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get("co", co); ev.to_mesh_clear()
    mesh.modifiers.remove(cs)
    if DROP:   # suelas que quedan bajo el suelo al sentarse: se aplastan contra él (contacto del pie)
        M = np.array(mesh.matrix_world); w = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
        w[:, 2] = np.maximum(w[:, 2], 0.0)
        co = ((w - M[:3, 3]) @ np.linalg.inv(M[:3, :3]).T).ravel()
    if os.environ.get("RIG_BAKE_DUMP"):   # diagnóstico: malla base y horneada para comparar
        co0 = np.zeros(len(mesh.data.vertices) * 3)
        mesh.data.vertices.foreach_get("co", co0)
        ed = np.zeros(len(mesh.data.edges) * 2, dtype=np.int64); mesh.data.edges.foreach_get("vertices", ed)
        dom = np.array([max(v.groups, key=lambda g: g.weight).group if v.groups else -1 for v in mesh.data.vertices])
        M = np.array(mesh.matrix_world); world = lambda c: c.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
        np.savez(os.environ["RIG_BAKE_DUMP"], base=world(co0), baked=world(co), edges=ed.reshape(-1, 2),
                 faces=np.array([tuple(f.vertices)[:3] for f in mesh.data.polygons]),
                 lab=OSO_LAB, dom=dom, wts=np.array([(v.index, g.group, g.weight) for v in mesh.data.vertices for g in v.groups]),
                 groups=np.array([g.name for g in mesh.vertex_groups]))
    mesh.data.vertices.foreach_set("co", co); mesh.data.update()
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    SEATED_REST = True
    reset()

def lag(name, prefixes, df):
    """Retrasa df fotogramas las claves intermedias de los huesos indicados (solapamiento y
    seguimiento: no todo arranca ni para a la vez). La primera y la última no se tocan (bucle)."""
    for fc in bpy.data.actions[name].fcurves:
        bone = fc.data_path.split('"')[1].split(".")[0].split("_")[0]
        if bone not in prefixes: continue
        for k in list(fc.keyframe_points)[1:-1]:
            k.co.x += df; k.handle_left.x += df; k.handle_right.x += df
        fc.update()

def make(name, frames):
    act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act
    for f, fn in frames:
        reset(); fn(); key(f)
    arm.animation_data.action = None

def track(name):
    t = arm.animation_data.nla_tracks.new(); t.name = name; t.strips.new(name, 1, bpy.data.actions[name])

bpy.context.scene.render.fps = 30
bake_seated()
if os.environ.get("RIG_ONLYBAKE"): sys.exit(0)
BREATH = (1, 19, 37, 55, 73)     # un ciclo de respiración de 2,4 s
make("reposo", [(f, lambda t=i / 4: (sentado(), breathe(t))) for i, f in enumerate(BREATH)])
make("coger_carta", [(1, sentado), (8, lambda: card("prep")), (16, lambda: card("reach")), (22, lambda: card("grip")),
                     (42, lambda: card("lift")), (58, lambda: card("hold")), (74, lambda: card("lift")),
                     (92, lambda: card("grip")), (106, sentado)])
lag("coger_carta", ("brazo", "antebrazo", "mano"), 2)              # la mirada se adelanta al brazo
lag("coger_carta", ("dedos", "dedo", "pulgar", "ala", "pluma"), 4)  # los dedos siguen a la mano
for nm, d in (("mirar_izq", 1), ("mirar_der", -1)):
    make(nm, [(1, sentado), (12, lambda d=d: (mirar(d), breathe(.25))), (30, lambda d=d: (mirar(d, 1.1), breathe(.6))),
              (42, sentado)])
    lag(nm, ("cuello",), 2); lag(nm, ("pecho",), 4)                 # gira la cabeza, luego cuello y tronco
for nm in ("reposo", "coger_carta", "mirar_izq", "mirar_der"): track(nm)
reset(); bpy.ops.object.mode_set(mode="OBJECT")

if os.environ.get("RIG_STRETCH"):
    # QA: alargamiento máximo de aristas y desplazamiento máximo de vértices respecto a la pose sentada (fotograma 1).
    sc = bpy.context.scene; ad = arm.animation_data; ad.use_nla = False
    gn = {g.index: g.name for g in mesh.vertex_groups}
    def pts(act, f):
        ad.action = bpy.data.actions[act]; sc.frame_set(f); bpy.context.view_layer.update()
        ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
        c = [mesh.matrix_world @ v.co for v in me.vertices]; ed = [(e.vertices[0], e.vertices[1]) for e in me.edges]
        ev.to_mesh_clear(); return c, ed
    for tn in ("coger_carta", "mirar_izq", "mirar_der"):
        pts('reposo', 10); pts('reposo', 12); base, edges = pts('reposo', 15); worst = (0.0, 0, Vector(), 0.0, 0, 0); moved = (0.0, 0, 0)
        pts(tn, 8); pts(tn, 9); pts(tn, 10); pts(tn, 11)   # la 1.ª evaluación tras cambiar de acción llega con la pose anterior
        for f in range(14, 106, 3):
            c, _ = pts(tn, f)
            for i in range(len(c)):
                d = (c[i] - base[i]).length
                if d > moved[0]: moved = (d, f, i)
            for a_, b_ in edges:
                l0 = (base[a_] - base[b_]).length
                if l0 > 1e-5:
                    g = (c[a_] - c[b_]).length - l0      # crecimiento absoluto de la arista (m)
                    if g > worst[0]: worst = (g, f, (c[a_] + c[b_]) / 2, l0, a_, b_)
        r, f, q, l0w, ea, eb = worst; d, fm, i = moved
        print("  EDGE", [(tuple(round(x, 2) for x in base[k]), [(gn[g.group], round(g.weight, 2)) for g in mesh.data.vertices[k].groups]) for k in (ea, eb)])
        print(f"STRETCH {animal} {tn}: arista +{r*100:.1f} cm (de {l0w*100:.1f} cm; f{f}, cerca de {q.x:.2f},{q.y:.2f},{q.z:.2f}); vértice máx. movido {d:.2f} m (f{fm}, reposo {tuple(round(x, 2) for x in base[i])}, grupos {[(gn[g.group], round(g.weight, 2)) for g in mesh.data.vertices[i].groups]})")
    ad.use_nla = True; ad.action = None

if rdir:
    os.makedirs(rdir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.color_type = "TEXTURE"
    sc.render.resolution_x = sc.render.resolution_y = 400
    cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = max(H, 2 * p["tip"][0]) * 1.25
    for view, d in (("f", Vector((0, -1, 0))), ("s", Vector((-1, 0, 0)))):
        cam.location = Vector((0, ymid, H / 2)) + d * 5
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        for tn, fr in (("reposo", 1), ("coger_carta", 14), ("coger_carta", 40), ("mirar_izq", 20)):
            for t in arm.animation_data.nla_tracks: t.mute = (t.name != tn)
            sc.frame_set(fr)
            sc.render.filepath = os.path.join(rdir, f"{animal}_{tn}{fr}_{view}.png"); bpy.ops.render.render(write_still=True)
    for t in arm.animation_data.nla_tracks: t.mute = False

bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animations=True,
                          export_nla_strips=True, export_skins=True)
print("OK", out)
