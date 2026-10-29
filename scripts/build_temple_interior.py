import bpy
import bmesh
import math
import os
from mathutils import Vector, Euler, Matrix

# ==============================================================================
# TEMPLE OF TRIBULATIONS — DEDICATED INDOOR SANCTUARY DUNGEON LEVEL BUILDER
# Built specifically to match:
#   - INTERIOR - MAIN VIEW (FROM ENTRANCE)
#   - INTERIOR - ALTAR VIEW
#   - INTERIOR - SIDE VIEW
# Human-scale monumental hall: 32m (W) x 38m (D) x 15m (H)
# Exports to: public/temple-interior.glb
# ==============================================================================

if "WORKSPACE_DIR" not in globals():
    WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(WORKSPACE_DIR, "public")


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in list(bpy.data.meshes):
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        if block.users == 0:
            bpy.data.materials.remove(block)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def make_mat(name, hex_color, roughness=0.4, metallic=0.0, emission_hex=None, emission_strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name=name)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    h = hex_color.lstrip("#")
    r, g, b = [srgb_to_linear(int(h[i:i+2], 16) / 255.0) for i in (0, 2, 4)]
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission_hex and emission_strength > 0:
        eh = emission_hex.lstrip("#")
        er, eg, eb = [srgb_to_linear(int(eh[i:i+2], 16) / 255.0) for i in (0, 2, 4)]
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (er, eg, eb, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


class Builder:
    def __init__(self, name, material):
        self.name = name
        self.material = material
        self.bm = bmesh.new()

    def add_box(self, sx, sy, sz, center=(0, 0, 0), rot=(0, 0, 0)):
        mat = Matrix.Translation(Vector(center)) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((sx, sy, sz, 1.0))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=mat)

    def add_cyl(self, r1, r2, h, segs=16, center=(0, 0, 0), rot=(0, 0, 0), cap_ends=True):
        mat = Matrix.Translation(Vector(center)) @ Euler(rot, "XYZ").to_matrix().to_4x4()
        bmesh.ops.create_cone(self.bm, cap_ends=cap_ends, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h, matrix=mat)

    def add_ring(self, r_inner, r_outer, depth, segs=32, center=(0, 0, 0), orientation="Z", arc_pi=2.0):
        cx, cy, cz = center
        hd = depth * 0.5
        is_full = abs(arc_pi - 2.0) < 1e-4
        count = segs if is_full else segs + 1
        f_in, f_out, b_in, b_out = [], [], [], []
        for i in range(count):
            ang = (i / segs) * math.pi * arc_pi
            ca, sa = math.cos(ang), math.sin(ang)
            if orientation == "Z":
                p_fi = (cx + ca * r_inner, cy + sa * r_inner, cz - hd)
                p_fo = (cx + ca * r_outer, cy + sa * r_outer, cz - hd)
                p_bi = (cx + ca * r_inner, cy + sa * r_inner, cz + hd)
                p_bo = (cx + ca * r_outer, cy + sa * r_outer, cz + hd)
            elif orientation == "Y":
                p_fi = (cx + ca * r_inner, cy - hd, cz + sa * r_inner)
                p_fo = (cx + ca * r_outer, cy - hd, cz + sa * r_outer)
                p_bi = (cx + ca * r_inner, cy + hd, cz + sa * r_inner)
                p_bo = (cx + ca * r_outer, cy + hd, cz + sa * r_outer)
            else:
                p_fi = (cx - hd, cy + ca * r_inner, cz + sa * r_inner)
                p_fo = (cx - hd, cy + ca * r_outer, cz + sa * r_outer)
                p_bi = (cx + hd, cy + ca * r_inner, cz + sa * r_inner)
                p_bo = (cx + hd, cy + ca * r_outer, cz + sa * r_outer)
            f_in.append(self.bm.verts.new(p_fi))
            f_out.append(self.bm.verts.new(p_fo))
            b_in.append(self.bm.verts.new(p_bi))
            b_out.append(self.bm.verts.new(p_bo))

        for i in range(segs):
            ni = (i + 1) % segs if is_full else i + 1
            self.bm.faces.new((f_in[i], f_out[i], f_out[ni], f_in[ni]))
            self.bm.faces.new((b_in[ni], b_out[ni], b_out[i], b_in[i]))
            self.bm.faces.new((f_out[i], b_out[i], b_out[ni], f_out[ni]))
            self.bm.faces.new((f_in[ni], b_in[ni], b_in[i], f_in[i]))
        if not is_full:
            self.bm.faces.new((f_in[0], b_in[0], b_out[0], f_out[0]))
            self.bm.faces.new((f_out[-1], b_out[-1], b_in[-1], f_in[-1]))

    def add_fluted_shaft(self, r_bottom, r_top, height, flutes=18, center=(0, 0, 0)):
        cx, cy, cz = center
        rings = 5
        n_verts = flutes * 2
        ring_verts = []
        for r_idx in range(rings):
            t = r_idx / (rings - 1)
            z = cz - height * 0.5 + t * height
            entasis = math.sin(t * math.pi) * 0.03
            base_r = r_bottom * (1.0 - t) + r_top * t + entasis
            row = []
            for i in range(n_verts):
                ang = (i / n_verts) * math.pi * 2.0
                rad = base_r if (i % 2 == 0) else base_r * 0.935
                row.append(self.bm.verts.new((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad, z)))
            ring_verts.append(row)
        for r_idx in range(rings - 1):
            rA, rB = ring_verts[r_idx], ring_verts[r_idx + 1]
            for i in range(n_verts):
                ni = (i + 1) % n_verts
                self.bm.faces.new((rA[i], rA[ni], rB[ni], rB[i]))
        self.bm.faces.new(list(reversed(ring_verts[0])))
        self.bm.faces.new(ring_verts[-1])

    def add_banner_cloth(self, width, rect_h, tip_h, thickness, center_top=(0, 0, 0), facing="X"):
        cx, cy, z_top = center_top
        hw = width * 0.5
        ht = thickness * 0.5
        z_mid = z_top - rect_h
        z_bot = z_mid - tip_h
        if facing == "Y":
            f_pts = [(cx - hw, cy - ht, z_top), (cx + hw, cy - ht, z_top), (cx + hw, cy - ht, z_mid), (cx, cy - ht, z_bot), (cx - hw, cy - ht, z_mid)]
            b_pts = [(p[0], cy + ht, p[2]) for p in f_pts]
        else:
            f_pts = [(cx - ht, cy - hw, z_top), (cx - ht, cy + hw, z_top), (cx - ht, cy + hw, z_mid), (cx - ht, cy, z_bot), (cx - ht, cy - hw, z_mid)]
            b_pts = [(cx + ht, p[1], p[2]) for p in f_pts]
        fv = [self.bm.verts.new(p) for p in f_pts]
        bv = [self.bm.verts.new(p) for p in b_pts]
        self.bm.faces.new(fv)
        self.bm.faces.new(list(reversed(bv)))
        for i in range(5):
            ni = (i + 1) % 5
            self.bm.faces.new((fv[i], bv[i], bv[ni], fv[ni]))

    def finalize(self, col):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        obj.data.materials.append(self.material)
        col.objects.link(obj)
        return obj


