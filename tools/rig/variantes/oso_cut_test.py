import bpy, bmesh, sys, numpy as np
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath="assets/oso/oso.fbx")
mesh=[o for o in bpy.data.objects if o.type=="MESH"][0]
M=np.array(mesh.matrix_world)
co=np.array([tuple(mesh.matrix_world@v.co) for v in mesh.data.vertices])
ARM=np.array([(.27,.013,.68),(.305,.02,.60),(.31,-.01,.5),(.318,-.04,.42),(.32,-.034,.35)])
def dist_poly(pts, P):
    best=np.full(len(pts),9.0)
    for a,c in zip(P[:-1],P[1:]):
        ab=c-a; t=np.clip(((pts-a)@ab)/(ab@ab),0,1); d=np.linalg.norm(pts-(a+t[:,None]*ab),axis=1); best=np.minimum(best,d)
    return best
R=float(sys.argv[-2])
q=co.copy(); q[:,0]=np.abs(q[:,0])
d=dist_poly(q,ARM)
ZT=float(sys.argv[-1])
arm=(d<R)&(q[:,2]<ZT)&(np.abs(co[:,0])>.15)
free=(d<R)&(q[:,2]>=ZT)
torso=~arm&~free
print("arm verts",arm.sum())
bm=bmesh.new(); bm.from_mesh(mesh.data); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
bad=[f for f in bm.faces if any(arm[v.index] for v in f.verts) and any(torso[v.index] for v in f.verts)]
zs=np.array([np.mean([co[v.index][2] for v in f.verts]) for f in bad])
print("cut faces",len(bad), "z hist", np.histogram(zs,bins=[0,.3,.4,.45,.5,.55,.6,.65,.7,.75])[0])
bmesh.ops.delete(bm,geom=bad,context="FACES_ONLY")
be=[e for e in bm.edges if e.is_boundary]
print("boundary edges",len(be))
# loops
import collections
adj=collections.defaultdict(list)
for e in be:
    a,b=e.verts; adj[a.index].append(b.index); adj[b.index].append(a.index)
seen=set(); loops=[]
for v in adj:
    if v in seen: continue
    st=[v]; comp=[]
    seen.add(v)
    while st:
        x=st.pop(); comp.append(x)
        for y in adj[x]:
            if y not in seen: seen.add(y); st.append(y)
    loops.append(comp)
print("loops",len(loops),sorted(len(l) for l in loops))
print("valence>2:",sum(1 for v in adj if len(adj[v])>2))
# secuencia de etiquetas por bucle (ordenado)
nb=collections.defaultdict(list)
for e in be:
    a,b=e.verts; nb[a.index].append(b.index); nb[b.index].append(a.index)
done=set()
for v0 in nb:
    if v0 in done: continue
    seq=[v0]; done.add(v0); prev=None; cur=v0
    while True:
        nxt=[y for y in nb[cur] if y!=prev and y not in done]
        if not nxt: break
        prev=cur; cur=nxt[0]; seq.append(cur); done.add(cur)
    lab="".join("A" if arm[i] else ("T" if torso[i] else "F") for i in seq)
    print("SEQ",len(seq),lab)
    print("Z", [round(co[i][2],2) for i in seq][::4])
