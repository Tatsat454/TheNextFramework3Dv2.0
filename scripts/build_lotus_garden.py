import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, Euler

if "WORKSPACE_DIR" not in globals():
    WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)


def make_material(name, hex_color, roughness=0.55, metallic=0.0, emission_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    h = hex_color.lstrip("#")
    r, g, b = tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    r, g, b = [pow(c, 2.2) for c in (r, g, b)]
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if "Alpha" in bsdf.inputs and alpha < 1.0:
            bsdf.inputs["Alpha"].default_value = alpha
        if emission_strength > 0.0:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (r, g, b, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    mat.diffuse_color = (r, g, b, alpha)
    return mat


def link_mesh(name, bm, mat):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if name == "Lotus_Lantern_Glow":
        try:
            obj.visible_shadow = False
        except Exception:
            pass
    return obj


def add_box(bm, cx, cy, cz, sx, sy, sz, rx=0.0, ry=0.0, rz=0.0):
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret["verts"]
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=verts)
    if rx != 0.0 or ry != 0.0 or rz != 0.0:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler((rx, ry, rz), "XYZ").to_matrix(), verts=verts)
    bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=verts)
    return verts


def add_cylinder(bm, cx, cy, cz, r_bot, r_top, height, segs=16, rx=0.0, ry=0.0, rz=0.0):
    ret = bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segs,
        radius1=r_bot,
        radius2=r_top,
        depth=height,
    )
    verts = ret["verts"]
    if rx != 0.0 or ry != 0.0 or rz != 0.0:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler((rx, ry, rz), "XYZ").to_matrix(), verts=verts)
    bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=verts)
    return verts


def add_lowpoly_sphere(bm, cx, cy, cz, rx, ry, rz, subdivisions=1, jitter=0.14, seed=1):
    rng = random.Random(seed)
    ret = bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1.0)
    verts = ret["verts"]
    for v in verts:
        s = 1.0 + (rng.random() - 0.5) * 2.0 * jitter
        v.co.x *= rx * s
        v.co.y *= ry * s
        v.co.z *= rz * s
        v.co += Vector((cx, cy, cz))
    return verts