def add_compass_wheel(gold_b, center, radius, thickness=0.12, orientation="Y", rays=8):
    cx, cy, cz = center
    base_rot = Euler((math.pi * 0.5, 0, 0), "XYZ") if orientation == "Y" else (Euler((math.pi * 0.5, 0, math.pi * 0.5), "XYZ") if orientation == "X" else Euler((0, 0, 0), "XYZ"))
    gold_b.add_cyl(radius * 0.20, radius * 0.14, thickness * 1.45, segs=20, center=center, rot=base_rot)
    gold_b.add_ring(radius * 0.68, radius * 0.78, thickness, segs=32, center=center, orientation=orientation, arc_pi=2.0)
    gold_b.add_ring(radius * 0.36, radius * 0.42, thickness * 0.85, segs=24, center=center, orientation=orientation, arc_pi=2.0)
    for i in range(rays):
        ang = (i / rays) * math.pi * 2.0
        is_card = (i % 2 == 0)
        ray_len = radius * (1.05 if is_card else 0.86)
        ray_w = radius * (0.115 if is_card else 0.08)
        dist = ray_len * 0.5
        if orientation == "Y":
            pos = (cx + math.cos(ang) * dist, cy, cz + math.sin(ang) * dist)
            gold_b.add_cyl(ray_w, 0.012, ray_len, segs=4, center=pos, rot=(0, math.pi * 0.5 - ang, 0))
        elif orientation == "X":
            pos = (cx, cy + math.cos(ang) * dist, cz + math.sin(ang) * dist)
            gold_b.add_cyl(ray_w, 0.012, ray_len, segs=4, center=pos, rot=(-(math.pi * 0.5 - ang), 0, 0))
        else:
            pos = (cx + math.cos(ang) * dist, cy + math.sin(ang) * dist, cz)
            gold_b.add_box(ray_len, ray_w, thickness * 0.95, center=pos, rot=(0, 0, ang))


