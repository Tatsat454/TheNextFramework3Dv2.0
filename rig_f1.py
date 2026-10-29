"""Re-rig low_poly-f1.glb for three.js: wheel spin/steer pivots + brake lights.

Run: blender -b -P rig_f1.py -- <in.glb> <out.glb>

Output hierarchy (glTF is Y-up, car faces +Z, left side is +X):
  F1_Car
    Body                    all static parts, joined
    BrakeLight_Center       rain/brake light under the exhaust  (material "BrakeLight")
    BrakeLight_L / _R       strips on the rear-wing endplates   (material "BrakeLight")
    FL_Steer -> FL_Spin -> FL_Wheel     (+ L brake-duct cover on FL_Steer)
    FR_Steer -> FR_Spin -> FR_Wheel     (+ R brake-duct cover on FR_Steer)
    RL_Spin  -> RL_Wheel
    RR_Spin  -> RR_Wheel
  Spin nodes rotate on local X, steer nodes rotate on local Y.
"""
import bpy, sys, math
import numpy as np
from mathutils import Vector, Matrix

src, dst = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
col = scene.collection

# Remember the original wheel empties' world positions (they sit on the axle centres).
centers = {k: bpy.data.objects[f"{k}_Tire"].matrix_world.translation.copy()
           for k in ("FL", "FR", "RL", "RR")}

# Bake every mesh into world space and drop the Sketchfab/FBX empty chain.
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.data.transform(mw)
    if mw.determinant() < 0:
        o.data.flip_normals()
    o.matrix_world = Matrix.Identity(4)
for o in [o for o in bpy.data.objects if o.type == "EMPTY"]:
    bpy.data.objects.remove(o, do_unlink=True)


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = o.data.name = name
    return o


def empty(name, parent, loc):
    e = bpy.data.objects.new(name, None)
    col.objects.link(e)
    e.parent = parent
    e.location = loc
    return e


def recentre(obj, pivot_world, parent):
    """Move obj's geometry so the pivot is its origin, then hang it under parent."""
    obj.data.transform(Matrix.Translation(-pivot_world))
    obj.parent = parent
    obj.location = (0, 0, 0)


def straighten(wheel):
    """The source wheels carry ~4 deg of camber, which makes them look crooked and
    wobble when spun about X. Rotate each one so its axle lies exactly on X,
    then re-centre it on the pivot."""
    v = np.array([p.co[:] for p in wheel.data.vertices])
    _, vecs = np.linalg.eigh(np.cov((v - v.mean(0)).T))
    axle = vecs[:, 0] * np.sign(vecs[0, 0])          # thinnest direction = axle
    toe = math.atan2(axle[1], axle[0])
    camber = math.atan2(axle[2], math.hypot(axle[0], axle[1]))
    wheel.data.transform(Matrix.Rotation(camber, 4, "Y") @ Matrix.Rotation(-toe, 4, "Z"))
    v = np.array([p.co[:] for p in wheel.data.vertices])
    wheel.data.transform(Matrix.Translation(-Vector((v.min(0) + v.max(0)) / 2)))
    report[f"{wheel.name}_fixed_deg"] = (round(math.degrees(camber), 2), round(math.degrees(toe), 2))


report = {}
root = empty("F1_Car", None, (0, 0, 0))
root["rigVersion"] = 2   # exported as glTF extras -> three.js userData; checked by F1CarController

# ---- wheels ----
for k in ("FL", "FR", "RL", "RR"):
    c = centers[k]
    parts = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(f"{k}_Tire")]
    wheel = join(parts, f"{k}_Wheel")
    if k[0] == "F":
        steer = empty(f"{k}_Steer", root, c)
        spin = empty(f"{k}_Spin", steer, (0, 0, 0))
        cover = bpy.data.objects[("L" if k == "FL" else "R") + "_Inside Cover_Dark Black_0"]
        recentre(cover, c, steer)
        cover.name = cover.data.name = f"{k}_BrakeDuct"
    else:
        spin = empty(f"{k}_Spin", root, c)
    recentre(wheel, c, spin)
    straighten(wheel)

# ---- body ----
body = join([o for o in bpy.data.objects
             if o.type == "MESH" and o.parent is None], "Body")
body.parent = root

# ---- brake lights (placed by ray-casting onto the real geometry) ----
bl_mat = bpy.data.materials.new("BrakeLight")
bl_mat.use_nodes = True
bsdf = bl_mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.35, 0.0, 0.0, 1)
bsdf.inputs["Emission Color"].default_value = (1.0, 0.02, 0.01, 1)
bsdf.inputs["Emission Strength"].default_value = 1.0
bsdf.inputs["Roughness"].default_value = 0.4

dg = bpy.context.evaluated_depsgraph_get()


def rear_hit(x, z):
    ok, loc, *_ = scene.ray_cast(dg, Vector((x, 20, z)), Vector((0, -1, 0)))
    return loc if ok else None


def light(name, at, size):
    bpy.ops.mesh.primitive_cube_add(location=at)
    o = bpy.context.active_object
    o.name = o.data.name = name
    o.scale = Vector(size) / 2
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(bl_mat)
    o.parent = root
    return o

# Centre light: hung directly under the exhaust tip (exhaust spans y<=4.217, z>=1.299).
light("BrakeLight_Center", (0, 4.14, 1.245), (0.24, 0.14, 0.11))

# Endplate strips on the rear wing.
for side, tag in ((1, "L"), (-1, "R")):
    best = None
    for dx in [i * 0.01 for i in range(-6, 7)]:
        h = rear_hit(side * 0.955 + dx, 1.85)
        if h and h.y > 4.6 and (best is None or h.y > best.y):
            best = h
    report[f"endplate_{tag}"] = tuple(round(v, 3) for v in best) if best else None
    if best:
        light(f"BrakeLight_{tag}", (best.x, best.y + 0.015, 1.85), (0.05, 0.04, 0.6))

for o in scene.objects:
    if o.type == "MESH":
        o.select_set(False)

bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_yup=True,
                          export_apply=False, export_extras=True)
bpy.ops.wm.save_as_mainfile(filepath=dst.replace(".glb", ".blend"))
print("REPORT", report, "wheel centres", {k: tuple(round(v, 3) for v in c) for k, c in centers.items()})
