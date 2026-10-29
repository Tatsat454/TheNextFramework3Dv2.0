import bpy
import bmesh
import math
import os
from mathutils import Vector, Euler, Matrix

# ==============================================================================
# TEMPLE OF TRIBULATIONS — PROCEDURAL ARCHITECTURAL BUILDER (V2 REFINED)
# Exterior: 24m (W) x 20m (D) x 15m (H)
# Interior: ~18m (W) x 16m (D) x 10m (H) integrated cella & sanctuary
# ==============================================================================

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        if block.users == 0:
            bpy.data.materials.remove(block)


def make_material(name, hex_color, roughness=0.45, metallic=0.0, emission_hex=None, emission_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name=name)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")

    def srgb_to_linear(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

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

    if alpha < 1.0:
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
        elif hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"

    return mat


MATS = {}
def init_materials():
    MATS["marble"] = make_material("Marble_Cream", "#F3E5CE", roughness=0.40)
    MATS["marble_dark"] = make_material("Marble_DarkCream", "#D8C2A3", roughness=0.48)
    MATS["marble_floor"] = make_material("Marble_PolishedFloor", "#EDE1CB", roughness=0.18)
    MATS["blue"] = make_material("Royal_Blue", "#1C3F7A", roughness=0.50)
    MATS["blue_dark"] = make_material("Royal_Blue_Dark", "#132B56", roughness=0.55)
    MATS["gold"] = make_material("Gold_Trim", "#E8AD3A", roughness=0.24, metallic=0.88, emission_hex="#E8AD3A", emission_strength=0.18)
    MATS["wood"] = make_material("Bronze_Wood", "#54331C", roughness=0.46, metallic=0.15)
    MATS["flame"] = make_material("Torch_Flame", "#FFAE38", roughness=0.15, emission_hex="#FF9B26", emission_strength=10.0)
    MATS["skylight_glass"] = make_material("Skylight_Glass", "#88C8FF", roughness=0.15, emission_hex="#88C8FF", emission_strength=1.4)
    MATS["sunbeam"] = make_material("Sunbeam_Glow", "#FFE6A3", roughness=0.3, emission_hex="#FFD97D", emission_strength=1.2, alpha=0.05)


class MeshBuilder:
    def __init__(self, name, material):
        self.name = name
        self.material = material
        self.bm = bmesh.new()

    def add_box(self, size_x, size_y, size_z, center=(0, 0, 0), rot_euler=(0, 0, 0)):
        mat = Matrix.Translation(Vector(center)) @ Euler(rot_euler, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((size_x, size_y, size_z, 1.0))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=mat)

    def add_cylinder(self, r1, r2, height, segments=16, center=(0, 0, 0), rot_euler=(0, 0, 0), cap_ends=True):
        mat = Matrix.Translation(Vector(center)) @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
        bmesh.ops.create_cone(
            self.bm,
            cap_ends=cap_ends,
            cap_tris=False,
            segments=segments,
            radius1=r1,
            radius2=r2,
            depth=height,
            matrix=mat,
        )

    def add_ring(self, r_inner, r_outer, depth, segments=32, center=(0, 0, 0), orientation="Z", arc_pi=2.0):
        """
        Smooth circular ring or arch (arc_pi=2.0 for full circle, arc_pi=1.0 for semicircular arch).
        orientation:
          'Z' -> horizontal ring in X-Y plane, extruded along Z by depth
          'Y' -> vertical ring in X-Z plane, extruded along Y by depth
          'X' -> vertical ring in Y-Z plane, extruded along X by depth
        """
        cx, cy, cz = center
        hd = depth * 0.5
        is_full = abs(arc_pi - 2.0) < 1e-4
        count = segments if is_full else segments + 1

        front_in, front_out, back_in, back_out = [], [], [], []
        for i in range(count):
            ang = (i / segments) * math.pi * arc_pi
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

            front_in.append(self.bm.verts.new(p_fi))
            front_out.append(self.bm.verts.new(p_fo))
            back_in.append(self.bm.verts.new(p_bi))
            back_out.append(self.bm.verts.new(p_bo))

        for i in range(segments):
            ni = (i + 1) % segments if is_full else i + 1
            self.bm.faces.new((front_in[i], front_out[i], front_out[ni], front_in[ni]))
            self.bm.faces.new((back_in[ni], back_out[ni], back_out[i], back_in[i]))
            self.bm.faces.new((front_out[i], back_out[i], back_out[ni], front_out[ni]))
            self.bm.faces.new((front_in[ni], back_in[ni], back_in[i], front_in[i]))

        if not is_full:
            self.bm.faces.new((front_in[0], back_in[0], back_out[0], front_out[0]))
            self.bm.faces.new((front_out[-1], back_out[-1], back_in[-1], front_in[-1]))

    def add_prism_pediment(self, width, depth, height, center=(0, 0, 0)):
        cx, cy, cz = center
        hw = width * 0.5
        hd = depth * 0.5
        v0 = self.bm.verts.new((cx - hw, cy - hd, cz))
        v1 = self.bm.verts.new((cx + hw, cy - hd, cz))
        v2 = self.bm.verts.new((cx,      cy - hd, cz + height))
        v3 = self.bm.verts.new((cx - hw, cy + hd, cz))
        v4 = self.bm.verts.new((cx + hw, cy + hd, cz))
        v5 = self.bm.verts.new((cx,      cy + hd, cz + height))

        self.bm.faces.new((v0, v2, v1))
        self.bm.faces.new((v3, v4, v5))
        self.bm.faces.new((v0, v1, v4, v3))
        self.bm.faces.new((v0, v3, v5, v2))
        self.bm.faces.new((v1, v2, v5, v4))

    def add_banner_cloth(self, width, rect_h, tip_h, thickness, center_top=(0, 0, 0), facing="Y"):
        """Flat 5-sided cloth banner polygon with pointed triangular bottom."""
        cx, cy, z_top = center_top
        hw = width * 0.5
        ht = thickness * 0.5
        z_mid = z_top - rect_h
        z_bot = z_mid - tip_h

        if facing == "Y":
            f_pts = [
                (cx - hw, cy - ht, z_top),
                (cx + hw, cy - ht, z_top),
                (cx + hw, cy - ht, z_mid),
                (cx,      cy - ht, z_bot),
                (cx - hw, cy - ht, z_mid),
            ]
            b_pts = [(p[0], cy + ht, p[2]) for p in f_pts]
        else:
            f_pts = [
                (cx - ht, cy - hw, z_top),
                (cx - ht, cy + hw, z_top),
                (cx - ht, cy + hw, z_mid),
                (cx - ht, cy,      z_bot),
                (cx - ht, cy - hw, z_mid),
            ]
            b_pts = [(cx + ht, p[1], p[2]) for p in f_pts]

        fv = [self.bm.verts.new(p) for p in f_pts]
        bv = [self.bm.verts.new(p) for p in b_pts]
        self.bm.faces.new(fv)
        self.bm.faces.new(list(reversed(bv)))
        for i in range(5):
            ni = (i + 1) % 5
            self.bm.faces.new((fv[i], bv[i], bv[ni], fv[ni]))

    def add_fluted_shaft(self, r_bottom, r_top, height, flutes=16, center=(0, 0, 0)):
        cx, cy, cz = center
        rings = 5
        n_verts = flutes * 2
        ring_verts = []
        for r_idx in range(rings):
            t = r_idx / (rings - 1)
            z = cz - height * 0.5 + t * height
            entasis = math.sin(t * math.pi) * 0.024
            base_r = r_bottom * (1.0 - t) + r_top * t + entasis
            row = []
            for i in range(n_verts):
                ang = (i / n_verts) * math.pi * 2.0
                rad = base_r if (i % 2 == 0) else base_r * 0.935
                row.append(self.bm.verts.new((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad, z)))
            ring_verts.append(row)

        for r_idx in range(rings - 1):
            rA = ring_verts[r_idx]
            rB = ring_verts[r_idx + 1]
            for i in range(n_verts):
                ni = (i + 1) % n_verts
                self.bm.faces.new((rA[i], rA[ni], rB[ni], rB[i]))

        self.bm.faces.new(list(reversed(ring_verts[0])))
        self.bm.faces.new(ring_verts[-1])

    def finalize(self, collection):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        obj.data.materials.append(self.material)
        collection.objects.link(obj)
        return obj


def add_compass_wheel(gold_builder, center, radius, thickness=0.12, orientation="Y", rays=8):
    """
    Build the crisp 'Temple of Tribulations' 8-Pointed Golden Compass Rose / Sunburst Wheel
    with smooth concentric rings and beveled diamond star spikes.
    """
    cx, cy, cz = center
    if orientation == "Y":
        base_rot = Euler((math.pi * 0.5, 0, 0), "XYZ")
    elif orientation == "X":
        base_rot = Euler((math.pi * 0.5, 0, math.pi * 0.5), "XYZ")
    else:
        base_rot = Euler((0, 0, 0), "XYZ")

    # Central boss disc
    gold_builder.add_cylinder(radius * 0.20, radius * 0.14, thickness * 1.45, segments=20, center=center, rot_euler=base_rot)

    # Outer & inner smooth concentric wheel rings
    gold_builder.add_ring(radius * 0.68, radius * 0.78, thickness, segments=32, center=center, orientation=orientation, arc_pi=2.0)
    gold_builder.add_ring(radius * 0.36, radius * 0.42, thickness * 0.85, segments=24, center=center, orientation=orientation, arc_pi=2.0)

    # 8 Compass Rose Star Spikes
    for i in range(rays):
        ang = (i / rays) * math.pi * 2.0
        is_cardinal = (i % 2 == 0)
        ray_len = radius * (1.04 if is_cardinal else 0.86)
        ray_w = radius * (0.115 if is_cardinal else 0.08)
        dist = ray_len * 0.5
        if orientation == "Y":
            pos = (cx + math.cos(ang) * dist, cy, cz + math.sin(ang) * dist)
            c_rot = Euler((0, math.pi * 0.5 - ang, 0), "XYZ")
            gold_builder.add_cylinder(ray_w, 0.012, ray_len, segments=4, center=pos, rot_euler=c_rot)
        elif orientation == "X":
            pos = (cx, cy + math.cos(ang) * dist, cz + math.sin(ang) * dist)
            c_rot = Euler((-(math.pi * 0.5 - ang), 0, 0), "XYZ")
            gold_builder.add_cylinder(ray_w, 0.012, ray_len, segments=4, center=pos, rot_euler=c_rot)
        else:
            pos = (cx + math.cos(ang) * dist, cy + math.sin(ang) * dist, cz)
            gold_builder.add_box(ray_len, ray_w, thickness * 0.95, center=pos, rot_euler=(0, 0, ang))


def add_acroterion(marble_b, gold_b, x, y, z, scale=1.0):
    marble_b.add_box(0.75 * scale, 0.75 * scale, 0.38 * scale, center=(x, y, z + 0.19 * scale))
    marble_b.add_box(0.88 * scale, 0.88 * scale, 0.12 * scale, center=(x, y, z + 0.42 * scale))
    base_z = z + 0.48 * scale
    gold_b.add_cylinder(0.26 * scale, 0.14 * scale, 0.25 * scale, segments=10, center=(x, y, base_z + 0.12 * scale))
    gold_b.add_cylinder(0.22 * scale, 0.02 * scale, 0.95 * scale, segments=8, center=(x, y, base_z + 0.65 * scale))
    for sx in (-1, 1):
        gold_b.add_cylinder(
            0.14 * scale, 0.02 * scale, 0.62 * scale, segments=6,
            center=(x + sx * 0.22 * scale, y, base_z + 0.48 * scale),
            rot_euler=(0, sx * 0.38, 0),
        )


def add_column(marble_b, dark_b, gold_b, x, y, z_bottom, z_top, radius=0.58, is_square=False):
    # 1. Base plinth + moldings
    marble_b.add_box(radius * 2.55, radius * 2.55, 0.26, center=(x, y, z_bottom + 0.13))
    dark_b.add_box(radius * 2.30, radius * 2.30, 0.14, center=(x, y, z_bottom + 0.33))
    if is_square:
        marble_b.add_box(radius * 2.12, radius * 2.12, 0.16, center=(x, y, z_bottom + 0.48))
        gold_b.add_box(radius * 1.98, radius * 1.98, 0.08, center=(x, y, z_bottom + 0.60))
    else:
        marble_b.add_cylinder(radius * 1.18, radius * 1.08, 0.16, segments=16, center=(x, y, z_bottom + 0.48))
        gold_b.add_cylinder(radius * 1.05, radius * 1.02, 0.08, segments=16, center=(x, y, z_bottom + 0.60))

    # 2. Capital
    cap_bottom = z_top - 0.75
    if is_square:
        gold_b.add_box(radius * 1.98, radius * 1.98, 0.09, center=(x, y, cap_bottom + 0.045))
        marble_b.add_box(radius * 2.18, radius * 2.18, 0.28, center=(x, y, cap_bottom + 0.23))
        gold_b.add_box(radius * 2.32, radius * 2.32, 0.12, center=(x, y, cap_bottom + 0.43))
        marble_b.add_box(radius * 2.55, radius * 2.55, 0.26, center=(x, y, cap_bottom + 0.62))
    else:
        gold_b.add_cylinder(radius * 0.94, radius * 0.98, 0.09, segments=16, center=(x, y, cap_bottom + 0.045))
        marble_b.add_cylinder(radius * 0.92, radius * 1.22, 0.30, segments=16, center=(x, y, cap_bottom + 0.24))
        gold_b.add_cylinder(radius * 1.24, radius * 1.28, 0.10, segments=16, center=(x, y, cap_bottom + 0.44))
        for vx in (-1, 1):
            for vy in (-1, 1):
                gold_b.add_box(0.22, 0.22, 0.18, center=(x + vx * radius * 0.88, y + vy * radius * 0.88, cap_bottom + 0.45))
        marble_b.add_box(radius * 2.48, radius * 2.48, 0.24, center=(x, y, cap_bottom + 0.63))

    # 3. Shaft
    shaft_z0 = z_bottom + 0.64
    shaft_z1 = cap_bottom
    shaft_h = shaft_z1 - shaft_z0
    shaft_zc = (shaft_z0 + shaft_z1) * 0.5
    if is_square:
        w = radius * 1.86
        marble_b.add_box(w, w, shaft_h, center=(x, y, shaft_zc))
        for sign in (-1, 1):
            dark_b.add_box(w * 0.62, 0.05, shaft_h * 0.88, center=(x, y + sign * (w * 0.5 + 0.01), shaft_zc))
            dark_b.add_box(0.05, w * 0.62, shaft_h * 0.88, center=(x + sign * (w * 0.5 + 0.01), y, shaft_zc))
    else:
        marble_b.add_fluted_shaft(radius * 0.98, radius * 0.86, shaft_h, flutes=16, center=(x, y, shaft_zc))


def add_banner(blue_b, gold_b, x, y, z_top, height=3.6, width=1.08, facing="Y"):
    """Flat royal-blue tapestry banner with gold border trim, crossbar, pointed bottom & compass star."""
    rect_h = height * 0.78
    tip_h = height * 0.22
    blue_b.add_banner_cloth(width, rect_h, tip_h, 0.05, center_top=(x, y, z_top), facing=facing)

    if facing == "Y":
        gold_b.add_box(width * 1.24, 0.09, 0.09, center=(x, y, z_top))
        for sx in (-1, 1):
            gold_b.add_box(0.055, 0.065, rect_h, center=(x + sx * (width * 0.47), y, z_top - rect_h * 0.5))
            # Pointed bottom V-trim
            edge_len = math.hypot(width * 0.47, tip_h)
            edge_ang = math.atan2(tip_h, width * 0.47)
            gold_b.add_box(
                edge_len, 0.065, 0.055,
                center=(x + sx * (width * 0.235), y, z_top - rect_h - tip_h * 0.5),
                rot_euler=(0, -sx * edge_ang, 0),
            )
        add_compass_wheel(gold_b, (x, y, z_top - rect_h * 0.52), radius=width * 0.36, thickness=0.08, orientation="Y")
    else:
        gold_b.add_box(0.09, width * 1.24, 0.09, center=(x, y, z_top))
        for sy in (-1, 1):
            gold_b.add_box(0.065, 0.055, rect_h, center=(x, y + sy * (width * 0.47), z_top - rect_h * 0.5))
            edge_len = math.hypot(width * 0.47, tip_h)
            edge_ang = math.atan2(tip_h, width * 0.47)
            gold_b.add_box(
                0.065, edge_len, 0.055,
                center=(x, y + sy * (width * 0.235), z_top - rect_h - tip_h * 0.5),
                rot_euler=(sy * edge_ang, 0, 0),
            )
        add_compass_wheel(gold_b, (x, y, z_top - rect_h * 0.52), radius=width * 0.36, thickness=0.08, orientation="X")


def add_sconce(gold_b, flame_b, x, y, z, normal_dir=(0, -1)):
    nx, ny = normal_dir
    gold_b.add_box(0.24 if ny != 0 else 0.08, 0.08 if ny != 0 else 0.24, 0.46, center=(x, y, z))
    arm_x = x + nx * 0.18
    arm_y = y + ny * 0.18
    gold_b.add_box(0.10 if ny != 0 else 0.32, 0.32 if ny != 0 else 0.10, 0.08, center=(arm_x, arm_y, z - 0.06))
    cup_x = x + nx * 0.28
    cup_y = y + ny * 0.28
    gold_b.add_cylinder(0.06, 0.13, 0.22, segments=8, center=(cup_x, cup_y, z + 0.06))
    flame_b.add_cylinder(0.11, 0.01, 0.32, segments=8, center=(cup_x, cup_y, z + 0.28))


def build_temple():
    clear_scene()
    init_materials()

    scene = bpy.context.scene
    temple_col = bpy.data.collections.new("TempleOfTribulations")
    scene.collection.children.link(temple_col)

    marble_b = MeshBuilder("Temple_Marble_Cream", MATS["marble"])
    dark_b = MeshBuilder("Temple_Marble_Dark", MATS["marble_dark"])
    floor_b = MeshBuilder("Temple_Floor_Marble", MATS["marble_floor"])
    blue_b = MeshBuilder("Temple_Royal_Blue", MATS["blue"])
    blue_dark_b = MeshBuilder("Temple_Royal_Blue_Dark", MATS["blue_dark"])
    gold_b = MeshBuilder("Temple_Gold_Trim", MATS["gold"])
    wood_b = MeshBuilder("Temple_Bronze_Wood", MATS["wood"])
    flame_b = MeshBuilder("Temple_Torch_Flames", MATS["flame"])
    glass_b = MeshBuilder("Temple_Skylight_Glass", MATS["skylight_glass"])
    beam_b = MeshBuilder("Temple_Sunbeam_Cone", MATS["sunbeam"])

    # ==========================================================================
    # 1. STEPPED PODIUM / STYLOBATE BASE (24m W x 20m D, Z = 0.0 -> 2.20m)
    # ==========================================================================
    marble_b.add_box(24.0, 19.2, 0.36, center=(0, 0.4, 0.18))
    dark_b.add_box(23.4, 18.6, 0.24, center=(0, 0.4, 0.48))
    marble_b.add_box(22.8, 18.0, 1.24, center=(0, 0.4, 1.22))
    dark_b.add_box(23.4, 18.6, 0.14, center=(0, 0.4, 1.91))
    marble_b.add_box(23.2, 18.4, 0.22, center=(0, 0.4, 2.09))

    # Recessed Blue & Gold Panels around the Podium Base
    for sx in (-1, 1):
        for py in (-6.8, -3.6, -0.4, 2.8, 6.0):
            dark_b.add_box(0.14, 2.4, 0.88, center=(sx * 11.40, py + 0.4, 1.22))
            blue_b.add_box(0.10, 2.0, 0.62, center=(sx * 11.44, py + 0.4, 1.22))
            gold_b.add_box(0.12, 0.42, 0.42, center=(sx * 11.46, py + 0.4, 1.22), rot_euler=(math.pi * 0.25, 0, 0))
    for px in (-8.8, -5.3, -1.8, 1.8, 5.3, 8.8):
        dark_b.add_box(2.6, 0.14, 0.88, center=(px, 9.40, 1.22))
        blue_b.add_box(2.2, 0.10, 0.62, center=(px, 9.44, 1.22))
        gold_b.add_box(0.42, 0.12, 0.42, center=(px, 9.46, 1.22), rot_euler=(0, math.pi * 0.25, 0))
    for px in (-9.0, -6.4, 6.4, 9.0):
        dark_b.add_box(2.1, 0.14, 0.88, center=(px, -8.60, 1.22))
        blue_b.add_box(1.7, 0.10, 0.62, center=(px, -8.64, 1.22))
        gold_b.add_box(0.38, 0.12, 0.38, center=(px, -8.66, 1.22), rot_euler=(0, math.pi * 0.25, 0))

    # Grand Front Central Staircase
    n_steps = 8
    stair_w = 9.4
    stair_y_start = -10.8
    stair_y_end = -8.5
    for i in range(n_steps):
        t0 = i / n_steps
        z_top = (i + 1) * (2.20 / n_steps)
        y_front = stair_y_start + t0 * (stair_y_end - stair_y_start)
        depth = stair_y_end - y_front + 0.2
        yc = y_front + depth * 0.5
        marble_b.add_box(stair_w, depth, 2.20 / n_steps, center=(0, yc, z_top - (1.10 / n_steps)))

    # Stair Cheek-Wall Parapet Blocks
    for sx in (-1, 1):
        cx = sx * 5.35
        marble_b.add_box(1.45, 2.6, 0.36, center=(cx, -9.6, 0.18))
        marble_b.add_box(1.28, 2.4, 1.56, center=(cx, -9.5, 1.14))
        marble_b.add_box(1.42, 2.55, 0.24, center=(cx, -9.5, 2.04))
        blue_b.add_box(0.82, 0.10, 0.66, center=(cx, -10.71, 1.18))
        gold_b.add_box(0.36, 0.12, 0.36, center=(cx, -10.73, 1.18), rot_euler=(0, math.pi * 0.25, 0))

    # ==========================================================================
    # 2. PERISTYLE COLONNADE (Z = 2.20m -> 9.20m)
    # ==========================================================================
    col_z0 = 2.20
    col_z1 = 9.20
    corner_x = 10.4
    corner_y_front = -7.8
    corner_y_back = 8.6
    for sx in (-1, 1):
        for cy in (corner_y_front, corner_y_back):
            add_column(marble_b, dark_b, gold_b, sx * corner_x, cy, col_z0, col_z1, radius=0.60, is_square=True)

    front_col_xs = [-7.5, -4.6, -1.85, 1.85, 4.6, 7.5]
    for cx in front_col_xs:
        add_column(marble_b, dark_b, gold_b, cx, corner_y_front, col_z0, col_z1, radius=0.56, is_square=False)
        add_column(marble_b, dark_b, gold_b, cx, corner_y_back, col_z0, col_z1, radius=0.56, is_square=False)

    side_col_ys = [-4.5, -1.2, 2.1, 5.4]
    for sx in (-1, 1):
        for cy in side_col_ys:
            add_column(marble_b, dark_b, gold_b, sx * corner_x, cy, col_z0, col_z1, radius=0.56, is_square=False)

    # Hanging Exterior Blue & Gold Banners
    for cx in (-7.5, -4.6, 4.6, 7.5):
        add_banner(blue_b, gold_b, cx, corner_y_front - 0.60, z_top=7.9, height=3.6, width=1.04, facing="Y")
        add_banner(blue_b, gold_b, cx, corner_y_back + 0.60, z_top=7.9, height=3.6, width=1.04, facing="Y")

    for sx in (-1, 1):
        for cy in (-4.5, 2.1):
            add_banner(blue_b, gold_b, sx * (corner_x + 0.60), cy, z_top=7.9, height=3.5, width=1.00, facing="X")

    # ==========================================================================
    # 3. CELLA WALLS, ENTRANCE PORTAL & INTERIOR HALL
    # ==========================================================================
    floor_b.add_box(17.6, 13.8, 0.06, center=(0, 0.4, 2.21))
    for sy in (-1, 1):
        blue_b.add_box(14.4, 0.45, 0.07, center=(0, 0.4 + sy * 5.2, 2.215))
        gold_b.add_box(14.6, 0.10, 0.075, center=(0, 0.4 + sy * 5.45, 2.218))
    for sx in (-1, 1):
        blue_b.add_box(0.45, 10.8, 0.07, center=(sx * 7.0, 0.4, 2.215))
        gold_b.add_box(0.10, 11.0, 0.075, center=(sx * 7.25, 0.4, 2.218))

    # Central Floor Medallion
    med_y = -0.4
    gold_b.add_ring(2.60, 2.88, 0.07, segments=36, center=(0, med_y, 2.215), orientation="Z", arc_pi=2.0)
    blue_dark_b.add_cylinder(2.62, 2.62, 0.072, segments=36, center=(0, med_y, 2.216))
    add_compass_wheel(gold_b, (0, med_y, 2.23), radius=2.45, thickness=0.06, orientation="Z")

    wall_t = 0.55
    for sx in (-1, 1):
        wx = sx * 8.4
        marble_b.add_box(wall_t, 12.8, 1.2, center=(wx, 0.4, 2.80))
        marble_b.add_box(wall_t, 12.8, 1.8, center=(wx, 0.4, 8.30))
        pier_ys = [-5.8, -2.8, 0.4, 3.6, 6.6]
        for py in pier_ys:
            marble_b.add_box(wall_t + 0.16, 0.95, 7.0, center=(wx, py, 5.70))
            dark_b.add_box(wall_t + 0.24, 1.05, 0.35, center=(wx, py, 9.00))
        for bay_y in (-4.3, -1.2, 2.0, 5.1):
            dark_b.add_box(0.22, 2.2, 5.0, center=(wx + sx * 0.14, bay_y, 5.4))
            marble_b.add_ring(0.85, 1.08, 0.32, segments=16, center=(wx - sx * 0.12, bay_y, 5.1), orientation="X", arc_pi=1.0)
            marble_b.add_box(0.45, 1.1, 0.75, center=(wx - sx * 0.15, bay_y, 3.65))
            gold_b.add_cylinder(0.12, 0.18, 0.22, segments=8, center=(wx - sx * 0.15, bay_y, 4.15))
            flame_b.add_cylinder(0.10, 0.01, 0.28, segments=8, center=(wx - sx * 0.15, bay_y, 4.38))
            add_sconce(gold_b, flame_b, wx + sx * (wall_t * 0.5 + 0.04), bay_y, 5.2, normal_dir=(sx, 0))

    # Front Cella Wall + Open Portal
    front_wall_y = -5.8
    for sx in (-1, 1):
        marble_b.add_box(5.3, wall_t, 7.0, center=(sx * 5.35, front_wall_y, 5.70))
        for px in (sx * 2.4, sx * 5.2, sx * 7.8):
            dark_b.add_box(0.68, wall_t + 0.18, 6.8, center=(px, front_wall_y, 5.60))
        add_sconce(gold_b, flame_b, sx * 3.1, front_wall_y - wall_t * 0.5 - 0.04, 5.0, normal_dir=(0, -1))
        add_sconce(gold_b, flame_b, sx * 6.5, front_wall_y - wall_t * 0.5 - 0.04, 5.0, normal_dir=(0, -1))

    marble_b.add_box(3.8, wall_t, 2.1, center=(0, front_wall_y, 8.15))
    for sx in (-1, 1):
        marble_b.add_box(0.42, wall_t + 0.28, 4.9, center=(sx * 1.82, front_wall_y, 4.65))
        gold_b.add_box(0.14, wall_t + 0.34, 4.9, center=(sx * 1.62, front_wall_y, 4.65))
    marble_b.add_box(4.2, wall_t + 0.34, 0.38, center=(0, front_wall_y, 7.20))
    marble_b.add_ring(1.60, 1.90, wall_t + 0.30, segments=20, center=(0, front_wall_y, 7.35), orientation="Y", arc_pi=1.0)
    blue_b.add_ring(0.01, 1.60, wall_t + 0.16, segments=20, center=(0, front_wall_y, 7.35), orientation="Y", arc_pi=1.0)
    add_compass_wheel(gold_b, (0, front_wall_y - wall_t * 0.5 - 0.08, 7.95), radius=0.62, thickness=0.10, orientation="Y")

    # Paneled Double Doors (ajar inward)
    for sx in (-1, 1):
        hinge_x = sx * 1.55
        door_w = 1.48
        door_h = 4.65
        ang = sx * math.radians(62)
        dx = hinge_x - sx * math.cos(ang) * (door_w * 0.5)
        dy = front_wall_y + math.sin(abs(ang)) * (door_w * 0.5)
        wood_b.add_box(door_w, 0.14, door_h, center=(dx, dy, 2.20 + door_h * 0.5), rot_euler=(0, 0, -sx * math.radians(62)))
        gold_b.add_box(door_w * 0.75, 0.18, door_h * 0.85, center=(dx, dy, 2.20 + door_h * 0.5), rot_euler=(0, 0, -sx * math.radians(62)))

    # ==========================================================================
    # 4. REAR WALL & INTERIOR ALTAR OF TRIBULATIONS APSE
    # ==========================================================================
    back_wall_y = 6.6
    marble_b.add_box(17.2, wall_t, 7.0, center=(0, back_wall_y, 5.70))
    for sx in (-1, 1):
        marble_b.add_box(0.38, 0.25, 4.6, center=(sx * 1.65, back_wall_y + wall_t * 0.5 + 0.1, 4.50))
        add_sconce(gold_b, flame_b, sx * 3.1, back_wall_y + wall_t * 0.5 + 0.04, 5.0, normal_dir=(0, 1))
        add_sconce(gold_b, flame_b, sx * 6.5, back_wall_y + wall_t * 0.5 + 0.04, 5.0, normal_dir=(0, 1))
    wood_b.add_box(2.9, 0.12, 4.4, center=(0, back_wall_y + wall_t * 0.5 + 0.06, 4.40))
    marble_b.add_box(3.8, 0.32, 0.35, center=(0, back_wall_y + wall_t * 0.5 + 0.12, 6.85))

    # INTERIOR ALTAR VIEW: Stepped Sanctuary Dais + Concentric Arched Apse + Giant Golden Wheel
    for step_i in range(4):
        sw = 8.4 - step_i * 0.35
        sd = 2.6 - step_i * 0.42
        sz = 2.22 + (step_i + 0.5) * 0.16
        marble_b.add_box(sw, sd, 0.16, center=(0, 5.1 + step_i * 0.21, sz))
        gold_b.add_box(sw + 0.04, 0.06, 0.05, center=(0, 5.1 + step_i * 0.21 - sd * 0.5, sz + 0.06))

    marble_b.add_box(2.8, 0.95, 0.95, center=(0, 5.75, 3.32))
    gold_b.add_box(2.95, 1.05, 0.12, center=(0, 5.75, 3.82))
    for r_arch, t_arch in ((2.25, 0.24), (2.68, 0.25), (3.10, 0.28)):
        marble_b.add_ring(r_arch, r_arch + t_arch, 0.38, segments=28, center=(0, 6.22, 5.20), orientation="Y", arc_pi=1.0)
    gold_b.add_ring(2.52, 2.64, 0.42, segments=28, center=(0, 6.22, 5.20), orientation="Y", arc_pi=1.0)
    add_compass_wheel(gold_b, (0, 6.12, 5.65), radius=1.80, thickness=0.14, orientation="Y", rays=8)
    for bx in (-3.2, -2.2, -1.3, 1.3, 2.2, 3.2):
        gold_b.add_cylinder(0.14, 0.22, 0.75, segments=10, center=(bx, 5.55, 3.22))
        flame_b.add_cylinder(0.15, 0.02, 0.38, segments=8, center=(bx, 5.55, 3.75))

    # ==========================================================================
    # 5. INTERIOR COLONNADE, BANNERS & COFFERED OCULUS CEILING
    # ==========================================================================
    int_col_ys = [-3.8, -1.0, 1.8, 4.4]
    for sx in (-1, 1):
        ix = sx * 4.4
        for iy in int_col_ys:
            add_column(marble_b, dark_b, gold_b, ix, iy, 2.20, 9.20, radius=0.46, is_square=False)
            add_banner(blue_b, gold_b, ix - sx * 0.52, iy, z_top=7.8, height=3.1, width=0.86, facing="X")
            add_sconce(gold_b, flame_b, ix - sx * 0.48, iy, 4.5, normal_dir=(-sx, 0))
        marble_b.add_box(0.85, 12.6, 0.65, center=(ix, 0.4, 9.52))
        gold_b.add_box(0.92, 12.6, 0.10, center=(ix, 0.4, 9.22))

    # Coffered Interior Ceiling with Horizontal Circular Oculus Ring (Z = 9.95)
    marble_b.add_box(17.2, 4.0, 0.45, center=(0, -4.4, 9.95))
    marble_b.add_box(17.2, 4.4, 0.45, center=(0, 4.6, 9.95))
    for sx in (-1, 1):
        marble_b.add_box(6.2, 4.8, 0.45, center=(sx * 5.5, 0.0, 9.95))
        glass_b.add_box(1.8, 2.8, 0.12, center=(sx * 4.2, -0.4, 10.15))

    marble_b.add_ring(2.05, 2.55, 0.48, segments=32, center=(0, med_y, 9.95), orientation="Z", arc_pi=2.0)
    gold_b.add_ring(1.92, 2.08, 0.52, segments=32, center=(0, med_y, 9.95), orientation="Z", arc_pi=2.0)

    # ==========================================================================
    # 6. CLASSICAL ENTABLATURE, TIERED ROOF, PEDIMENTS & ACROTERIA
    # ==========================================================================
    marble_b.add_box(22.2, 17.8, 0.44, center=(0, 0.4, 9.42))
    gold_b.add_box(22.35, 17.95, 0.10, center=(0, 0.4, 9.68))
    dark_b.add_box(22.0, 17.6, 0.48, center=(0, 0.4, 9.97))

    for tx in range(-10, 11, 2):
        for sy in (-8.42, 9.22):
            marble_b.add_box(0.36, 0.14, 0.46, center=(tx, sy, 9.97))
            if tx < 10:
                gold_b.add_cylinder(0.14, 0.14, 0.12, segments=12, center=(tx + 1.0, sy, 9.97), rot_euler=(math.pi * 0.5, 0, 0))
    for ty in range(-7, 9, 2):
        for sx in (-11.02, 11.02):
            marble_b.add_box(0.14, 0.36, 0.46, center=(sx, ty + 0.4, 9.97))

    marble_b.add_box(23.2, 18.8, 0.28, center=(0, 0.4, 10.35))
    gold_b.add_box(23.3, 18.9, 0.08, center=(0, 0.4, 10.52))
    blue_b.add_box(22.4, 18.0, 0.16, center=(0, 0.4, 10.62))

    for sx in (-1, 1):
        for cy in (-8.5, 9.3):
            add_acroterion(marble_b, gold_b, sx * 10.9, cy, 10.48, scale=0.85)

    ped_w = 17.6
    ped_d = 15.2
    ped_z0 = 11.05
    ped_h = 2.75
    marble_b.add_box(ped_w + 0.4, ped_d + 0.4, 0.45, center=(0, 0.4, 10.85))
    gold_b.add_box(ped_w + 0.5, ped_d + 0.5, 0.10, center=(0, 0.4, 11.10))

    blue_dark_b.add_prism_pediment(ped_w - 0.6, ped_d - 0.3, ped_h - 0.18, center=(0, 0.4, ped_z0 + 0.05))

    slope_ang = math.atan2(ped_h, ped_w * 0.5)
    slope_len = math.hypot(ped_w * 0.5 + 0.45, ped_h)
    for sx in (-1, 1):
        cx = sx * (ped_w * 0.25 + 0.1)
        cz = ped_z0 + ped_h * 0.5 + 0.12
        rot = (0, sx * slope_ang, 0)
        blue_b.add_box(slope_len, ped_d + 0.6, 0.18, center=(cx, 0.4, cz), rot_euler=rot)
        for ry in range(-6, 8, 2):
            blue_dark_b.add_box(slope_len * 0.96, 0.12, 0.26, center=(cx, ry + 0.4, cz + 0.04), rot_euler=rot)

    for sy in (-1, 1):
        py = 0.4 + sy * (ped_d * 0.5 + 0.08)
        marble_b.add_box(ped_w + 0.9, 0.52, 0.26, center=(0, py, ped_z0))
        for sx in (-1, 1):
            cx = sx * (ped_w * 0.25 + 0.1)
            cz = ped_z0 + ped_h * 0.5 + 0.16
            rot = (0, sx * slope_ang, 0)
            marble_b.add_box(slope_len + 0.2, 0.56, 0.30, center=(cx, py, cz), rot_euler=rot)
            gold_b.add_box(slope_len + 0.24, 0.60, 0.08, center=(cx, py, cz - 0.14), rot_euler=rot)

        # PEDIMENT SCULPTURE: Properly scaled Golden Compass Rose + Sweeping Laurel Garlands
        tymp_y = 0.4 + sy * (ped_d * 0.5 - 0.12)
        add_compass_wheel(gold_b, (0, tymp_y, ped_z0 + ped_h * 0.40), radius=0.96, thickness=0.16, orientation="Y", rays=8)
        for sx in (-1, 1):
            for leaf_i in range(5):
                lx = sx * (1.55 + leaf_i * 0.68)
                lz = ped_z0 + 0.42 + (4 - leaf_i) * 0.11
                gold_b.add_box(0.50, 0.14, 0.10, center=(lx, tymp_y, lz), rot_euler=(0, sx * 0.26, 0))
                gold_b.add_box(0.28, 0.14, 0.09, center=(lx - sx * 0.12, tymp_y, lz + 0.14), rot_euler=(0, -sx * 0.45, 0))
            add_compass_wheel(gold_b, (sx * 5.3, tymp_y, ped_z0 + 0.44), radius=0.34, thickness=0.12, orientation="Y", rays=8)

        add_acroterion(marble_b, gold_b, 0, py, ped_z0 + ped_h + 0.05, scale=1.05)
        for sx in (-1, 1):
            add_acroterion(marble_b, gold_b, sx * (ped_w * 0.5 + 0.15), py, ped_z0 + 0.12, scale=0.82)

    gold_b.add_box(0.28, ped_d + 0.4, 0.24, center=(0, 0.4, ped_z0 + ped_h + 0.18))

    for b in (marble_b, dark_b, floor_b, blue_b, blue_dark_b, gold_b, wood_b, flame_b, glass_b):
        b.finalize(temple_col)

    # Studio + Warm Sconce Lighting for Blender Viewport & Renders
    sun_data = bpy.data.lights.new(name="Temple_Sun", type="SUN")
    sun_data.energy = 3.2
    sun_data.color = (1.0, 0.94, 0.84)
    sun_obj = bpy.data.objects.new(name="Temple_Sun", object_data=sun_data)
    sun_obj.rotation_euler = Euler((math.radians(48), math.radians(18), math.radians(32)), "XYZ")
    scene.collection.objects.link(sun_obj)

    fill_data = bpy.data.lights.new(name="Temple_Fill", type="SUN")
    fill_data.energy = 1.1
    fill_data.color = (0.72, 0.84, 1.0)
    fill_obj = bpy.data.objects.new(name="Temple_Fill", object_data=fill_data)
    fill_obj.rotation_euler = Euler((math.radians(60), math.radians(-20), math.radians(-145)), "XYZ")
    scene.collection.objects.link(fill_obj)

    # Warm amber point lights for the golden colonnade & interior glow
    warm_positions = [
        (0, -6.8, 5.2, 450.0),
        (-5.5, -6.8, 5.2, 320.0),
        (5.5, -6.8, 5.2, 320.0),
        (0, 7.6, 5.2, 380.0),
        (0, 0.0, 6.2, 850.0),
        (0, 5.2, 4.8, 700.0),
    ]
    for idx, (lx, ly, lz, energy) in enumerate(warm_positions):
        pt_data = bpy.data.lights.new(name=f"Temple_Warm_{idx}", type="POINT")
        pt_data.energy = energy
        pt_data.color = (1.0, 0.72, 0.34)
        pt_data.use_shadow = False
        pt_obj = bpy.data.objects.new(name=f"Temple_Warm_{idx}", object_data=pt_data)
        pt_obj.location = (lx, ly, lz)
        scene.collection.objects.link(pt_obj)

    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.045, 0.055, 0.085, 1.0)
        bg.inputs[1].default_value = 0.85

    print("Temple of Tribulations V2 built successfully!")


if __name__ == "__main__":
    build_temple()