def add_interior_column(marble_b, dark_b, gold_b, blue_b, flame_b, x, y, z0, z1, radius=0.82, banner_side=0):
    """Monumental interior fluted column with stepped pedestal, gold bands, banner & twin torch sconce."""
    # Stepped pedestal base (1.15m tall, matching reference Interior Main View!)
    marble_b.add_box(radius * 2.7, radius * 2.7, 0.34, center=(x, y, z0 + 0.17))
    dark_b.add_box(radius * 2.45, radius * 2.45, 0.22, center=(x, y, z0 + 0.45))
    marble_b.add_box(radius * 2.25, radius * 2.25, 0.46, center=(x, y, z0 + 0.79))
    # Blue & Gold relief panel on pedestal face
    if banner_side != 0:
        px = x + banner_side * (radius * 1.13)
        blue_b.add_box(0.06, radius * 1.35, 0.30, center=(px, y, z0 + 0.79))
        gold_b.add_box(0.08, 0.22, 0.22, center=(px, y, z0 + 0.79), rot=(math.pi * 0.25, 0, 0))
    gold_b.add_cyl(radius * 1.16, radius * 1.08, 0.12, segs=20, center=(x, y, z0 + 1.08))
    marble_b.add_cyl(radius * 1.10, radius * 1.02, 0.14, segs=20, center=(x, y, z0 + 1.21))
    gold_b.add_cyl(radius * 1.04, radius * 1.00, 0.08, segs=20, center=(x, y, z0 + 1.32))

    # Capital (1.05m tall at top)
    cap_z0 = z1 - 1.05
    gold_b.add_cyl(radius * 0.94, radius * 0.98, 0.12, segs=20, center=(x, y, cap_z0 + 0.06))
    marble_b.add_cyl(radius * 0.92, radius * 1.26, 0.42, segs=20, center=(x, y, cap_z0 + 0.33))
    gold_b.add_cyl(radius * 1.28, radius * 1.34, 0.14, segs=20, center=(x, y, cap_z0 + 0.61))
    for vx in (-1, 1):
        for vy in (-1, 1):
            gold_b.add_box(0.32, 0.32, 0.24, center=(x + vx * radius * 0.92, y + vy * radius * 0.92, cap_z0 + 0.64))
    marble_b.add_box(radius * 2.55, radius * 2.55, 0.34, center=(x, y, cap_z0 + 0.88))

    # Fluted Shaft
    shaft_z0 = z0 + 1.36
    shaft_h = cap_z0 - shaft_z0
    marble_b.add_fluted_shaft(radius * 0.98, radius * 0.88, shaft_h, flutes=18, center=(x, y, shaft_z0 + shaft_h * 0.5))

    # Hanging Royal Blue & Gold Banner + Twin Wall Sconce on inner nave face
    if banner_side != 0:
        bx = x + banner_side * (radius * 0.98 + 0.12)
        z_top = z1 - 1.45
        b_h = 4.6
        b_w = 1.28
        rect_h = b_h * 0.78
        tip_h = b_h * 0.22
        blue_b.add_banner_cloth(b_w, rect_h, tip_h, 0.06, center_top=(bx, y, z_top), facing="X")
        gold_b.add_box(0.11, b_w * 1.24, 0.11, center=(bx, y, z_top))
        for sy in (-1, 1):
            gold_b.add_box(0.08, 0.07, rect_h, center=(bx, y + sy * (b_w * 0.47), z_top - rect_h * 0.5))
            edge_len = math.hypot(b_w * 0.47, tip_h)
            edge_ang = math.atan2(tip_h, b_w * 0.47)
            gold_b.add_box(0.08, edge_len, 0.07, center=(bx, y + sy * (b_w * 0.235), z_top - rect_h - tip_h * 0.5), rot=(sy * edge_ang, 0, 0))
        add_compass_wheel(gold_b, (bx, y, z_top - rect_h * 0.50), radius=b_w * 0.36, thickness=0.09, orientation="X")

        # Twin-flame Golden Sconce below the banner (Z = 4.2m)
        sz = 4.1
        sx_pos = x + banner_side * (radius * 0.96)
        gold_b.add_box(0.12, 0.34, 0.65, center=(sx_pos, y, sz))
        for fy_off in (-0.22, 0.22):
            gold_b.add_box(0.36, 0.08, 0.08, center=(sx_pos + banner_side * 0.18, y + fy_off, sz - 0.08))
            gold_b.add_cyl(0.08, 0.16, 0.26, segs=10, center=(sx_pos + banner_side * 0.32, y + fy_off, sz + 0.08))
            flame_b.add_cyl(0.13, 0.015, 0.38, segs=8, center=(sx_pos + banner_side * 0.32, y + fy_off, sz + 0.36))