def build_lotus_garden():
    clear_scene()
    rng = random.Random(42)

    mats = {
        "Lotus_Marble_Cream": make_material("Lotus_Marble_Cream", "#f3dec2", roughness=0.42),
        "Lotus_Marble_Dark": make_material("Lotus_Marble_Dark", "#d8be9c", roughness=0.52),
        "Lotus_Slate_Roof": make_material("Lotus_Slate_Roof", "#4c5c7a", roughness=0.38, metallic=0.18),
        "Lotus_Gold_Trim": make_material("Lotus_Gold_Trim", "#f2ad36", roughness=0.25, metallic=0.85),
        "Lotus_Water_Teal": make_material("Lotus_Water_Teal", "#1d7c8a", roughness=0.06, metallic=0.12),
        "Lotus_Waterfall_Foam": make_material("Lotus_Waterfall_Foam", "#c8f6ff", roughness=0.18, emission_strength=0.65),
        "Lotus_Rock_Grey": make_material("Lotus_Rock_Grey", "#7c7582", roughness=0.72),
        "Lotus_Foliage_Dark": make_material("Lotus_Foliage_Dark", "#3a7d2c", roughness=0.62),
        "Lotus_Foliage_Bright": make_material("Lotus_Foliage_Bright", "#68b836", roughness=0.58),
        "Lotus_Cypress_Green": make_material("Lotus_Cypress_Green", "#4d982c", roughness=0.60),
        "Lotus_Pad_Green": make_material("Lotus_Pad_Green", "#63b43c", roughness=0.45),
        "Lotus_Flower_Pink": make_material("Lotus_Flower_Pink", "#ff82a8", roughness=0.38, emission_strength=0.28),
        "Lotus_Flower_Core": make_material("Lotus_Flower_Core", "#ffd447", roughness=0.28, emission_strength=1.4),
        "Lotus_Wood_Bark": make_material("Lotus_Wood_Bark", "#7a4e2d", roughness=0.78),
        "Lotus_Lantern_Glow": make_material("Lotus_Lantern_Glow", "#ffae2b", roughness=0.12, emission_strength=6.0),
    }

    bms = {k: bmesh.new() for k in mats}
    lantern_positions = []

    # Helper: Warm Golden Stone Lantern (records position so every lamp gets its own Point Light!)
    def add_lantern(x, y, z, scale=1.0):
        s = scale
        lantern_positions.append((x, y, z + 0.56 * s, s))
        add_box(bms["Lotus_Marble_Cream"], x, y, z + 0.12 * s, 0.56 * s, 0.56 * s, 0.24 * s)
        add_box(bms["Lotus_Marble_Dark"], x, y, z + 0.30 * s, 0.44 * s, 0.44 * s, 0.14 * s)
        add_box(bms["Lotus_Lantern_Glow"], x, y, z + 0.56 * s, 0.32 * s, 0.32 * s, 0.38 * s)
        for dx in (-0.17 * s, 0.17 * s):
            for dy in (-0.17 * s, 0.17 * s):
                add_box(bms["Lotus_Gold_Trim"], x + dx, y + dy, z + 0.56 * s, 0.05 * s, 0.05 * s, 0.40 * s)
        add_cylinder(bms["Lotus_Marble_Cream"], x, y, z + 0.84 * s, 0.44 * s, 0.16 * s, 0.18 * s, segs=4, rz=math.pi / 4)
        add_cylinder(bms["Lotus_Gold_Trim"], x, y, z + 1.00 * s, 0.08 * s, 0.01 * s, 0.18 * s, segs=8)

    # Helper: Stone Balustrade Railing
    def add_balustrade(x1, y1, z1, x2, y2, z2, n_posts=5, with_pier_start=True, with_pier_end=True, lantern_start=False, lantern_end=False):
        dx, dy, dz = x2 - x1, y2 - y1, z2 - z1
        length = math.hypot(dx, dy)
        angle = math.atan2(dy, dx)
        mx, my, mz = (x1 + x2) * 0.5, (y1 + y2) * 0.5, (z1 + z2) * 0.5
        slope_ang = math.atan2(dz, max(length, 0.001))

        for z_off, h_bar in ((0.12, 0.16), (0.68, 0.14)):
            add_box(bms["Lotus_Marble_Cream"], mx, my, mz + z_off, length, 0.28, h_bar, ry=-slope_ang, rz=angle)

        for i in range(1, n_posts):
            t = i / n_posts
            add_cylinder(bms["Lotus_Marble_Dark"], x1 + dx * t, y1 + dy * t, z1 + dz * t + 0.40, 0.08, 0.07, 0.44, segs=8)

        if with_pier_start:
            add_box(bms["Lotus_Marble_Cream"], x1, y1, z1 + 0.46, 0.62, 0.62, 0.92)
            add_box(bms["Lotus_Marble_Dark"], x1, y1, z1 + 0.94, 0.70, 0.70, 0.12)
            if lantern_start:
                add_lantern(x1, y1, z1 + 1.00, scale=0.88)
        if with_pier_end:
            add_box(bms["Lotus_Marble_Cream"], x2, y2, z2 + 0.46, 0.62, 0.62, 0.92)
            add_box(bms["Lotus_Marble_Dark"], x2, y2, z2 + 0.94, 0.70, 0.70, 0.12)
            if lantern_end:
                add_lantern(x2, y2, z2 + 1.00, scale=0.88)

    # Helper: Classical Column + Curved Archway Span to Next Column
    def add_column(x, y, z_base, height=3.2, radius=0.22):
        add_box(bms["Lotus_Marble_Dark"], x, y, z_base + 0.14, radius * 2.5, radius * 2.5, 0.28)
        add_cylinder(bms["Lotus_Marble_Cream"], x, y, z_base + 0.34, radius * 1.2, radius * 1.05, 0.14, segs=12)
        add_cylinder(bms["Lotus_Marble_Cream"], x, y, z_base + height * 0.5, radius, radius * 0.88, height - 0.56, segs=14)
        add_cylinder(bms["Lotus_Gold_Trim"], x, y, z_base + height - 0.24, radius * 0.92, radius * 1.22, 0.14, segs=12)
        add_box(bms["Lotus_Marble_Dark"], x, y, z_base + height - 0.08, radius * 2.5, radius * 2.5, 0.16)

    def add_arch_span(x1, y1, x2, y2, z_top, arch_drop=0.68, thickness=0.34):
        dx, dy = x2 - x1, y2 - y1
        span = math.hypot(dx, dy)
        yaw = math.atan2(dy, dx)
        segs = 7
        for s in range(segs):
            t0 = s / segs
            t1 = (s + 1) / segs
            tm = (t0 + t1) * 0.5
            px = x1 + dx * tm
            py = y1 + dy * tm
            # Arch curve rises from (z_top - arch_drop) at ends to z_top at center
            arch_z = (z_top - arch_drop) + math.sin(tm * math.pi) * (arch_drop - 0.12)
            spandrel_h = max(0.16, (z_top + 0.04) - arch_z)
            add_box(
                bms["Lotus_Marble_Cream"],
                px,
                py,
                z_top - spandrel_h * 0.5 + 0.04,
                (span / segs) + 0.05,
                thickness,
                spandrel_h,
                rz=yaw,
            )

    # Helper: Hanging Ivy & Pink Blossoms Garland
    def add_vine_garland(cx, cy, cz, radius=2.2, count=16, seed=10):
        vrng = random.Random(seed)
        for i in range(count):
            ang = (i / count) * math.tau + vrng.uniform(-0.12, 0.12)
            vx = cx + math.cos(ang) * radius
            vy = cy + math.sin(ang) * radius
            drop = vrng.uniform(0.55, 1.45)
            for s in range(4):
                t = s / 3.0
                lz = cz - t * drop
                r_leaf = (1.0 - t * 0.42) * 0.26
                mat_key = "Lotus_Foliage_Bright" if s % 2 == 0 else "Lotus_Foliage_Dark"
                add_lowpoly_sphere(bms[mat_key], vx, vy, lz, r_leaf, r_leaf, r_leaf * 1.25, subdivisions=1, jitter=0.2, seed=seed + i * 7 + s)
                if s in (0, 1, 2) and vrng.random() < 0.72:
                    fx = vx + math.cos(ang) * 0.15
                    fy = vy + math.sin(ang) * 0.15
                    add_lowpoly_sphere(bms["Lotus_Flower_Pink"], fx, fy, lz, 0.12, 0.12, 0.10, subdivisions=1, jitter=0.1, seed=seed + i)

    # =========================================================================
    # 1. TERRACED RETAINING WALLS (Grounded down into the deep lagoon bed!)
    # =========================================================================
    # Upper Rear Terrace Platform (Y from +3.2 to +11.2, Z from -2.4 to +3.0)
    add_box(bms["Lotus_Marble_Dark"], 0.0, 7.2, 0.30, 16.5, 8.2, 5.4)
    add_box(bms["Lotus_Marble_Cream"], 0.0, 7.2, 3.1, 16.8, 8.5, 0.24)

    # Central 8-Step Grand Staircase + Solid Waterfall Cliff Base
    add_box(bms["Lotus_Rock_Grey"], 0.0, 2.6, -0.45, 4.8, 2.8, 3.38)
    add_box(bms["Lotus_Marble_Cream"], 0.0, 1.85, 1.24, 4.4, 1.6, 0.20)
    steps_main = 8
    for s in range(steps_main):
        t = s / steps_main
        sy = 2.25 + t * 2.05
        sz = 1.35 + (s + 1) * (1.85 / steps_main)
        add_box(bms["Lotus_Marble_Cream"], 0.0, sy, sz * 0.5 + 0.6, 3.8, 0.38, sz - 1.1)
    for side in (-1.0, 1.0):
        sx = side * 2.15
        add_balustrade(sx, 1.6, 1.2, sx, 4.3, 3.15, n_posts=5, with_pier_start=True, with_pier_end=True, lantern_start=True, lantern_end=True)

    # Left & Right Mid-Tier Pavilion Terraces (X = ±9.2, Y = -0.2, Z from -2.4 to +1.65)
    for side in (-1.0, 1.0):
        tx = side * 9.2
        add_box(bms["Lotus_Marble_Dark"], tx, 0.2, -0.42, 6.8, 7.6, 3.96)
        add_box(bms["Lotus_Marble_Cream"], tx, 0.2, 1.62, 7.0, 7.8, 0.20)
        # Solid grounded side staircase descending to pond edge
        for st in range(6):
            st_t = (st + 1) / 6.0
            step_h = 0.15 + st_t * 1.50
            step_x = tx - side * (3.5 + (1.0 - st_t) * 1.8)
            add_box(bms["Lotus_Marble_Cream"], step_x, -0.6, step_h * 0.5, 0.42, 2.8, step_h)
        add_balustrade(tx - side * 3.2, -3.5, 1.65, tx - side * 3.2, 3.6, 1.65, n_posts=6, lantern_start=True, lantern_end=True)
        add_balustrade(tx - side * 1.2, 3.6, 1.65, side * 5.6, 4.6, 3.15, n_posts=5, lantern_start=False, lantern_end=True)

    # =========================================================================
    # 2. UPPER CENTRAL GRAND ROTUNDA GAZEBO (8 Columns, Curved Arches, Ribbed Dome)
    # =========================================================================
    rot_x, rot_y, rot_z = 0.0, 7.2, 3.22
    add_cylinder(bms["Lotus_Marble_Cream"], rot_x, rot_y, rot_z + 0.16, 4.4, 4.2, 0.32, segs=24)
    add_cylinder(bms["Lotus_Marble_Dark"], rot_x, rot_y, rot_z + 0.40, 4.0, 3.9, 0.20, segs=24)
    rot_floor_z = rot_z + 0.50
    col_h = 3.45
    n_rot_cols = 8
    rot_r = 3.45
    rot_col_pts = []
    for i in range(n_rot_cols):
        ang = (i / n_rot_cols) * math.tau + (math.pi / n_rot_cols)
        cx = rot_x + math.cos(ang) * rot_r
        cy = rot_y + math.sin(ang) * rot_r
        rot_col_pts.append((cx, cy, ang))
        add_column(cx, cy, rot_floor_z, height=col_h, radius=0.24)

    for i in range(n_rot_cols):
        x1, y1, _ = rot_col_pts[i]
        x2, y2, _ = rot_col_pts[(i + 1) % n_rot_cols]
        add_arch_span(x1, y1, x2, y2, rot_floor_z + col_h, arch_drop=0.72, thickness=0.36)

    ent_z = rot_floor_z + col_h
    add_cylinder(bms["Lotus_Marble_Cream"], rot_x, rot_y, ent_z + 0.26, 3.85, 3.95, 0.52, segs=24)
    add_cylinder(bms["Lotus_Gold_Trim"], rot_x, rot_y, ent_z + 0.56, 4.05, 4.08, 0.12, segs=24)
    add_cylinder(bms["Lotus_Marble_Dark"], rot_x, rot_y, ent_z + 0.72, 4.12, 3.90, 0.20, segs=24)

    # Ribbed Slate-Blue Dome + Continuous Gold Ribs + Golden Finial Spire
    dome_base_z = ent_z + 0.82
    dome_layers = 8
    dome_r = 3.70
    dome_h = 2.35
    for dl in range(dome_layers):
        t0 = dl / dome_layers
        t1 = (dl + 1) / dome_layers
        r0 = dome_r * math.cos(t0 * math.pi * 0.48)
        r1 = dome_r * math.cos(t1 * math.pi * 0.48)
        z0 = dome_base_z + dome_h * math.sin(t0 * math.pi * 0.48)
        z1 = dome_base_z + dome_h * math.sin(t1 * math.pi * 0.48)
        add_cylinder(bms["Lotus_Slate_Roof"], rot_x, rot_y, (z0 + z1) * 0.5, r0, r1, z1 - z0, segs=16)

    for i in range(n_rot_cols):
        _, _, ang = rot_col_pts[i]
        for dl in range(dome_layers):
            t0 = dl / dome_layers
            t1 = (dl + 1) / dome_layers
            tm = (t0 + t1) * 0.5
            r0 = (dome_r + 0.05) * math.cos(t0 * math.pi * 0.48)
            r1 = (dome_r + 0.05) * math.cos(t1 * math.pi * 0.48)
            z0 = dome_base_z + dome_h * math.sin(t0 * math.pi * 0.48)
            z1 = dome_base_z + dome_h * math.sin(t1 * math.pi * 0.48)
            rm = (r0 + r1) * 0.5
            zm = (z0 + z1) * 0.5
            seg_len = math.hypot(r1 - r0, z1 - z0)
            tilt = math.atan2(r0 - r1, z1 - z0)
            rx = rot_x + math.cos(ang) * rm
            ry = rot_y + math.sin(ang) * rm
            add_box(bms["Lotus_Gold_Trim"], rx, ry, zm, 0.14, 0.14, seg_len + 0.04, ry=-tilt, rz=ang)

    spire_z = dome_base_z + dome_h
    add_cylinder(bms["Lotus_Gold_Trim"], rot_x, rot_y, spire_z + 0.16, 0.62, 0.32, 0.32, segs=12)
    add_lowpoly_sphere(bms["Lotus_Gold_Trim"], rot_x, rot_y, spire_z + 0.48, 0.35, 0.35, 0.30, subdivisions=2, jitter=0.0)
    add_cylinder(bms["Lotus_Gold_Trim"], rot_x, rot_y, spire_z + 0.96, 0.15, 0.02, 0.78, segs=10)
    add_lantern(rot_x, rot_y, rot_floor_z, scale=1.15)
    add_vine_garland(rot_x, rot_y, ent_z + 0.22, radius=3.92, count=20, seed=101)

    # =========================================================================
    # 3. LEFT & RIGHT FLANKING PAVILIONS (6 Columns, Arches, Ribbed Roof, Finial)
    # =========================================================================
    for side in (-1.0, 1.0):
        px, py, pz = side * 9.2, 0.2, 1.72
        add_cylinder(bms["Lotus_Marble_Cream"], px, py, pz + 0.15, 2.75, 2.62, 0.30, segs=6)
        p_floor = pz + 0.30
        p_col_h = 2.65
        p_r = 2.22
        p_pts = []
        for i in range(6):
            ang = (i / 6.0) * math.tau + math.pi / 6.0
            cx = px + math.cos(ang) * p_r
            cy = py + math.sin(ang) * p_r
            p_pts.append((cx, cy, ang))
            add_column(cx, cy, p_floor, height=p_col_h, radius=0.18)
        for i in range(6):
            x1, y1, _ = p_pts[i]
            x2, y2, _ = p_pts[(i + 1) % 6]
            add_arch_span(x1, y1, x2, y2, p_floor + p_col_h, arch_drop=0.52, thickness=0.28)
        p_ent_z = p_floor + p_col_h
        add_cylinder(bms["Lotus_Marble_Cream"], px, py, p_ent_z + 0.20, 2.55, 2.65, 0.40, segs=6)
        add_cylinder(bms["Lotus_Gold_Trim"], px, py, p_ent_z + 0.44, 2.72, 2.72, 0.09, segs=6)
        add_cylinder(bms["Lotus_Slate_Roof"], px, py, p_ent_z + 1.18, 2.82, 0.32, 1.40, segs=6)
        # 6 Gold Roof Ribs on Pavilion
        for _, _, ang in p_pts:
            rm = 1.58
            zm = p_ent_z + 1.18
            tilt = math.atan2(2.50, 1.40)
            add_box(bms["Lotus_Gold_Trim"], px + math.cos(ang) * rm, py + math.sin(ang) * rm, zm, 0.10, 0.10, 2.86, ry=-tilt, rz=ang)
        add_cylinder(bms["Lotus_Gold_Trim"], px, py, p_ent_z + 2.02, 0.36, 0.14, 0.32, segs=8)
        add_lowpoly_sphere(bms["Lotus_Gold_Trim"], px, py, p_ent_z + 2.28, 0.24, 0.24, 0.22, subdivisions=2, jitter=0.0)
        add_cylinder(bms["Lotus_Gold_Trim"], px, py, p_ent_z + 2.68, 0.11, 0.01, 0.62, segs=8)
        add_lantern(px, py, p_floor, scale=0.92)
        add_vine_garland(px, py, p_ent_z + 0.18, radius=2.58, count=14, seed=200 + int(side * 10))

    # =========================================================================
    # 4. FOREGROUND DIAGONAL CAUSEWAY & ARCHED STONE BRIDGE WITH LANTERNS
    # =========================================================================
    bridge_pts = []
    n_seg = 18
    for i in range(n_seg + 1):
        t = i / n_seg
        bx = 7.8 - t * 16.6
        by = -10.2 + t * 5.4
        arch_t = max(0.0, min(1.0, (t - 0.42) / 0.52))
        bz = 0.48 + math.sin(arch_t * math.pi) * 1.35
        bridge_pts.append((bx, by, bz))

    for i in range(n_seg):
        x1, y1, z1 = bridge_pts[i]
        x2, y2, z2 = bridge_pts[i + 1]
        mx, my, mz = (x1 + x2) * 0.5, (y1 + y2) * 0.5, (z1 + z2) * 0.5
        dx, dy, dz = x2 - x1, y2 - y1, z2 - z1
        seg_len = math.hypot(dx, dy)
        yaw = math.atan2(dy, dx)
        pitch = -math.atan2(dz, seg_len)
        add_box(bms["Lotus_Marble_Cream"], mx, my, mz, seg_len + 0.08, 2.75, 0.28, ry=pitch, rz=yaw)
        add_box(bms["Lotus_Marble_Dark"], mx, my, mz - 0.24, seg_len + 0.06, 2.45, 0.34, ry=pitch, rz=yaw)

    nx = -5.4 / math.hypot(-16.6, 5.4)
    ny = -16.6 / math.hypot(-16.6, 5.4)
    pier_indices = [0, 5, 9, 13, 17]
    for p_idx in range(len(pier_indices) - 1):
        i0 = pier_indices[p_idx]
        i1 = pier_indices[p_idx + 1]
        x1, y1, z1 = bridge_pts[i0]
        x2, y2, z2 = bridge_pts[i1]
        for side in (-1.0, 1.0):
            ox, oy = side * nx * 1.25, side * ny * 1.25
            add_balustrade(
                x1 + ox,
                y1 + oy,
                z1 + 0.12,
                x2 + ox,
                y2 + oy,
                z2 + 0.12,
                n_posts=4,
                with_pier_start=(p_idx == 0),
                with_pier_end=True,
                lantern_start=(p_idx == 0),
                lantern_end=True,
            )
    # Underwater bridge support pilings at both ends & arch abutments
    for p_i in (0, 5, 9, 17):
        bx, by, bz = bridge_pts[p_i]
        for side in (-1.0, 1.0):
            ox, oy = side * nx * 1.15, side * ny * 1.15
            add_box(bms["Lotus_Marble_Dark"], bx + ox, by + oy, (bz - 2.2) * 0.5, 0.68, 0.68, bz + 2.2)

    # =========================================================================
    # 5. THREE CASCADING WATERFALLS & NON-OVERLAPPING CLIFF BOULDERS
    # =========================================================================
    for wf in range(7):
        wx = (wf - 3) * 0.42
        add_box(bms["Lotus_Waterfall_Foam"], wx, 1.02, 0.62, 0.36, 0.22, 1.22)
    add_cylinder(bms["Lotus_Waterfall_Foam"], 0.0, 0.72, 0.06, 1.55, 1.38, 0.08, segs=16)

    for side in (-1.0, 1.0):
        add_box(bms["Lotus_Waterfall_Foam"], side * 4.6, 2.1, 1.05, 1.10, 0.42, 2.0)
        add_cylinder(bms["Lotus_Waterfall_Foam"], side * 4.6, 1.65, 0.06, 0.90, 0.80, 0.08, segs=12)

    # Carefully placed boulders strictly in clear pockets — zero overlap with bridge, stairs, waterfalls, or pads!
    rock_clusters = [
        # Cliff pockets strictly between central stairs (|x|=2.35) and side waterfalls (|x|=3.95)
        (-3.15, 2.35, 0.58, 0.68, 0.58, 0.62),
        (3.15, 2.35, 0.58, 0.68, 0.58, 0.62),
        # Far-left and far-right shoreline banks outside the stairs and bridge
        (-8.5, -2.6, 0.38, 0.78, 0.68, 0.52),
        (8.5, -5.0, 0.38, 0.78, 0.68, 0.52),
    ]
    for idx, (rx, ry, rz, sx, sy, sz) in enumerate(rock_clusters):
        add_lowpoly_sphere(bms["Lotus_Rock_Grey"], rx, ry, rz, sx, sy, sz, subdivisions=1, jitter=0.18, seed=300 + idx)

    # =========================================================================
    # 6. BLOOMING PINK LOTUS FLOWERS & FLOATING LILY PADS ACROSS THE LAGOON
    # =========================================================================
    def add_lotus_flower(lx, ly, scale=1.0, seed=1):
        add_cylinder(bms["Lotus_Pad_Green"], lx, ly, 0.09, 0.58 * scale, 0.56 * scale, 0.04, segs=12)
        for ring, n_petals, tilt, r_dist, p_len in ((0, 8, 0.35, 0.22, 0.34), (1, 6, 0.72, 0.14, 0.28)):
            for p in range(n_petals):
                ang = (p / n_petals) * math.tau + ring * 0.4
                px = lx + math.cos(ang) * r_dist * scale
                py = ly + math.sin(ang) * r_dist * scale
                pz = 0.16 + ring * 0.08 * scale
                ret = bmesh.ops.create_cone(
                    bms["Lotus_Flower_Pink"],
                    cap_ends=True,
                    cap_tris=False,
                    segments=6,
                    radius1=0.12 * scale,
                    radius2=0.02 * scale,
                    depth=p_len * scale,
                )
                vs = ret["verts"]
                bmesh.ops.rotate(
                    bms["Lotus_Flower_Pink"],
                    cent=(0, 0, 0),
                    matrix=Euler((math.pi * 0.5 - tilt, 0.0, ang - math.pi * 0.5), "XYZ").to_matrix(),
                    verts=vs,
                )
                bmesh.ops.translate(bms["Lotus_Flower_Pink"], vec=(px, py, pz), verts=vs)
        add_lowpoly_sphere(bms["Lotus_Flower_Core"], lx, ly, 0.22 * scale, 0.13 * scale, 0.13 * scale, 0.10 * scale, subdivisions=1, jitter=0.05, seed=seed)

    lotus_positions = [
        (-2.6, 0.1, 1.18),
        (-1.4, -2.0, 1.22),
        (0.8, -0.6, 1.10),
        (2.4, -1.4, 1.20),
        (-3.6, -3.1, 1.05),
        (-1.1, -3.9, 0.95),
        (0.7, -3.3, 1.15),
        (2.2, -3.0, 0.92),
        (3.7, -3.6, 1.18),
        (5.2, -4.6, 1.12),
        (2.8, -5.6, 1.15),
        (0.5, -5.1, 1.12),
        (-1.2, -5.4, 1.05),
        # Outer lagoon blossoms (in front of bridge and in side coves)
        (-6.2, -8.2, 1.22),
        (-3.2, -9.8, 1.15),
        (0.8, -11.2, 1.18),
        (-11.2, -6.2, 1.15),
        (11.4, -6.8, 1.18),
    ]
    for idx, (lx, ly, lscale) in enumerate(lotus_positions):
        add_lotus_flower(lx, ly, scale=lscale, seed=500 + idx)

    placed_pads = [(lx, ly, 0.62 * lscale) for lx, ly, lscale in lotus_positions]
    for i in range(68):
        px = rng.uniform(-11.8, 11.8)
        py = rng.uniform(-12.2, 0.4)
        pr = rng.uniform(0.26, 0.52)
        # Keep clear of waterfalls, side stairs, side terraces, bridge, rocks, and existing pads
        if math.hypot(px, py - 0.72) < 1.95:
            continue
        if math.hypot(abs(px) - 4.6, py - 1.65) < 1.45:
            continue
        if abs(px) > 5.4 and py > -4.2:
            continue
        if abs(px) > 3.2 and -2.2 < py < 1.0:
            continue
        # Keep clear of foreground right bridge entrance peninsula (x around 6..8, y around -10..-13)
        if px > 3.5 and py < -8.2:
            continue
        bridge_dist = abs((px - 7.8) * 5.4 - (py + 10.2) * (-16.6)) / math.hypot(16.6, 5.4)
        if bridge_dist < 2.2 and -9.5 < px < 8.5:
            continue
        if any(math.hypot(px - rx, py - ry) < sx + pr + 0.35 for rx, ry, _, sx, _, _ in rock_clusters):
            continue
        if any(math.hypot(px - ox, py - oy) < orad + pr + 0.18 for ox, oy, orad in placed_pads):
            continue
        placed_pads.append((px, py, pr))
        add_cylinder(bms["Lotus_Pad_Green"], px, py, 0.085, pr, pr * 0.96, 0.03, segs=10)

    for name, bm in bms.items():
        if len(bm.verts) > 0:
            link_mesh(name, bm, mats[name])
        else:
            bm.free()

    # =========================================================================
    # 7. EXPORT GLB FOR THREE.JS (Uses existing vegetation.js trees in Three.js!)
    # =========================================================================
    out_glb = os.path.join(WORKSPACE_DIR, "public", "lotus-garden.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format="GLB",
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_apply=True,
    )
    print(f"Exported Lotus Garden GLB to: {out_glb}")

    # =========================================================================
    # 8. ADD CLEAN NON-OVERLAPPING FRAMING TREES IN BLENDER VIEWPORT (Matching vegetation.js)
    # =========================================================================
    tree_bms = {
        "Lotus_Wood_Bark": bmesh.new(),
        "Lotus_Cypress_Green": bmesh.new(),
        "Lotus_Foliage_Bright": bmesh.new(),
    }

    def add_code_pine(x, y, z, scale=1.0):
        # Matches createPineGeometry() + trunkGeometry in src/world/vegetation.js
        add_cylinder(tree_bms["Lotus_Wood_Bark"], x, y, z + 1.3 * scale, 0.30 * scale, 0.16 * scale, 2.6 * scale, segs=6)
        for radius, height, ly in ((1.7, 2.4, 2.0), (1.3, 2.1, 3.2), (0.85, 1.8, 4.3)):
            add_cylinder(tree_bms["Lotus_Cypress_Green"], x, y, z + ly * scale, radius * scale, 0.02 * scale, height * scale, segs=7)

    def add_code_tree(x, y, z, scale=1.0, seed=1):
        # Matches trunk + dual-crown tree in src/world/vegetation.js
        add_cylinder(tree_bms["Lotus_Wood_Bark"], x, y, z + 1.3 * scale, 0.30 * scale, 0.16 * scale, 2.6 * scale, segs=6)
        add_lowpoly_sphere(tree_bms["Lotus_Foliage_Bright"], x, y, z + 3.1 * scale, 1.55 * scale, 1.55 * scale, 1.35 * scale, subdivisions=2, jitter=0.12, seed=seed)
        add_lowpoly_sphere(tree_bms["Lotus_Cypress_Green"], x + 0.35 * scale, y - 0.25 * scale, z + 4.0 * scale, 1.10 * scale, 1.10 * scale, 0.95 * scale, subdivisions=2, jitter=0.12, seed=seed + 7)

    # Placed strictly on open back terrace corners — zero overlap with roofs, lanterns, or columns
    for px, py, pz, ps in (
        (-7.4, 7.8, 3.22, 0.82),
        (7.4, 7.8, 3.22, 0.82),
        (-7.2, 10.0, 3.22, 0.92),
        (7.2, 10.0, 3.22, 0.92),
    ):
        add_code_pine(px, py, pz, scale=ps)

    for idx, (tx, ty, tz, ts) in enumerate((
        (-5.2, 9.6, 3.22, 0.92),
        (5.2, 9.6, 3.22, 0.92),
    )):
        add_code_tree(tx, ty, tz, scale=ts, seed=700 + idx)

    for tname, tbm in tree_bms.items():
        if len(tbm.verts) > 0:
            link_mesh(f"{tname}_Trees", tbm, mats[tname])
        else:
            tbm.free()

    scene = bpy.context.scene
    world = scene.world or bpy.data.worlds.new("LotusWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.045, 0.052, 0.075, 1.0)
        bg.inputs[1].default_value = 0.72

    sun_data = bpy.data.lights.new(name="Lotus_Sun", type="SUN")
    sun_data.energy = 0.65
    sun_data.color = (0.82, 0.87, 1.0)
    sun_obj = bpy.data.objects.new(name="Lotus_Sun", object_data=sun_data)
    sun_obj.rotation_euler = Euler((math.radians(48), math.radians(-18), math.radians(28)), "XYZ")
    scene.collection.objects.link(sun_obj)

    # Spawn an individual Point Light inside EVERY single lamp with localized falloff!
    for idx, (lx, ly, lz, lscale) in enumerate(lantern_positions):
        pt_data = bpy.data.lights.new(name=f"Lotus_LampLight_{idx:02d}", type="POINT")
        pt_data.energy = 135.0 * lscale
        pt_data.color = (1.0, 0.55, 0.14)
        pt_data.shadow_soft_size = 0.25 * lscale
        pt_data.use_shadow = False
        if hasattr(pt_data, "use_custom_distance"):
            pt_data.use_custom_distance = True
            pt_data.cutoff_distance = 4.2 * lscale
        pt_obj = bpy.data.objects.new(name=f"Lotus_LampLight_{idx:02d}", object_data=pt_data)
        pt_obj.location = Vector((lx, ly, lz + 0.12 * lscale))
        scene.collection.objects.link(pt_obj)
    print(f"Created {len(lantern_positions)} individual lamp point lights:", [(round(x, 2), round(y, 2), round(z, 2)) for x, y, z, _ in lantern_positions])

    # Hero Camera framing the full spire, pavilions, waterfalls, and bridge
    cam_data = bpy.data.cameras.new("Lotus_HeroCam")
    cam_data.lens = 30.0
    cam_obj = bpy.data.objects.new("Lotus_HeroCam", cam_data)
    cam_obj.location = Vector((1.2, -24.0, 10.8))
    direction = Vector((0.0, 0.8, 3.2)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    if not bpy.app.background:
        for window in bpy.context.window_manager.windows:
            for area in window.screen.areas:
                if area.type == "VIEW_3D":
                    for space in area.spaces:
                        if space.type == "VIEW_3D":
                            space.shading.type = "MATERIAL"
                            space.shading.use_scene_lights = True
                            space.shading.use_scene_world = True
                            space.region_3d.view_perspective = "CAMERA"
                    area.tag_redraw()

        render_dir = os.path.join(WORKSPACE_DIR, "scripts", "blender_live", "renders")
        os.makedirs(render_dir, exist_ok=True)
        for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "WORKBENCH"):
            try:
                scene.render.engine = eng
                break
            except Exception:
                continue
        scene.render.resolution_x = 1280
        scene.render.resolution_y = 832
        hero_path = os.path.join(render_dir, "lotus_garden_hero.png")
        scene.render.filepath = hero_path
        bpy.ops.render.render(write_still=True)
        print(f"Rendered Hero Preview V2 to: {hero_path}")


if __name__ == "__main__":
    build_lotus_garden()