def build_interior_level():
    clear_scene()
    scene = bpy.context.scene
    col = bpy.data.collections.new("TempleInteriorDungeon")
    scene.collection.children.link(col)

    marble_b = Builder("Dungeon_Marble_Cream", make_mat("Dungeon_Marble", "#F3E5CE", 0.38))
    dark_b = Builder("Dungeon_Marble_Dark", make_mat("Dungeon_MarbleDark", "#D8C2A3", 0.46))
    floor_b = Builder("Dungeon_Floor_Marble", make_mat("Dungeon_Floor", "#EDE1CB", 0.18))
    blue_b = Builder("Dungeon_Royal_Blue", make_mat("Dungeon_Blue", "#1C3F7A", 0.48))
    blue_dark_b = Builder("Dungeon_Royal_Blue_Dark", make_mat("Dungeon_BlueDark", "#132B56", 0.54))
    gold_b = Builder("Dungeon_Gold_Trim", make_mat("Dungeon_Gold", "#E8AD3A", 0.24, 0.88))
    wood_b = Builder("Dungeon_Bronze_Wood", make_mat("Dungeon_Wood", "#54331C", 0.45, 0.15))
    flame_b = Builder("Dungeon_Torch_Flames", make_mat("Dungeon_Flame", "#FFAE38", 0.15, 0.0, "#FF9B26", 8.0))
    glass_b = Builder("Dungeon_Skylight_Glass", make_mat("Dungeon_Glass", "#88C8FF", 0.15, 0.0, "#88C8FF", 2.0))

    # Hall Interior Dimensions:
    # X from -15.0m to +15.0m (30m wide)
    # Y from -18.0m (South Entrance Doors) to +18.0m (North Altar Apse) (36m deep)
    # Z from 0.0m (Floor) to 13.5m (Coffered Ceiling & Oculus)
    W = 30.0
    D = 36.0
    H = 13.2

    # ==========================================================================
    # 1. POLISHED MARBLE FLOOR WITH GEOMETRIC BLUE & GOLD INLAYS + 2 MEDALLIONS
    # ==========================================================================
    floor_b.add_box(W + 2.0, D + 2.0, 0.40, center=(0, 0, -0.20))

    # Longitudinal & transverse blue-and-gold floor bands (matching Interior Main View)
    for sx in (-1, 1):
        for bx in (5.6, 8.2, 13.8):
            blue_b.add_box(0.55, D - 2.0, 0.03, center=(sx * bx, 0, 0.005))
            gold_b.add_box(0.10, D - 2.0, 0.035, center=(sx * (bx - 0.28), 0, 0.008))
            gold_b.add_box(0.10, D - 2.0, 0.035, center=(sx * (bx + 0.28), 0, 0.008))
            # Gold diamond motifs along the blue border bands
            for dy in range(-14, 15, 4):
                gold_b.add_box(0.28, 0.28, 0.04, center=(sx * bx, dy, 0.01), rot=(0, 0, math.pi * 0.25))

    for by in (-15.5, -10.5, 4.8, 9.8):
        blue_b.add_box(11.2, 0.50, 0.03, center=(0, by, 0.005))
        gold_b.add_box(11.4, 0.10, 0.035, center=(0, by - 0.25, 0.008))
        gold_b.add_box(11.4, 0.10, 0.035, center=(0, by + 0.25, 0.008))

    # Primary Central Compass Rose Floor Medallion (at X=0, Y=-3.2, directly under Oculus!)
    med1_y = -3.2
    gold_b.add_ring(3.95, 4.35, 0.04, segs=48, center=(0, med1_y, 0.01), orientation="Z", arc_pi=2.0)
    blue_dark_b.add_cyl(3.98, 3.98, 0.03, segs=48, center=(0, med1_y, 0.005))
    add_compass_wheel(gold_b, (0, med1_y, 0.025), radius=3.75, thickness=0.05, orientation="Z", rays=8)

    # Secondary Golden Sunburst Medallion in front of the Sanctuary Steps (at X=0, Y=+6.8)
    med2_y = 6.8
    gold_b.add_ring(2.35, 2.65, 0.04, segs=36, center=(0, med2_y, 0.01), orientation="Z", arc_pi=2.0)
    blue_b.add_cyl(2.38, 2.38, 0.03, segs=36, center=(0, med2_y, 0.005))
    add_compass_wheel(gold_b, (0, med2_y, 0.025), radius=2.20, thickness=0.045, orientation="Z", rays=8)

    # ==========================================================================
    # 2. TWO GRAND INTERIOR COLONNADE ROWS (X = +-7.0m, 5 Columns per Row)
    # ==========================================================================
    col_ys = [-13.0, -7.2, -1.4, 4.4, 10.2]
    for sx in (-1, 1):
        cx = sx * 7.0
        for cy in col_ys:
            add_interior_column(marble_b, dark_b, gold_b, blue_b, flame_b, cx, cy, 0.0, 11.4, radius=0.80, banner_side=-sx)
        # Main longitudinal Entablature Beam above each column row (Z = 11.4 -> 13.0)
        marble_b.add_box(1.65, D, 0.85, center=(cx, 0, 11.82))
        gold_b.add_box(1.78, D, 0.14, center=(cx, 0, 11.42))
        dark_b.add_box(1.82, D, 0.55, center=(cx, 0, 12.52))
        gold_b.add_box(1.92, D, 0.12, center=(cx, 0, 12.82))

    # ==========================================================================
    # 3. PERIMETER WALLS WITH ARCHED SIDE-AISLE SHRINE ALCOVES & CLERESTORY WINDOWS
    # ==========================================================================
    # Left & Right Outer Walls (X = +-15.0m)
    for sx in (-1, 1):
        wx = sx * 15.0
        # Base dado wall + stepped side-aisle bench
        marble_b.add_box(1.2, D + 1.0, 0.55, center=(wx - sx * 0.4, 0, 0.275))
        marble_b.add_box(0.9, D + 1.0, 1.45, center=(wx, 0, 0.725))
        gold_b.add_box(1.0, D + 1.0, 0.10, center=(wx, 0, 1.48))
        # Upper clerestory wall & frieze
        marble_b.add_box(0.9, D + 1.0, 4.5, center=(wx, 0, 10.95))

        # Fluted Wall Pilasters aligned with the 5 column bays
        pilaster_ys = [-16.8, -13.0, -7.2, -1.4, 4.4, 10.2, 16.0]
        for py in pilaster_ys:
            marble_b.add_box(1.35, 1.35, 11.4, center=(wx - sx * 0.2, py, 5.70))
            gold_b.add_box(1.48, 1.48, 0.14, center=(wx - sx * 0.2, py, 1.48))
            gold_b.add_box(1.52, 1.52, 0.18, center=(wx - sx * 0.2, py, 10.85))
            # Sconce on each wall pilaster
            gold_b.add_box(0.14, 0.28, 0.55, center=(wx - sx * 0.88, py, 4.2))
            gold_b.add_cyl(0.08, 0.16, 0.25, segs=8, center=(wx - sx * 1.12, py, 4.28))
            flame_b.add_cyl(0.12, 0.015, 0.36, segs=8, center=(wx - sx * 1.12, py, 4.55))

        # 5 Deep Arched Shrine Alcoves between pilasters (matching INTERIOR - SIDE VIEW!)
        bay_ys = [-10.1, -4.3, 1.5, 7.3, 13.1]
        for by in bay_ys:
            # Recessed back wall of alcove
            dark_b.add_box(0.45, 4.4, 7.6, center=(wx + sx * 0.35, by, 5.2))
            # Arched stone surround frame
            marble_b.add_ring(1.65, 2.05, 0.65, segs=20, center=(wx - sx * 0.15, by, 5.2), orientation="X", arc_pi=1.0)
            gold_b.add_ring(1.58, 1.66, 0.68, segs=20, center=(wx - sx * 0.15, by, 5.2), orientation="X", arc_pi=1.0)
            # Side piers of arch
            for sy_arch in (-1, 1):
                marble_b.add_box(0.65, 0.42, 3.75, center=(wx - sx * 0.15, by + sy_arch * 1.85, 3.32))
            # Shrine pedestal + glowing golden brazier inside each alcove
            marble_b.add_box(0.85, 1.85, 1.15, center=(wx - sx * 0.05, by, 2.02))
            gold_b.add_box(0.95, 1.95, 0.10, center=(wx - sx * 0.05, by, 2.62))
            gold_b.add_cyl(0.16, 0.26, 0.38, segs=10, center=(wx - sx * 0.05, by, 2.86))
            flame_b.add_cyl(0.15, 0.02, 0.42, segs=8, center=(wx - sx * 0.05, by, 3.22))
            # Upper Clerestory Window above each arch with blue sky-glass
            dark_b.add_box(0.55, 2.4, 1.65, center=(wx - sx * 0.15, by, 9.65))
            glass_b.add_box(0.25, 2.0, 1.30, center=(wx, by, 9.65))

    # ==========================================================================
    # 4. SOUTH ENTRANCE WALL & GRAND BRONZE-WOOD DOUBLE DOORS (Y = -18.0m)
    # ==========================================================================
    south_y = -18.0
    marble_b.add_box(W + 1.0, 1.0, H, center=(0, south_y, H * 0.5))
    # Grand Interior Entrance Portal Frame (X = -2.8..+2.8, Z = 0..7.2)
    for sx in (-1, 1):
        marble_b.add_box(0.75, 1.45, 7.4, center=(sx * 2.95, south_y + 0.35, 3.7))
        gold_b.add_box(0.22, 1.55, 7.4, center=(sx * 2.55, south_y + 0.35, 3.7))
        # Twin doors (closed or slightly ajar)
        wood_b.add_box(2.45, 0.28, 7.0, center=(sx * 1.25, south_y + 0.45, 3.5))
        gold_b.add_box(1.85, 0.34, 5.8, center=(sx * 1.25, south_y + 0.45, 3.5))
    marble_b.add_ring(2.55, 3.15, 1.45, segs=24, center=(0, south_y + 0.35, 7.4), orientation="Y", arc_pi=1.0)
    add_compass_wheel(gold_b, (0, south_y + 0.65, 8.4), radius=1.25, thickness=0.14, orientation="Y")

    # ==========================================================================
    # 5. NORTH SANCTUARY DAIS & ALTAR OF TRIBULATIONS APSE (Y = +10.8m -> +18.0m)
    # ==========================================================================
    # 5-Step Grand Marble Sanctuary Dais spanning between the columns (Z = 0.0 -> 1.15m)
    n_steps = 5
    step_h = 0.23
    for i in range(n_steps):
        sw = 13.2 - i * 0.45
        sd = 6.8 - i * 0.55
        sy = 14.4 + i * 0.275
        sz = (i + 0.5) * step_h
        marble_b.add_box(sw, sd, step_h, center=(0, sy, sz))
        gold_b.add_box(sw + 0.06, 0.08, 0.06, center=(0, sy - sd * 0.5, sz + step_h * 0.45))

    dais_top_z = n_steps * step_h  # 1.15m

    # North Rear Wall & Monumental Coffered Triple-Arch Apse (Y = +17.8m)
    north_y = 17.8
    marble_b.add_box(W + 1.0, 1.2, H, center=(0, north_y, H * 0.5))
    # Recessed Apse Backing Wall in warm cream marble
    dark_b.add_box(10.5, 0.45, 10.8, center=(0, north_y - 0.55, 6.2))
    # Paired Fluted Sanctuary Columns framing the Altar Apse
    for sx in (-1, 1):
        for px in (4.8, 6.2):
            add_interior_column(marble_b, dark_b, gold_b, blue_b, flame_b, sx * px, north_y - 1.35, dais_top_z, 11.4, radius=0.58, banner_side=0)

    # Monumental Concentric Triple Arch framing the Altar (matching INTERIOR - ALTAR VIEW!)
    arch_center = (0, north_y - 1.15, 6.4)
    for r_in, r_out, depth in ((3.65, 4.15, 0.85), (4.25, 4.75, 1.05), (4.85, 5.45, 1.25)):
        marble_b.add_ring(r_in, r_out, depth, segs=32, center=arch_center, orientation="Y", arc_pi=1.0)
    gold_b.add_ring(4.12, 4.28, 1.12, segs=32, center=arch_center, orientation="Y", arc_pi=1.0)
    gold_b.add_ring(4.72, 4.88, 1.30, segs=32, center=arch_center, orientation="Y", arc_pi=1.0)
    # Golden Coffer Rosettes around the inner arch vault
    for i in range(9):
        ang = (i + 0.5) / 9 * math.pi
        rx = math.cos(ang) * 3.90
        rz = 6.4 + math.sin(ang) * 3.90
        gold_b.add_cyl(0.18, 0.18, 0.92, segs=10, center=(rx, north_y - 1.15, rz), rot=(math.pi * 0.5, 0, 0))

    # Giant Golden 8-Pointed Compass Wheel of Tribulations on the Rear Apse Wall!
    add_compass_wheel(gold_b, (0, north_y - 0.72, 6.55), radius=3.05, thickness=0.22, orientation="Y", rays=8)

    # 8 Glowing Golden Candelabra Braziers flanking the Altar Dais
    for bx in (-4.2, -3.1, -2.0, 2.0, 3.1, 4.2):
        gold_b.add_cyl(0.20, 0.32, 1.15, segs=12, center=(bx, 15.8, dais_top_z + 0.575))
        flame_b.add_cyl(0.22, 0.02, 0.52, segs=10, center=(bx, 15.8, dais_top_z + 1.38))

    # ==========================================================================
    # 6. COFFERED CEILING, TRANSVERSE RIBS & CIRCULAR OCULUS SKYLIGHT (Z = 13.0m)
    # ==========================================================================
    # Transverse Coffered Ceiling Beams spanning between columns
    for cy in col_ys:
        marble_b.add_box(W, 1.15, 0.75, center=(0, cy, 12.85))
        gold_b.add_box(W, 1.25, 0.12, center=(0, cy, 12.48))

    # Ceiling slabs around the central Oculus opening (at X=0, Y=-3.2, radius 3.4m)
    marble_b.add_box(W + 1.0, 11.5, 0.65, center=(0, -12.6, 13.25))
    marble_b.add_box(W + 1.0, 18.0, 0.65, center=(0, 9.2, 13.25))
    for sx in (-1, 1):
        marble_b.add_box(10.8, 7.6, 0.65, center=(sx * 9.8, med1_y, 13.25))
        # Side rectangular blue-sky skylights flanking the central oculus (matching Reference!)
        glass_b.add_box(3.2, 5.2, 0.18, center=(sx * 6.8, med1_y, 13.45))

    # Central Domed Circular Oculus Skylight Ring + Sky Glass Cap
    marble_b.add_ring(3.35, 4.25, 0.85, segs=40, center=(0, med1_y, 13.15), orientation="Z", arc_pi=2.0)
    gold_b.add_ring(3.20, 3.42, 0.92, segs=40, center=(0, med1_y, 13.15), orientation="Z", arc_pi=2.0)
    glass_b.add_cyl(3.45, 3.45, 0.15, segs=40, center=(0, med1_y, 13.65))

    objs = [
        b.finalize(col)
        for b in (marble_b, dark_b, floor_b, blue_b, blue_dark_b, gold_b, wood_b, flame_b, glass_b)
    ]

    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)

    out_path = os.path.join(PUBLIC_DIR, "temple-interior.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_apply=True,
    )
    print("Exported dedicated interior dungeon level:", out_path)


if __name__ == "__main__":
    build_interior_level()
