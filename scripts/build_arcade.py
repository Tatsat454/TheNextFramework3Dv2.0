import bpy
import bmesh
import math
import os
from mathutils import Vector, Euler, Matrix

# ==============================================================================
# GRAND ISLAND ARCADE:
#   1. EXTERIOR (public/arcade.glb):
#      Sleek PS5 / Console & Retro-Arcade Island Pavilion harmonized 100% with
#      the Island & Market Row palette (Warm Cream #F5ECE0, Coral-Pink #FF6B9D,
#      Metallic Gold #E8AD3A, Sky Cyan #24E8FF, Mint #3DDC84, Royal Slate #202C54).
#   2. INTERIOR (public/arcade-interior.glb):
#      Step INSIDE a Giant Custom Gaming PC Case + PS5 Console Megastructure
#      Arcade Hall! Features:
#        - Sculpted PS5 White/Cream Aerodynamic Console Fins with Cyan/Pink LED strips
#        - Motherboard Floor with Gold PCB Circuit Traces & Central CPU Waterblock
#        - Giant RGB Triple-Fan GPU Ceiling Canopy & Side Wall 360mm RGB Cooling Fans
#        - Towering Glowing RGB DDR5 RAM Stick Obelisks & Lateral Liquid-Cooling Tubes
#        - Giant Controller Button Emblems (Triangle, Circle, Cross, Square)
#        - 4 Upright Project Arcade Machines (Flo Robot, PJM Power, Taxi, Stocks)
#        - 2 Illuminated Glass Prize Claw Machines
#        - 1 Deluxe Cyber-Neon Air Hockey Table
# ==============================================================================

if "WORKSPACE_DIR" not in globals():
    WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(WORKSPACE_DIR, "public")
PREVIEW_PATH = "/Users/tatsatupadhyay/.gemini/antigravity/brain/3d06f5b9-00e7-4cb9-aed6-2dfb43309795/arcade_hero.png"
EXT_PREVIEW_PATH = "/Users/tatsatupadhyay/.gemini/antigravity/brain/3d06f5b9-00e7-4cb9-aed6-2dfb43309795/arcade_exterior_hero.png"


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    for light in list(bpy.data.lights):
        if light.users == 0:
            bpy.data.lights.remove(light)
    for cam in list(bpy.data.cameras):
        if cam.users == 0:
            bpy.data.cameras.remove(cam)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def make_mat(name, hex_color, roughness=0.36, metallic=0.0, emission_hex=None, emission_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    r, g, b = hex_to_linear_rgb(hex_color)
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission_hex and emission_strength > 0:
        er, eg, eb = hex_to_linear_rgb(emission_hex)
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
    MATS["marble"] = make_mat("Arcade_Marble_Cream", "#FFFBF5", roughness=0.26)
    MATS["marble_dark"] = make_mat("Arcade_Marble_Dark", "#F1D8A6", roughness=0.38)
    MATS["floor_cream"] = make_mat("Arcade_Floor_Cream", "#EDE1CB", roughness=0.22)
    MATS["slate"] = make_mat("Arcade_Royal_Slate", "#2B2850", roughness=0.36, metallic=0.22)
    MATS["slate_dark"] = make_mat("Arcade_Slate_Dark", "#242045", roughness=0.30, metallic=0.22)
    MATS["coral"] = make_mat("Arcade_Coral_Rose", "#FF5B4A", roughness=0.35)
    MATS["gold"] = make_mat("Arcade_Gold_Trim", "#FFD23F", roughness=0.22, metallic=0.88, emission_hex="#FFD23F", emission_strength=0.22)
    MATS["wood"] = make_mat("Arcade_Bronze_Wood", "#DCB07A", roughness=0.42, metallic=0.15)
    MATS["chrome"] = make_mat("Arcade_Chrome", "#E8ECF8", roughness=0.16, metallic=0.88)
    MATS["flame"] = make_mat("Arcade_Torch_Flames", "#FFAE38", roughness=0.15, emission_hex="#FFAE38", emission_strength=7.5)
    MATS["glass"] = make_mat("Arcade_Glass", "#FFFFFF", roughness=0.08, metallic=0.05, alpha=0.18)

    MATS["glow_cyan"] = make_mat("Arcade_Glow_Cyan", "#4FC3F7", roughness=0.14, emission_hex="#4FC3F7", emission_strength=4.0)
    MATS["glow_gold"] = make_mat("Arcade_Glow_Gold", "#FFD23F", roughness=0.14, emission_hex="#FFD23F", emission_strength=4.0)
    MATS["glow_pink"] = make_mat("Arcade_Glow_Pink", "#FF6B9D", roughness=0.14, emission_hex="#FF6B9D", emission_strength=4.0)
    MATS["glow_green"] = make_mat("Arcade_Glow_Green", "#A9D66B", roughness=0.14, emission_hex="#A9D66B", emission_strength=4.0)
    MATS["glow_white"] = make_mat("Arcade_Glow_White", "#FFF1DC", roughness=0.12, emission_hex="#FFF1DC", emission_strength=3.5)

    # Interior-only: playful Bruno-Simon toy cabinet bodies, warm carpet, CRT screen & PS5 cream white
    MATS["cab_cyan"] = make_mat("Arcade_Cab_Cyan", "#4FC3F7", roughness=0.28, metallic=0.12)
    MATS["cab_navy"] = make_mat("Arcade_Cab_Navy", "#2B2850", roughness=0.32, metallic=0.20)
    MATS["cab_amber"] = make_mat("Arcade_Cab_Amber", "#FFD23F", roughness=0.28, metallic=0.12)
    MATS["cab_crimson"] = make_mat("Arcade_Cab_Crimson", "#FF5B4A", roughness=0.28, metallic=0.12)
    MATS["cab_magenta"] = make_mat("Arcade_Cab_Magenta", "#FF6B9D", roughness=0.28, metallic=0.12)
    MATS["cab_violet"] = make_mat("Arcade_Cab_Violet", "#7C6CF0", roughness=0.30, metallic=0.18)
    MATS["cab_emerald"] = make_mat("Arcade_Cab_Emerald", "#A9D66B", roughness=0.28, metallic=0.12)
    MATS["cab_teal"] = make_mat("Arcade_Cab_Teal", "#3AD1C4", roughness=0.30, metallic=0.18)
    MATS["cab_blue"] = make_mat("Arcade_Cab_Blue", "#4FC3F7", roughness=0.28, metallic=0.12)
    MATS["cab_orange"] = make_mat("Arcade_Cab_Orange", "#FF7A32", roughness=0.28, metallic=0.12)
    MATS["cab_black"] = make_mat("Arcade_Cab_Black", "#2B2850", roughness=0.32, metallic=0.20)
    MATS["copper"] = make_mat("Arcade_Copper", "#D87040", roughness=0.16, metallic=0.92)
    MATS["coolant_cyan"] = make_mat("Arcade_Coolant_Cyan", "#4FC3F7", roughness=0.10, emission_hex="#4FC3F7", emission_strength=3.5)
    MATS["coolant_pink"] = make_mat("Arcade_Coolant_Pink", "#FF6B9D", roughness=0.10, emission_hex="#FF6B9D", emission_strength=3.5)
    MATS["carpet"] = make_mat("Arcade_Carpet", "#EDE1CB", roughness=0.72)
    MATS["screen"] = make_mat("Arcade_Screen", "#141228", roughness=0.06, emission_hex="#141228", emission_strength=1.0)
    MATS["ps5_white"] = make_mat("Arcade_PS5_White", "#FFFBF5", roughness=0.22)


class Builder:
    def __init__(self, name, material):
        self.name = name
        self.material = material
        self.bm = bmesh.new()

    def add_box(self, sx, sy, sz, center=(0, 0, 0), rot=(0, 0, 0)):
        mat = (
            Matrix.Translation(Vector(center))
            @ Euler(rot, "XYZ").to_matrix().to_4x4()
            @ Matrix.Diagonal((sx, sy, sz, 1.0))
        )
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=mat)

    def add_cyl(self, r1, r2, h, segs=16, center=(0, 0, 0), rot=(0, 0, 0), cap_ends=True):
        mat = Matrix.Translation(Vector(center)) @ Euler(rot, "XYZ").to_matrix().to_4x4()
        bmesh.ops.create_cone(
            self.bm,
            cap_ends=cap_ends,
            cap_tris=False,
            segments=segs,
            radius1=r1,
            radius2=r2,
            depth=h,
            matrix=mat,
        )

    def add_sphere(self, radius, segs=12, center=(0, 0, 0)):
        mat = Matrix.Translation(Vector(center))
        bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=max(6, segs // 2), radius=radius, matrix=mat)

    def add_ring(self, r_inner, r_outer, depth, segs=28, center=(0, 0, 0), orientation="Z", arc_pi=2.0):
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

    def finalize(self, col):
        if len(self.bm.verts) == 0:
            self.bm.free()
            return None
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        obj.data.materials.append(self.material)
        col.objects.link(obj)
        return obj


# ==============================================================================
# SHARED HELPERS: 3D 'ARCADE' MARQUEE, SPACE INVADERS, RGB FANS, PS5 FINS
# ==============================================================================

def add_arcade_word(gold_b, glow_b, center_x, center_y, center_z, scale=1.0):
    letters = {
        "A": [(0.0, 2.0, 0.20, 1.0), (0.72, 2.0, 0.20, 1.0), (0.36, 3.8, 0.92, 0.20), (0.36, 2.0, 0.72, 0.20)],
        "R": [(0.0, 2.0, 0.20, 1.0), (0.36, 3.8, 0.88, 0.20), (0.72, 3.0, 0.20, 0.46), (0.36, 2.15, 0.88, 0.20), (0.66, 1.05, 0.20, 0.52)],
        "C": [(0.0, 2.0, 0.20, 1.0), (0.38, 3.8, 0.92, 0.20), (0.38, 0.2, 0.92, 0.20)],
        "D": [(0.0, 2.0, 0.20, 1.0), (0.34, 3.8, 0.84, 0.20), (0.34, 0.2, 0.84, 0.20), (0.72, 2.0, 0.20, 0.82)],
        "E": [(0.0, 2.0, 0.20, 1.0), (0.38, 3.8, 0.92, 0.20), (0.32, 2.0, 0.76, 0.20), (0.38, 0.2, 0.92, 0.20)],
    }
    word = "ARCADE"
    spacing = 1.28 * scale
    start_x = center_x - (len(word) - 1) * spacing * 0.5 - 0.36 * scale
    for idx, ch in enumerate(word):
        lx = start_x + idx * spacing
        for bx, bz, bw, bh in letters[ch]:
            px = lx + bx * scale
            pz = center_z + (bz - 2.0) * 0.44 * scale
            w = bw * scale
            h = bh * 1.82 * scale
            gold_b.add_box(w * 1.12, 0.24 * scale, h * 1.06, center=(px, center_y + 0.04 * scale, pz))
            glow_b.add_box(w, 0.20 * scale, h, center=(px, center_y - 0.05 * scale, pz))


def add_space_invader(glow_b, center_x, center_y, center_z, pixel=0.12, facing="Y"):
    pattern = [
        "  X     X  ",
        "   X   X   ",
        "  XXXXXXX  ",
        " XX XXX XX ",
        "XXXXXXXXXXX",
        "X XXXXXXX X",
        "X X     X X",
        "   XX XX   ",
    ]
    rows = len(pattern)
    cols = len(pattern[0])
    for r, row in enumerate(pattern):
        for c, ch in enumerate(row):
            if ch == "X":
                ox = (c - cols / 2.0 + 0.5) * pixel
                oz = (rows / 2.0 - r - 0.5) * pixel
                if facing == "Y":
                    glow_b.add_box(pixel * 0.92, pixel * 0.85, pixel * 0.92, center=(center_x + ox, center_y, center_z + oz))
                else:
                    glow_b.add_box(pixel * 0.85, pixel * 0.92, pixel * 0.92, center=(center_x, center_y + ox, center_z + oz))


def add_rgb_cooling_fan(slate_b, chrome_b, glow_b, center, radius=1.55, depth=0.35, orientation="X", blades=9):
    cx, cy, cz = center
    slate_b.add_ring(radius * 0.92, radius * 1.10, depth, segs=32, center=center, orientation=orientation, arc_pi=2.0)
    glow_b.add_ring(radius * 0.84, radius * 0.93, depth * 1.08, segs=32, center=center, orientation=orientation, arc_pi=2.0)

    if orientation == "X":
        rot_hub = (0, math.pi * 0.5, 0)
        chrome_b.add_cyl(radius * 0.28, radius * 0.28, depth * 0.95, segs=20, center=center, rot=rot_hub)
        glow_b.add_cyl(radius * 0.16, radius * 0.16, depth * 1.05, segs=16, center=center, rot=rot_hub)
        for i in range(blades):
            ang = (i / blades) * math.pi * 2.0
            r_mid = radius * 0.55
            by = cy + math.cos(ang) * r_mid
            bz = cz + math.sin(ang) * r_mid
            chrome_b.add_box(depth * 0.55, radius * 0.52, radius * 0.16, center=(cx, by, bz), rot=(ang + 0.35, 0.45, 0))
    elif orientation == "Z":
        chrome_b.add_cyl(radius * 0.28, radius * 0.28, depth * 0.95, segs=20, center=center)
        glow_b.add_cyl(radius * 0.16, radius * 0.16, depth * 1.05, segs=16, center=center)
        for i in range(blades):
            ang = (i / blades) * math.pi * 2.0
            r_mid = radius * 0.55
            bx = cx + math.cos(ang) * r_mid
            by = cy + math.sin(ang) * r_mid
            chrome_b.add_box(radius * 0.52, radius * 0.16, depth * 0.55, center=(bx, by, cz), rot=(0.45, 0, ang))
    else:
        rot_hub = (math.pi * 0.5, 0, 0)
        chrome_b.add_cyl(radius * 0.28, radius * 0.28, depth * 0.95, segs=20, center=center, rot=rot_hub)
        glow_b.add_cyl(radius * 0.16, radius * 0.16, depth * 1.05, segs=16, center=center, rot=rot_hub)
        for i in range(blades):
            ang = (i / blades) * math.pi * 2.0
            r_mid = radius * 0.55
            bx = cx + math.cos(ang) * r_mid
            bz = cz + math.sin(ang) * r_mid
            chrome_b.add_box(radius * 0.52, depth * 0.55, radius * 0.16, center=(bx, cy, bz), rot=(0, ang + 0.35, 0.45))


def add_ps5_sculpted_fin(marble_b, slate_b, gold_b, glow_b, x, y, height=10.4, side=1):
    """Builds a Sleek PS5-Inspired White/Cream Aerodynamic Console Fin with Glowing Inner LED Strips."""
    # Dark Slate Central Spine + Glowing Cyan/Pink Inner Vent Strips
    slate_b.add_box(0.42, 1.15, height, center=(x, y, height * 0.5))
    glow_b.add_box(0.50, 0.16, height * 0.94, center=(x - side * 0.08, y - 0.52, height * 0.5))
    glow_b.add_box(0.50, 0.16, height * 0.94, center=(x - side * 0.08, y + 0.52, height * 0.5))

    # Smooth Flared White/Cream Console Side Shells (marble_b is proud on the outside!)
    segments = 6
    for s_idx in range(segments):
        t0 = s_idx / segments
        t1 = (s_idx + 1) / segments
        tm = (t0 + t1) * 0.5
        seg_h = height / segments
        cz = tm * height
        flare = 1.0 + (tm ** 1.4) * 0.48
        offset_x = side * (tm ** 1.5) * 0.22
        marble_b.add_box(0.88, 1.48 * flare, seg_h + 0.04, center=(x + offset_x, y, cz))
        gold_b.add_box(0.68, 1.56 * flare, 0.08, center=(x + offset_x, y, cz + seg_h * 0.48))

    # Base Plinth & Crown Cap
    gold_b.add_box(1.15, 1.85, 0.22, center=(x, y, 0.11))
    marble_b.add_box(1.05, 1.72, 0.34, center=(x, y, 0.38))


def add_controller_symbol(builder, kind, center, radius=0.62, depth=0.20, orientation="Y"):
    cx, cy, cz = center
    if kind == "triangle":
        builder.add_ring(radius * 0.72, radius * 1.05, depth, segs=3, center=center, orientation=orientation, arc_pi=2.0)
    elif kind == "circle":
        builder.add_ring(radius * 0.72, radius * 1.02, depth, segs=24, center=center, orientation=orientation, arc_pi=2.0)
    elif kind == "cross":
        for ang in (math.pi * 0.25, -math.pi * 0.25):
            rot = (ang, 0, 0) if orientation == "X" else (0, ang, 0)
            builder.add_box(
                depth if orientation == "X" else radius * 1.95,
                radius * 1.95 if orientation == "X" else depth,
                radius * 0.32,
                center=center,
                rot=rot,
            )
    elif kind == "square":
        builder.add_ring(radius * 0.72, radius * 1.05, depth, segs=4, center=center, orientation=orientation, arc_pi=2.0)


def build_arcade_machine(slate_b, marble_b, gold_b, chrome_b, accent_b, white_b, cx, cy, cz, scale=1.0, facing_south=True, theme="cyan"):
    s = scale
    dir_y = -1.0 if facing_south else 1.0

    marble_b.add_box(1.36 * s, 1.32 * s, 0.14 * s, center=(cx, cy, cz + 0.07 * s))
    gold_b.add_box(1.40 * s, 1.36 * s, 0.05 * s, center=(cx, cy, cz + 0.15 * s))

    slate_b.add_box(1.16 * s, 1.08 * s, 1.25 * s, center=(cx, cy - dir_y * 0.05 * s, cz + 0.78 * s))
    slate_b.add_box(1.16 * s, 0.88 * s, 1.05 * s, center=(cx, cy - dir_y * 0.14 * s, cz + 1.88 * s))
    for sx in (-1, 1):
        marble_b.add_box(0.08 * s, 1.14 * s, 2.24 * s, center=(cx + sx * 0.60 * s, cy - dir_y * 0.04 * s, cz + 1.26 * s))
        gold_b.add_box(0.11 * s, 0.07 * s, 2.26 * s, center=(cx + sx * 0.60 * s, cy + dir_y * 0.52 * s, cz + 1.26 * s))
        accent_b.add_box(0.12 * s, 0.04 * s, 2.18 * s, center=(cx + sx * 0.60 * s, cy + dir_y * 0.54 * s, cz + 1.26 * s))

    slate_b.add_box(1.22 * s, 0.42 * s, 0.36 * s, center=(cx, cy + dir_y * 0.34 * s, cz + 2.38 * s))
    gold_b.add_box(1.26 * s, 0.46 * s, 0.06 * s, center=(cx, cy + dir_y * 0.34 * s, cz + 2.57 * s))
    accent_b.add_box(1.10 * s, 0.08 * s, 0.26 * s, center=(cx, cy + dir_y * 0.54 * s, cz + 2.38 * s))

    tilt = (math.radians(-16 * dir_y), 0, 0)
    slate_b.add_box(1.02 * s, 0.12 * s, 0.82 * s, center=(cx, cy + dir_y * 0.28 * s, cz + 1.72 * s), rot=tilt)
    accent_b.add_box(0.88 * s, 0.08 * s, 0.68 * s, center=(cx, cy + dir_y * 0.32 * s, cz + 1.72 * s), rot=tilt)
    white_b.add_box(0.58 * s, 0.09 * s, 0.10 * s, center=(cx, cy + dir_y * 0.35 * s, cz + 1.84 * s), rot=tilt)
    gold_b.add_box(0.36 * s, 0.09 * s, 0.08 * s, center=(cx, cy + dir_y * 0.33 * s, cz + 1.62 * s), rot=tilt)

    marble_b.add_box(1.20 * s, 0.54 * s, 0.14 * s, center=(cx, cy + dir_y * 0.48 * s, cz + 1.24 * s), rot=(math.radians(8 * dir_y), 0, 0))
    gold_b.add_box(1.24 * s, 0.08 * s, 0.08 * s, center=(cx, cy + dir_y * 0.74 * s, cz + 1.20 * s))
    for jx in (-0.30 * s, 0.16 * s):
        chrome_b.add_cyl(0.022 * s, 0.022 * s, 0.15 * s, segs=8, center=(cx + jx, cy + dir_y * 0.50 * s, cz + 1.35 * s))
        accent_b.add_sphere(0.055 * s, segs=10, center=(cx + jx, cy + dir_y * 0.50 * s, cz + 1.44 * s))
        for bx in (0.14 * s, 0.24 * s):
            for by_off in (-0.05 * s, 0.05 * s):
                white_b.add_cyl(0.03 * s, 0.03 * s, 0.04 * s, segs=8, center=(cx + jx + bx, cy + dir_y * (0.50 * s + by_off), cz + 1.32 * s))

    gold_b.add_box(0.52 * s, 0.06 * s, 0.56 * s, center=(cx, cy + dir_y * 0.50 * s, cz + 0.62 * s))
    for sx in (-0.12 * s, 0.12 * s):
        accent_b.add_box(0.09 * s, 0.08 * s, 0.12 * s, center=(cx + sx, cy + dir_y * 0.52 * s, cz + 0.72 * s))

    top_z = cz + 2.62 * s
    gold_b.add_cyl(0.28 * s, 0.34 * s, 0.10 * s, segs=12, center=(cx, cy + dir_y * 0.32 * s, top_z + 0.05 * s))
    if theme == "cyan":
        marble_b.add_box(0.34 * s, 0.28 * s, 0.34 * s, center=(cx, cy + dir_y * 0.32 * s, top_z + 0.26 * s))
        accent_b.add_sphere(0.06 * s, segs=8, center=(cx - 0.08 * s, cy + dir_y * 0.47 * s, top_z + 0.28 * s))
        accent_b.add_sphere(0.06 * s, segs=8, center=(cx + 0.08 * s, cy + dir_y * 0.47 * s, top_z + 0.28 * s))
        chrome_b.add_cyl(0.02 * s, 0.02 * s, 0.18 * s, segs=8, center=(cx, cy + dir_y * 0.32 * s, top_z + 0.50 * s))
        accent_b.add_sphere(0.06 * s, segs=8, center=(cx, cy + dir_y * 0.32 * s, top_z + 0.60 * s))
    elif theme == "gold":
        accent_b.add_box(0.16 * s, 0.12 * s, 0.46 * s, center=(cx, cy + dir_y * 0.32 * s, top_z + 0.32 * s), rot=(0, math.radians(22), 0))
        accent_b.add_box(0.16 * s, 0.12 * s, 0.42 * s, center=(cx + 0.08 * s, cy + dir_y * 0.32 * s, top_z + 0.54 * s), rot=(0, math.radians(-22), 0))
    elif theme == "pink":
        accent_b.add_box(0.56 * s, 0.34 * s, 0.18 * s, center=(cx, cy + dir_y * 0.32 * s, top_z + 0.20 * s))
        marble_b.add_box(0.32 * s, 0.28 * s, 0.16 * s, center=(cx, cy + dir_y * 0.32 * s, top_z + 0.35 * s))
        white_b.add_box(0.16 * s, 0.10 * s, 0.08 * s, center=(cx, cy + dir_y * 0.32 * s, top_z + 0.46 * s))
    else:
        accent_b.add_box(0.14 * s, 0.12 * s, 0.42 * s, center=(cx - 0.16 * s, cy + dir_y * 0.32 * s, top_z + 0.26 * s))
        accent_b.add_box(0.14 * s, 0.12 * s, 0.58 * s, center=(cx + 0.16 * s, cy + dir_y * 0.32 * s, top_z + 0.34 * s))
        gold_b.add_cyl(0.18 * s, 0.01 * s, 0.26 * s, segs=4, center=(cx + 0.16 * s, cy + dir_y * 0.32 * s, top_z + 0.72 * s))

    stool_y = cy + dir_y * 1.18 * s
    gold_b.add_cyl(0.26 * s, 0.30 * s, 0.06 * s, segs=14, center=(cx, stool_y, cz + 0.03 * s))
    chrome_b.add_cyl(0.05 * s, 0.05 * s, 0.58 * s, segs=10, center=(cx, stool_y, cz + 0.34 * s))
    marble_b.add_cyl(0.28 * s, 0.26 * s, 0.12 * s, segs=16, center=(cx, stool_y, cz + 0.66 * s))
    accent_b.add_cyl(0.29 * s, 0.29 * s, 0.04 * s, segs=16, center=(cx, stool_y, cz + 0.68 * s))


def build_claw_machine(marble_b, slate_b, gold_b, chrome_b, glass_b, accent_b, prize_builders, cx, cy, cz, scale=1.0, facing_dir=(-1, 0)):
    s = scale
    fx, fy = facing_dir

    marble_b.add_box(1.56 * s, 1.56 * s, 0.96 * s, center=(cx, cy, cz + 0.48 * s))
    slate_b.add_box(1.42 * s, 1.42 * s, 0.72 * s, center=(cx, cy, cz + 0.48 * s))
    gold_b.add_box(1.62 * s, 1.62 * s, 0.08 * s, center=(cx, cy, cz + 0.04 * s))
    gold_b.add_box(1.60 * s, 1.60 * s, 0.08 * s, center=(cx, cy, cz + 0.96 * s))

    marble_b.add_box(
        (0.18 if fx != 0 else 0.95) * s,
        (0.95 if fx != 0 else 0.18) * s,
        0.16 * s,
        center=(cx + fx * 0.82 * s, cy + fy * 0.82 * s, cz + 0.94 * s),
    )
    accent_b.add_sphere(0.065 * s, segs=10, center=(cx + fx * 0.85 * s, cy + fy * 0.85 * s - 0.18 * s, cz + 1.08 * s))
    gold_b.add_box(
        (0.12 if fx != 0 else 0.42) * s,
        (0.42 if fx != 0 else 0.12) * s,
        0.42 * s,
        center=(cx + fx * 0.78 * s, cy + fy * 0.78 * s + 0.22 * s, cz + 0.42 * s),
    )

    for sx in (-1, 1):
        for sy in (-1, 1):
            gold_b.add_cyl(0.055 * s, 0.055 * s, 1.45 * s, segs=10, center=(cx + sx * 0.72 * s, cy + sy * 0.72 * s, cz + 1.72 * s))
    glass_b.add_box(1.38 * s, 1.38 * s, 1.38 * s, center=(cx, cy, cz + 1.70 * s))

    marble_b.add_box(1.64 * s, 1.64 * s, 0.42 * s, center=(cx, cy, cz + 2.62 * s))
    gold_b.add_box(1.68 * s, 1.68 * s, 0.08 * s, center=(cx, cy, cz + 2.84 * s))
    accent_b.add_box(1.52 * s, 1.52 * s, 0.22 * s, center=(cx, cy, cz + 2.62 * s))

    chrome_b.add_box(1.24 * s, 0.08 * s, 0.06 * s, center=(cx, cy, cz + 2.32 * s))
    chrome_b.add_box(0.08 * s, 1.24 * s, 0.06 * s, center=(cx, cy, cz + 2.32 * s))
    chrome_b.add_cyl(0.02 * s, 0.02 * s, 0.48 * s, segs=8, center=(cx, cy, cz + 2.06 * s))
    gold_b.add_sphere(0.085 * s, segs=10, center=(cx, cy, cz + 1.80 * s))
    for i in range(3):
        ang = i * (2.0 * math.pi / 3.0)
        px, py = cx + math.cos(ang) * 0.12 * s, cy + math.sin(ang) * 0.12 * s
        chrome_b.add_box(0.03 * s, 0.03 * s, 0.20 * s, center=(px, py, cz + 1.68 * s), rot=(math.sin(ang) * 0.35, -math.cos(ang) * 0.35, 0))

    prize_offsets = [
        (-0.36, -0.34, 1.15, 0),
        (0.34, -0.30, 1.16, 1),
        (-0.28, 0.32, 1.15, 2),
        (0.32, 0.30, 1.16, 3),
        (0.0, -0.10, 1.18, 0),
        (-0.12, 0.14, 1.28, 1),
        (0.16, -0.06, 1.26, 2),
    ]
    for ox, oy, oz, p_idx in prize_offsets:
        pb = prize_builders[p_idx % len(prize_builders)]
        pb.add_sphere(0.15 * s, segs=10, center=(cx + ox * s, cy + oy * s, cz + oz * s))


def build_air_hockey(marble_b, slate_b, gold_b, chrome_b, cyan_b, pink_b, white_b, cx, cy, cz, scale=1.0):
    s = scale
    for lx in (-0.62 * s, 0.62 * s):
        for ly in (-1.12 * s, 1.12 * s):
            marble_b.add_cyl(0.14 * s, 0.18 * s, 0.78 * s, segs=12, center=(cx + lx, cy + ly, cz + 0.39 * s))
            gold_b.add_cyl(0.18 * s, 0.20 * s, 0.10 * s, segs=12, center=(cx + lx, cy + ly, cz + 0.05 * s))
    slate_b.add_box(1.12 * s, 2.10 * s, 0.34 * s, center=(cx, cy, cz + 0.56 * s))

    marble_b.add_box(1.78 * s, 3.08 * s, 0.22 * s, center=(cx, cy, cz + 0.84 * s))
    gold_b.add_box(1.84 * s, 3.14 * s, 0.06 * s, center=(cx, cy, cz + 0.92 * s))

    white_b.add_box(1.52 * s, 2.82 * s, 0.05 * s, center=(cx, cy, cz + 0.96 * s))
    pink_b.add_box(1.48 * s, 0.05 * s, 0.06 * s, center=(cx, cy, cz + 0.965 * s))
    cyan_b.add_cyl(0.28 * s, 0.28 * s, 0.062 * s, segs=20, center=(cx, cy, cz + 0.965 * s))
    white_b.add_cyl(0.22 * s, 0.22 * s, 0.065 * s, segs=20, center=(cx, cy, cz + 0.966 * s))

    for sy in (-1, 1):
        slate_b.add_box(0.58 * s, 0.12 * s, 0.08 * s, center=(cx, cy + sy * 1.42 * s, cz + 0.98 * s))
        gold_b.add_box(0.66 * s, 0.16 * s, 0.06 * s, center=(cx, cy + sy * 1.46 * s, cz + 0.99 * s))

    pink_b.add_cyl(0.13 * s, 0.14 * s, 0.06 * s, segs=14, center=(cx - 0.16 * s, cy - 0.88 * s, cz + 1.01 * s))
    pink_b.add_cyl(0.05 * s, 0.06 * s, 0.12 * s, segs=12, center=(cx - 0.16 * s, cy - 0.88 * s, cz + 1.07 * s))

    cyan_b.add_cyl(0.13 * s, 0.14 * s, 0.06 * s, segs=14, center=(cx + 0.18 * s, cy + 0.86 * s, cz + 1.01 * s))
    cyan_b.add_cyl(0.05 * s, 0.06 * s, 0.12 * s, segs=12, center=(cx + 0.18 * s, cy + 0.86 * s, cz + 1.07 * s))

    gold_b.add_cyl(0.09 * s, 0.09 * s, 0.04 * s, segs=14, center=(cx + 0.06 * s, cy - 0.12 * s, cz + 1.00 * s))

    for sx in (-1, 1):
        gold_b.add_box(0.09 * s, 0.14 * s, 0.82 * s, center=(cx + sx * 0.86 * s, cy, cz + 1.34 * s))
    slate_b.add_box(1.86 * s, 0.30 * s, 0.28 * s, center=(cx, cy, cz + 1.82 * s))
    gold_b.add_box(1.92 * s, 0.34 * s, 0.06 * s, center=(cx, cy, cz + 1.97 * s))
    pink_b.add_box(1.46 * s, 0.32 * s, 0.14 * s, center=(cx, cy, cz + 1.82 * s))


# ==============================================================================
# 1. EXTERIOR PAVILION (public/arcade.glb) — SLEEK ISLAND CONSOLE ARCADE PAVILION
# ==============================================================================

def build_arcade_exterior(col):
    marble_b = Builder("Arcade_Marble_Cream", MATS["marble"])
    dark_b = Builder("Arcade_Marble_Dark", MATS["marble_dark"])
    floor_b = Builder("Arcade_Floor_Cream", MATS["floor_cream"])
    slate_b = Builder("Arcade_Royal_Slate", MATS["slate"])
    slate_dark_b = Builder("Arcade_Slate_Dark", MATS["slate_dark"])
    coral_b = Builder("Arcade_Coral_Rose", MATS["coral"])
    gold_b = Builder("Arcade_Gold_Trim", MATS["gold"])
    chrome_b = Builder("Arcade_Chrome", MATS["chrome"])
    flame_b = Builder("Arcade_Torch_Flames", MATS["flame"])
    glass_b = Builder("Arcade_Glass", MATS["glass"])
    cyan_b = Builder("Arcade_Glow_Cyan", MATS["glow_cyan"])
    pink_b = Builder("Arcade_Glow_Pink", MATS["glow_pink"])
    gold_glow_b = Builder("Arcade_Glow_Gold", MATS["glow_gold"])
    green_b = Builder("Arcade_Glow_Green", MATS["glow_green"])

    # A. Stepped Cream & Gold Podium (22m W x 18m D, Z = 0 -> 1.8m)
    marble_b.add_box(22.0, 17.6, 0.34, center=(0, 0.4, 0.17))
    dark_b.add_box(21.4, 17.0, 0.24, center=(0, 0.4, 0.46))
    marble_b.add_box(20.8, 16.4, 0.96, center=(0, 0.4, 1.06))
    gold_b.add_box(21.2, 16.8, 0.12, center=(0, 0.4, 1.60))
    marble_b.add_box(21.0, 16.6, 0.16, center=(0, 0.4, 1.74))
    floor_b.add_box(19.8, 15.4, 0.06, center=(0, 0.4, 1.83))

    # Grand Front Staircase (Y = -10.2 to -7.8)
    n_steps = 6
    stair_w = 8.4
    y_start, y_end = -10.2, -7.8
    for i in range(n_steps):
        t0 = i / n_steps
        z_top = (i + 1) * (1.8 / n_steps)
        yf = y_start + t0 * (y_end - y_start)
        depth = y_end - yf + 0.2
        marble_b.add_box(stair_w, depth, 1.8 / n_steps, center=(0, yf + depth * 0.5, z_top - (0.9 / n_steps)))
        gold_b.add_box(stair_w + 0.06, 0.06, 0.04, center=(0, yf, z_top - 0.02))

    # Stair Parapet Blocks + Glowing Arcade Orb Beacons
    for sx in (-1, 1):
        cx = sx * 4.85
        marble_b.add_box(1.35, 2.5, 1.65, center=(cx, -9.0, 0.82))
        gold_b.add_box(1.42, 2.58, 0.16, center=(cx, -9.0, 1.72))
        coral_b.add_box(0.82, 0.12, 0.82, center=(cx, -10.26, 0.85))
        flame_b.add_sphere(0.28, segs=12, center=(cx, -9.5, 2.12))
        gold_b.add_ring(0.32, 0.38, 0.08, segs=16, center=(cx, -9.5, 2.12), orientation="Z", arc_pi=2.0)

    # B. PS5 / Console-Inspired Sculpted Cream-White Aerodynamic Exterior Shell & Slate Core
    slate_b.add_box(17.6, 13.4, 7.6, center=(0, 0.4, 5.6))
    for sx in (-1, 1):
        for wy in (-5.6, -1.6, 2.4, 6.4):
            add_ps5_sculpted_fin(marble_b, slate_dark_b, gold_b, cyan_b if sx < 0 else pink_b, sx * 9.2, wy, height=7.8, side=sx)
        for fy_fan in (-3.6, 4.4):
            add_rgb_cooling_fan(slate_dark_b, chrome_b, cyan_b if fy_fan < 0 else pink_b, (sx * 8.85, fy_fan, 5.4), radius=1.35, depth=0.28, orientation="X")

    # Front Facade: Arched Glass & Gold Portal + Glowing Showcase Windows
    fy = -6.32
    marble_b.add_box(18.2, 0.55, 7.6, center=(0, fy, 5.6))
    slate_dark_b.add_box(3.8, 0.65, 5.0, center=(0, fy, 4.3))
    for sx in (-1, 1):
        gold_b.add_box(0.22, 0.72, 5.1, center=(sx * 1.95, fy, 4.35))
        glass_b.add_box(1.75, 0.18, 4.8, center=(sx * 0.96, fy - 0.06, 4.25))
        gold_b.add_box(0.14, 0.24, 1.4, center=(sx * 0.22, fy - 0.12, 4.1))

    # Glowing Power-Symbol Arch Above Front Doors
    gold_b.add_ring(1.85, 2.15, 0.68, segs=28, center=(0, fy - 0.05, 6.85), orientation="Y", arc_pi=1.0)
    cyan_b.add_ring(1.68, 1.85, 0.66, segs=28, center=(0, fy - 0.05, 6.85), orientation="Y", arc_pi=1.0)

    # Front Showcase Windows with Hollow Gold Frames & Glowing Space Invaders (No solid gold box blocking them!)
    for sx in (-1, 1):
        wx = sx * 5.8
        wz = 4.6
        slate_dark_b.add_box(3.4, 0.62, 3.2, center=(wx, fy - 0.02, wz))
        # Hollow Gold Frame around the window
        gold_b.add_box(3.68, 0.72, 0.18, center=(wx, fy - 0.04, wz + 1.62))
        gold_b.add_box(3.68, 0.72, 0.18, center=(wx, fy - 0.04, wz - 1.62))
        gold_b.add_box(0.18, 0.72, 3.4, center=(wx - 1.75, fy - 0.04, wz))
        gold_b.add_box(0.18, 0.72, 3.4, center=(wx + 1.75, fy - 0.04, wz))
        add_space_invader(cyan_b if sx < 0 else pink_b, wx, fy - 0.34, wz, pixel=0.18, facing="Y")

    # Non-Overlapping Controller Symbols Flanking the Central Arch on the Front Facade!
    add_controller_symbol(green_b, "triangle", (-7.1, fy - 0.34, 7.6), radius=0.62, depth=0.20, orientation="Y")
    add_controller_symbol(pink_b, "circle", (-4.3, fy - 0.34, 7.6), radius=0.62, depth=0.20, orientation="Y")
    add_controller_symbol(cyan_b, "cross", (4.3, fy - 0.34, 7.6), radius=0.62, depth=0.20, orientation="Y")
    add_controller_symbol(gold_glow_b, "square", (7.1, fy - 0.34, 7.6), radius=0.62, depth=0.20, orientation="Y")

    # C. Sculpted Console Roof Canopy + Rooftop 'ARCADE' Marquee
    marble_b.add_box(20.6, 15.8, 0.52, center=(0, 0.4, 9.66))
    gold_b.add_box(20.9, 16.1, 0.14, center=(0, 0.4, 9.98))
    coral_b.add_box(19.8, 15.0, 0.36, center=(0, 0.4, 10.22))
    marble_b.add_box(18.6, 13.8, 0.45, center=(0, 0.4, 10.62))

    # Rooftop "ARCADE" Marquee Sign + Flanking Space Invader Beacons
    slate_dark_b.add_box(9.4, 0.60, 2.15, center=(0, -5.8, 12.15))
    gold_b.add_box(9.7, 0.68, 0.16, center=(0, -5.8, 13.28))
    gold_b.add_box(9.7, 0.68, 0.16, center=(0, -5.8, 11.02))
    add_arcade_word(gold_b, gold_glow_b, 0, -6.12, 12.15, scale=1.0)

    for sx in (-1, 1):
        slate_dark_b.add_box(2.3, 0.50, 1.65, center=(sx * 6.8, -5.8, 11.75))
        gold_b.add_box(2.45, 0.56, 0.12, center=(sx * 6.8, -5.8, 12.62))
        add_space_invader(cyan_b if sx < 0 else pink_b, sx * 6.8, -6.08, 11.75, pixel=0.15, facing="Y")

    for b in (marble_b, dark_b, floor_b, slate_b, slate_dark_b, coral_b, gold_b, chrome_b, flame_b, glass_b, cyan_b, pink_b, gold_glow_b, green_b):
        b.finalize(col)


# ==============================================================================
# 2. INDOOR HALL (public/arcade-interior.glb) — INSIDE A GIANT GAMING PC / PS5
#    Coordinates are Blender (X, Y, Z-up). In Three.js the hall is rotated by PI:
#    Three.js X = -Blender X, Three.js Z = Blender Y.
# ==============================================================================

def build_arcade_machine_v3(B, primary_b, secondary_b, t_mold_b, glow_b, cx, cy, cz, s=1.0, theme="cyan", game_title="FLO SWEEP"):
    """Bold saturated upright cabinet (faces Blender -Y) with glowing T-molding,
    distinctive themed side art, slanted marquee lightbox, glowing control deck
    with dual joysticks and 12 glowing buttons, dual coin return slots, and 3D topper."""
    dark = B["cab_black"]
    chrome = B["chrome"]
    white = B["white"]
    screen = B["screen"]
    gold = B["gold"]

    def P(x, y, z):
        return (cx + x * s, cy + y * s, cz + z * s)

    # 1. Base Plinth & Neon Underglow
    dark.add_box(1.36 * s, 1.28 * s, 0.14 * s, center=P(0, 0, 0.07))
    t_mold_b.add_box(1.38 * s, 0.04 * s, 0.04 * s, center=P(0, -0.64, 0.04))
    t_mold_b.add_box(1.38 * s, 0.04 * s, 0.04 * s, center=P(0, 0.64, 0.04))

    # 2. Main Saturated Body (Lower cabinet & Upper cabinet)
    primary_b.add_box(1.20 * s, 1.04 * s, 1.28 * s, center=P(0, 0, 0.76))
    primary_b.add_box(1.20 * s, 0.86 * s, 1.16 * s, center=P(0, 0.09, 1.96))

    # 3. Flanking Side Wings with Glowing Neon T-Molding along the curved edge
    for sx in (-1, 1):
        # Outer vibrant primary side plate
        primary_b.add_box(0.08 * s, 1.12 * s, 2.82 * s, center=P(sx * 0.62, 0, 1.54))
        # Recessed secondary contrast panel
        secondary_b.add_box(0.09 * s, 0.94 * s, 2.56 * s, center=P(sx * 0.62, 0.02, 1.54))
        # Glowing Neon T-Molding contouring the entire forward and top perimeter
        t_mold_b.add_box(0.10 * s, 0.05 * s, 2.76 * s, center=P(sx * 0.62, -0.56, 1.54))
        t_mold_b.add_box(0.10 * s, 1.10 * s, 0.05 * s, center=P(sx * 0.62, 0.0, 2.94))
        # Themed Side-Art Livery Graphic
        if theme in ("astro", "cyan"):  # Astro Blaster starfighter wings
            glow_b.add_box(0.095 * s, 0.06 * s, 1.60 * s, center=P(sx * 0.62, 0.08, 1.30), rot=(0.58, 0, 0))
            white.add_box(0.095 * s, 0.04 * s, 1.10 * s, center=P(sx * 0.62, 0.28, 2.10), rot=(0.58, 0, 0))
            glow_b.add_ring(0.24 * s, 0.32 * s, 0.10 * s, segs=16, center=P(sx * 0.62, -0.05, 1.85), orientation="X")
        elif theme in ("brick", "gold"):  # Brick Smash candy brick lattice
            glow_b.add_box(0.095 * s, 0.08 * s, 0.90 * s, center=P(sx * 0.62, 0.10, 1.35), rot=(-0.45, 0, 0))
            B["cab_crimson"].add_box(0.095 * s, 0.08 * s, 0.90 * s, center=P(sx * 0.62, 0.10, 1.95), rot=(0.45, 0, 0))
            gold.add_ring(0.25 * s, 0.35 * s, 0.10 * s, segs=4, center=P(sx * 0.62, -0.02, 1.70), orientation="X")
        elif theme in ("racer", "pink"):  # Turbo Drift checkered speed stripes
            for ck in range(6):
                cb = white if ck % 2 == 0 else dark
                cb.add_box(0.095 * s, 0.14 * s, 0.22 * s, center=P(sx * 0.62, -0.32 + ck * 0.13, 1.55 + ck * 0.12))
            glow_b.add_box(0.095 * s, 0.05 * s, 1.70 * s, center=P(sx * 0.62, 0.12, 1.65), rot=(0.50, 0, 0))
        else:  # Pixel Hopper platform steps
            for ck in range(5):
                cz_h = (0.28 + ck * 0.14) * s
                (glow_b if ck != 1 else B["cab_crimson"]).add_box(0.095 * s, 0.12 * s, cz_h, center=P(sx * 0.62, -0.28 + ck * 0.16, 1.25 + ck * 0.15))

    # 4. Marquee Housing & Illuminated Backlit Marquee Header
    dark.add_box(1.24 * s, 0.96 * s, 0.36 * s, center=P(0, 0.02, 2.68))
    primary_b.add_box(1.26 * s, 0.98 * s, 0.06 * s, center=P(0, 0.02, 2.88))
    t_mold_b.add_box(1.28 * s, 0.05 * s, 0.05 * s, center=P(0, -0.48, 2.88))
    # Glowing Marquee Face
    glow_b.add_box(1.10 * s, 0.04 * s, 0.26 * s, center=P(0, -0.47, 2.68))
    # Marquee Lettering / Emblem plate
    dark.add_box(0.85 * s, 0.045 * s, 0.10 * s, center=P(0, -0.485, 2.68))
    white.add_box(0.75 * s, 0.048 * s, 0.05 * s, center=P(0, -0.49, 2.68))

    # Dual Stereo Speaker Grille Underneath Marquee (angled downward toward player)
    dark.add_box(1.12 * s, 0.32 * s, 0.08 * s, center=P(0, -0.36, 2.45), rot=(-0.25, 0, 0))
    for sx in (-0.32, 0.32):
        t_mold_b.add_ring(0.07 * s, 0.10 * s, 0.04 * s, segs=12, center=P(sx, -0.36, 2.45), orientation="Y")

    # 5. Angled CRT Monitor, Screen Bezel, and Game Pixel Art
    # Outer Bezel
    dark.add_box(1.08 * s, 0.06 * s, 0.92 * s, center=P(0, -0.31, 1.95))
    secondary_b.add_box(1.00 * s, 0.065 * s, 0.84 * s, center=P(0, -0.315, 1.95))
    # CRT Screen
    screen.add_box(0.90 * s, 0.05 * s, 0.74 * s, center=P(0, -0.335, 1.95))
    # Screen High-Score Header
    white.add_box(0.42 * s, 0.02 * s, 0.04 * s, center=P(-0.18, -0.365, 2.22))
    glow_b.add_box(0.24 * s, 0.02 * s, 0.04 * s, center=P(0.25, -0.365, 2.22))
    # Themed Pixel Game Scene on the CRT
    if theme in ("astro", "cyan"):  # Astro Blaster space shooter
        add_space_invader(glow_b, cx, cy - 0.372 * s, cz + 2.00 * s, pixel=0.040 * s, facing="Y")
        for si in range(4):
            glow_b.add_box(0.06 * s, 0.02 * s, 0.06 * s, center=P(-0.25 + si * 0.09, -0.368, 1.82))
        white.add_box(0.06 * s, 0.02 * s, 0.06 * s, center=P(0.22, -0.368, 1.95))
    elif theme in ("brick", "gold"):  # Brick Smash breakout
        for row in range(3):
            for col in range(6):
                (glow_b if row % 2 == 0 else B["cab_crimson"]).add_box(0.10 * s, 0.02 * s, 0.04 * s,
                    center=P(-0.35 + col * 0.14, -0.368, 2.12 - row * 0.07))
        white.add_box(0.24 * s, 0.025 * s, 0.04 * s, center=P(0.04, -0.368, 1.68))
        glow_b.add_sphere(0.035 * s, segs=8, center=P(-0.06, -0.368, 1.85))
    elif theme in ("racer", "pink"):  # Turbo Drift highway racer
        for ln in (-0.24, 0.0, 0.24):
            white.add_box(0.02 * s, 0.02 * s, 0.10 * s, center=P(ln, -0.368, 2.05))
            white.add_box(0.02 * s, 0.02 * s, 0.10 * s, center=P(ln, -0.368, 1.75))
        B["cab_amber"].add_box(0.12 * s, 0.025 * s, 0.16 * s, center=P(0.0, -0.368, 1.68))
        glow_b.add_box(0.12 * s, 0.025 * s, 0.16 * s, center=P(-0.24, -0.368, 2.02))
        white.add_sphere(0.035 * s, segs=8, center=P(0.24, -0.368, 1.90))
    else:  # Pixel Hopper platform jumper
        glow_b.add_box(0.08 * s, 0.025 * s, 0.28 * s, center=P(-0.25, -0.368, 2.08))
        glow_b.add_box(0.08 * s, 0.025 * s, 0.20 * s, center=P(-0.25, -0.368, 1.65))
        B["cab_crimson"].add_box(0.08 * s, 0.025 * s, 0.22 * s, center=P(0.25, -0.368, 2.15))
        B["cab_crimson"].add_box(0.08 * s, 0.025 * s, 0.26 * s, center=P(0.25, -0.368, 1.68))
        gold.add_sphere(0.045 * s, segs=8, center=P(0.02, -0.368, 1.88))

    # 6. Ergonomic Control Deck with Joysticks & Dual 6-Button Arcades
    dark.add_box(1.24 * s, 0.46 * s, 0.14 * s, center=P(0, -0.50, 1.44), rot=(0.18, 0, 0))
    t_mold_b.add_box(1.26 * s, 0.05 * s, 0.05 * s, center=P(0, -0.73, 1.40))
    # Dual Joysticks (Player 1 & Player 2)
    for jx in (-0.32, 0.14):
        chrome.add_cyl(0.022 * s, 0.022 * s, 0.16 * s, segs=8, center=P(jx, -0.52, 1.56))
        glow_b.add_sphere(0.062 * s, segs=10, center=P(jx, -0.52, 1.66))
        # 6 Action Pushbuttons per player (dual row of 3)
        for row_i, by_off in enumerate((-0.46, -0.58)):
            for btn_i, bx_off in enumerate((0.14, 0.23, 0.32)):
                btn_glow = glow_b if (row_i + btn_i) % 2 == 0 else white
                btn_glow.add_cyl(0.030 * s, 0.030 * s, 0.05 * s, segs=8, center=P(jx + bx_off, by_off, 1.52))

    # Player 1 / Player 2 Start Buttons on the front angled bevel
    for sx, btn_c in ((-0.16, glow_b), (0.16, white)):
        btn_c.add_cyl(0.026 * s, 0.026 * s, 0.04 * s, segs=8, center=P(sx, -0.66, 1.34), rot=(math.pi * 0.45, 0, 0))

    # 7. Lower Cabinet Coin Door with Glowing 25¢ Insert Reject Buttons
    dark.add_box(0.56 * s, 0.04 * s, 0.60 * s, center=P(0, -0.52, 0.74))
    secondary_b.add_box(0.50 * s, 0.045 * s, 0.54 * s, center=P(0, -0.52, 0.74))
    for sx in (-0.12, 0.12):
        # 25¢ glowing orange reject button
        B["gold_glow"].add_box(0.08 * s, 0.02 * s, 0.11 * s, center=P(sx, -0.545, 0.86))
        dark.add_box(0.04 * s, 0.025 * s, 0.015 * s, center=P(sx, -0.55, 0.86))  # coin slot
        dark.add_box(0.10 * s, 0.03 * s, 0.12 * s, center=P(sx, -0.54, 0.64))   # coin return cup

    # 8. Distinctive 3D Cabinet Topper
    top_z = 2.90
    dark.add_cyl(0.32 * s, 0.38 * s, 0.10 * s, segs=14, center=P(0, 0.02, top_z + 0.05))
    if theme in ("astro", "cyan"):  # 3D Starfighter Spaceship topper
        white.add_box(0.42 * s, 0.34 * s, 0.18 * s, center=P(0, 0.02, top_z + 0.22))
        glow_b.add_box(0.68 * s, 0.22 * s, 0.06 * s, center=P(0, 0.02, top_z + 0.20))
        chrome.add_cyl(0.025 * s, 0.025 * s, 0.32 * s, segs=8, center=P(-0.30, -0.06, top_z + 0.24))
        chrome.add_cyl(0.025 * s, 0.025 * s, 0.32 * s, segs=8, center=P(0.30, -0.06, top_z + 0.24))
        gold.add_sphere(0.08 * s, segs=10, center=P(0, -0.08, top_z + 0.28))
    elif theme in ("brick", "gold"):  # 3D Gold Star & Paddle topper
        chrome.add_cyl(0.16 * s, 0.16 * s, 0.28 * s, segs=12, center=P(0, 0.02, top_z + 0.22))
        glow_b.add_ring(0.18 * s, 0.24 * s, 0.08 * s, segs=12, center=P(0, 0.02, top_z + 0.22), orientation="Z")
        glow_b.add_box(0.48 * s, 0.10 * s, 0.12 * s, center=P(0, 0.02, top_z + 0.44))
        white.add_sphere(0.08 * s, segs=8, center=P(0, 0.02, top_z + 0.62))
    elif theme in ("racer", "pink"):  # 3D Retro Red Sports Car topper
        B["cab_crimson"].add_box(0.68 * s, 0.36 * s, 0.22 * s, center=P(0, 0.02, top_z + 0.20))
        dark.add_box(0.50 * s, 0.30 * s, 0.16 * s, center=P(0, 0.02, top_z + 0.38))
        white.add_box(0.69 * s, 0.365 * s, 0.06 * s, center=P(0, 0.02, top_z + 0.20))  # racing stripe
        white.add_sphere(0.05 * s, segs=8, center=P(-0.24, -0.17, top_z + 0.20))       # headlights
        white.add_sphere(0.05 * s, segs=8, center=P(0.24, -0.17, top_z + 0.20))
    else:  # 3D Pixel Hopper character topper
        B["cab_violet"].add_box(0.32 * s, 0.28 * s, 0.36 * s, center=P(0, 0.02, top_z + 0.26))
        B["cab_crimson"].add_box(0.34 * s, 0.22 * s, 0.08 * s, center=P(0, -0.04, top_z + 0.44))
        white.add_box(0.30 * s, 0.26 * s, 0.08 * s, center=P(0, 0.02, top_z + 0.10))
        gold.add_sphere(0.07 * s, segs=8, center=P(0, 0.02, top_z + 0.58))

    # 9. Padded Arcade Barstool with Chrome Pedestal
    sy = -1.18
    chrome.add_cyl(0.32 * s, 0.36 * s, 0.06 * s, segs=16, center=P(0, sy, 0.03))
    chrome.add_ring(0.24 * s, 0.28 * s, 0.04 * s, segs=16, center=P(0, sy, 0.24), orientation="Z")
    chrome.add_cyl(0.055 * s, 0.055 * s, 0.58 * s, segs=12, center=P(0, sy, 0.34))
    primary_b.add_cyl(0.32 * s, 0.30 * s, 0.14 * s, segs=18, center=P(0, sy, 0.67))
    t_mold_b.add_ring(0.29 * s, 0.33 * s, 0.05 * s, segs=18, center=P(0, sy, 0.72), orientation="Z")


def add_ps5_pillar(white_b, core_b, glow_b, x, y, height, side):
    """PS5-style pillar: black core, glowing light-bar seams and two gloss-white
    shells that curve outward toward the top (like the console's wings)."""
    core_b.add_box(0.50, 0.90, height, center=(x, y, height * 0.5))
    for inward in (-1, 1):  # -1 = toward hall centre, +1 = toward wall
        glow_b.add_box(0.05, 0.96, height * 0.96, center=(x + inward * side * 0.29, y, height * 0.5))
        segs = 7
        for i in range(segs):
            t = (i + 0.5) / segs
            seg_h = height / segs
            offs = 0.36 + 0.30 * (t ** 1.6)
            width = 1.20 * (1.0 + 0.40 * (t ** 1.4))
            white_b.add_box(0.16, width, seg_h + 0.03, center=(x + inward * side * offs, y, t * height))
    core_b.add_box(1.30, 1.40, 0.24, center=(x, y, 0.12))
    glow_b.add_box(1.34, 1.44, 0.04, center=(x, y, 0.26))


def build_arcade_interior(col):
    names = {
        "marble": "Arcade_Marble_Cream", "slate": "Arcade_Royal_Slate", "slate_dark": "Arcade_Slate_Dark",
        "gold": "Arcade_Gold_Trim", "chrome": "Arcade_Chrome", "glass": "Arcade_Glass",
        "cyan": "Arcade_Glow_Cyan", "gold_glow": "Arcade_Glow_Gold", "pink": "Arcade_Glow_Pink",
        "green": "Arcade_Glow_Green", "white": "Arcade_Glow_White",
        "cab_cyan": "Arcade_Cab_Cyan", "cab_navy": "Arcade_Cab_Navy",
        "cab_amber": "Arcade_Cab_Amber", "cab_crimson": "Arcade_Cab_Crimson",
        "cab_magenta": "Arcade_Cab_Magenta", "cab_violet": "Arcade_Cab_Violet",
        "cab_emerald": "Arcade_Cab_Emerald", "cab_teal": "Arcade_Cab_Teal",
        "cab_blue": "Arcade_Cab_Blue", "cab_orange": "Arcade_Cab_Orange",
        "cab_black": "Arcade_Cab_Black", "copper": "Arcade_Copper",
        "coolant_cyan": "Arcade_Coolant_Cyan", "coolant_pink": "Arcade_Coolant_Pink",
        "carpet": "Arcade_Carpet", "screen": "Arcade_Screen", "ps5_white": "Arcade_PS5_White",
    }
    mat_keys = {
        "marble": "marble", "slate": "slate", "slate_dark": "slate_dark", "gold": "gold", "chrome": "chrome",
        "glass": "glass", "cyan": "glow_cyan", "gold_glow": "glow_gold", "pink": "glow_pink", "green": "glow_green",
        "white": "glow_white", "cab_cyan": "cab_cyan", "cab_navy": "cab_navy",
        "cab_amber": "cab_amber", "cab_crimson": "cab_crimson", "cab_magenta": "cab_magenta",
        "cab_violet": "cab_violet", "cab_emerald": "cab_emerald", "cab_teal": "cab_teal",
        "cab_blue": "cab_blue", "cab_orange": "cab_orange", "cab_black": "cab_black",
        "copper": "copper", "coolant_cyan": "coolant_cyan", "coolant_pink": "coolant_pink",
        "carpet": "carpet", "screen": "screen", "ps5_white": "ps5_white",
    }
    B = {k: Builder(names[k], MATS[mat_keys[k]]) for k in names}
    cyan, pink, goldg, green, white = B["cyan"], B["pink"], B["gold_glow"], B["green"], B["white"]
    dark, slate, ps5 = B["cab_black"], B["slate_dark"], B["ps5_white"]
    copper, coolant_c, coolant_p = B["copper"], B["coolant_cyan"], B["coolant_pink"]
    neon = [cyan, pink, goldg, green]

    W, D, H = 28.0, 32.0, 11.4  # hall: x ±14, y ±16

    # ------------------------------------------------------------------
    # 1. ARCADE CARPET FLOOR — classic neon confetti pattern + glowing circuit grid
    # ------------------------------------------------------------------
    B["carpet"].add_box(W + 0.4, D + 0.4, 0.24, center=(0, 0, -0.12))
    seed = [1337]

    def rnd():
        seed[0] = (seed[0] * 1103515245 + 12345) % 2147483648
        return seed[0] / 2147483648.0

    placed_pts = []
    tries = 0
    while len(placed_pts) < 170 and tries < 3000:
        tries += 1
        px = -13.2 + rnd() * 26.4
        py = -15.2 + rnd() * 20.8
        if math.hypot(px, py + 2.2) < 3.2:
            continue
        if any(math.hypot(px - qx, py - qy) < 1.05 for qx, qy in placed_pts):
            continue
        placed_pts.append((px, py))
        b = neon[len(placed_pts) % 4]
        kind = len(placed_pts) % 5
        ang = rnd() * math.pi
        if kind == 0:
            b.add_ring(0.14, 0.22, 0.02, segs=14, center=(px, py, 0.012), orientation="Z")
        elif kind == 1:
            b.add_ring(0.12, 0.24, 0.02, segs=3, center=(px, py, 0.012), orientation="Z")
        elif kind == 2:  # zig-zag squiggle
            for k in range(3):
                b.add_box(0.22, 0.06, 0.02, center=(px + (k - 1) * 0.16 * math.cos(ang), py + (k - 1) * 0.16 * math.sin(ang), 0.012),
                          rot=(0, 0, ang + (0.7 if k % 2 == 0 else -0.7)))
        elif kind == 3:
            b.add_cyl(0.07, 0.07, 0.02, segs=10, center=(px, py, 0.012))
        else:
            b.add_box(0.42, 0.07, 0.02, center=(px, py, 0.012), rot=(0, 0, ang))

    # Glowing aisle runners leading from the door to the stage
    for sx in (-1, 1):
        cyan.add_box(0.08, 20.6, 0.025, center=(sx * 2.4, -4.6, 0.014))
        pink.add_box(0.05, 20.6, 0.025, center=(sx * 2.7, -4.6, 0.014))

    # Central PS power-button medallion under the GPU fan (Three.js z = -2.2)
    med_y = -2.2
    dark.add_cyl(2.7, 2.7, 0.03, segs=40, center=(0, med_y, 0.016))
    cyan.add_ring(2.35, 2.6, 0.04, segs=40, center=(0, med_y, 0.02), orientation="Z")
    white.add_ring(1.35, 1.55, 0.045, segs=32, center=(0, med_y, 0.022), orientation="Z", arc_pi=2.0)
    white.add_box(0.22, 1.2, 0.05, center=(0, med_y + 0.9, 0.024))
    add_controller_symbol(green, "triangle", (0, med_y + 1.95, 0.025), radius=0.26, depth=0.03, orientation="Z")
    add_controller_symbol(pink, "circle", (1.95, med_y, 0.025), radius=0.26, depth=0.03, orientation="Z")
    add_controller_symbol(goldg, "square", (-1.95, med_y, 0.025), radius=0.26, depth=0.03, orientation="Z")

    # ------------------------------------------------------------------
    # 2. SHELL: black PC-case walls + solid ceiling
    # ------------------------------------------------------------------
    for sx in (-1, 1):
        dark.add_box(0.6, D, H, center=(sx * (W * 0.5 - 0.2), 0, H * 0.5))
    dark.add_box(W, 0.6, H, center=(0, -D * 0.5 + 0.2, H * 0.5))
    dark.add_box(W, 0.6, H, center=(0, D * 0.5 - 0.2, H * 0.5))
    slate.add_box(W + 0.4, D + 0.4, 0.4, center=(0, 0, H + 0.2))

    # Neon perimeter tubes (Blender +X = Three.js left -> cyan, Blender -X = right -> pink)
    cyan.add_box(0.14, D - 1.0, 0.14, center=(13.35, 0, H - 0.25))
    pink.add_box(0.14, D - 1.0, 0.14, center=(-13.35, 0, H - 0.25))
    cyan.add_box(0.14, D - 1.0, 0.10, center=(13.35, 0, 0.18))
    pink.add_box(0.14, D - 1.0, 0.10, center=(-13.35, 0, 0.18))
    goldg.add_box(W - 1.0, 0.14, 0.14, center=(0, 15.35, H - 0.25))
    goldg.add_box(W - 1.0, 0.14, 0.14, center=(0, -15.35, H - 0.25))

    # ------------------------------------------------------------------
    # 3. CEILING: COLOSSAL TRIPLE-FAN GRAPHICS CARD + COPPER HEATPIPES
    # ------------------------------------------------------------------
    gpu_y0, gpu_y1 = -10.0, 5.6
    gpu_len = gpu_y1 - gpu_y0
    gpu_cy = (gpu_y0 + gpu_y1) * 0.5
    slate.add_box(7.4, gpu_len, 0.30, center=(0, gpu_cy, H - 0.18))
    for sx in (-1, 1):
        ps5.add_box(0.55, gpu_len, 0.55, center=(sx * 3.45, gpu_cy, H - 0.55))
        cyan.add_box(0.06, gpu_len, 0.10, center=(sx * 3.12, gpu_cy, H - 0.62))
    for sy in (gpu_y0, gpu_y1):
        ps5.add_box(7.4, 0.55, 0.55, center=(0, sy, H - 0.55))
    for fy, fglow in ((-7.4, pink), (med_y, cyan), (3.0, goldg)):
        add_rgb_cooling_fan(slate, B["chrome"], fglow, (0, fy, H - 0.75), radius=2.35, depth=0.32, orientation="Z", blades=11)

    # Exposed Copper Heatpipes Running through the GPU Heatsink Fin Array
    for k in range(5):
        copper.add_box(0.10, gpu_len - 1.2, 0.10, center=(-1.8 + k * 0.9, gpu_cy, H - 0.42))
    # Glowing GPU side logo ("GEFORCE RTX / AGY EDITION")
    cyan.add_box(0.08, 4.4, 0.24, center=(3.72, gpu_cy, H - 0.55))
    white.add_box(0.09, 3.8, 0.12, center=(3.73, gpu_cy, H - 0.55))
    # GPU power connectors glowing on the side
    for k in range(4):
        goldg.add_box(0.22, 0.38, 0.12, center=(3.75, 4.0 - k * 0.5, H - 0.55))

    # ------------------------------------------------------------------
    # 4. COLOSSAL LIQUID COOLING LOOP: Acrylic Tubes & Vertical Reservoir
    # ------------------------------------------------------------------
    # Vertical Cylindrical Coolant Reservoir in corner (Blender x = 11.8, y = -12.5)
    slate.add_cyl(1.30, 1.30, 0.35, segs=24, center=(11.8, -12.5, 0.17))
    B["chrome"].add_cyl(1.10, 1.10, 0.20, segs=24, center=(11.8, -12.5, 0.44))
    coolant_c.add_cyl(0.95, 0.95, 6.20, segs=24, center=(11.8, -12.5, 3.64))
    B["glass"].add_cyl(1.05, 1.05, 6.30, segs=24, center=(11.8, -12.5, 3.64))
    slate.add_cyl(1.30, 1.30, 0.40, segs=24, center=(11.8, -12.5, 6.94))
    cyan.add_ring(1.10, 1.25, 0.12, segs=24, center=(11.8, -12.5, 7.00), orientation="Z")

    # Overhead Liquid Coolant Loop running along the upper side walls
    coolant_c.add_box(0.16, 26.0, 0.16, center=(12.2, 0.0, 7.8))
    coolant_p.add_box(0.16, 26.0, 0.16, center=(-12.2, 0.0, 7.8))
    # Cross-hall ceiling pipe bridges
    coolant_c.add_box(24.4, 0.16, 0.16, center=(0.0, -8.0, 8.8))
    coolant_p.add_box(24.4, 0.16, 0.16, center=(0.0, 4.0, 8.8))

    # ------------------------------------------------------------------
    # 5. PS5 PILLARS along both aisles (Three.js colliders at x = ±8.2)
    # ------------------------------------------------------------------
    rib_ys = [-11.5, -6.0, -0.5, 5.0, 10.5]
    for sx in (-1, 1):
        for idx, ry in enumerate(rib_ys):
            add_ps5_pillar(ps5, dark, cyan if (idx + (sx > 0)) % 2 == 0 else pink, sx * 8.2, ry, H - 0.4, sx)

    # ------------------------------------------------------------------
    # 6. SIDE WALLS: tempered-glass panels, 3 big RGB fans, RAM sticks, symbols
    # ------------------------------------------------------------------
    for sx in (-1, 1):
        wx = sx * 13.62
        inner = -sx
        wall_glow = cyan if sx > 0 else pink
        # Smoked tempered-glass panel frame
        slate.add_box(0.12, 20.4, 7.8, center=(wx + inner * 0.06, -3.4, 5.0))
        B["chrome"].add_box(0.14, 20.6, 0.10, center=(wx + inner * 0.08, -3.4, 8.95))
        B["chrome"].add_box(0.14, 20.6, 0.10, center=(wx + inner * 0.08, -3.4, 1.05))
        for fy, fglow in ((-10.0, cyan), (-3.4, pink), (3.2, goldg if sx > 0 else green)):
            add_rgb_cooling_fan(dark, B["chrome"], fglow, (wx + inner * 0.30, fy, 5.0), radius=2.2, depth=0.40, orientation="X", blades=9)
        # Diagonal RGB light bars between fans
        for fy in (-6.7, -0.1):
            wall_glow.add_box(0.06, 0.12, 6.4, center=(wx + inner * 0.16, fy, 5.0), rot=(0.35, 0, 0))
        # RAM sticks near the stage
        for r_idx, r_glow in enumerate(neon):
            ry_pos = 7.0 + r_idx * 1.1
            dark.add_box(0.40, 0.62, 7.4, center=(wx + inner * 0.45, ry_pos, 4.1))
            B["gold"].add_box(0.44, 0.68, 0.30, center=(wx + inner * 0.45, ry_pos, 0.5))
            r_glow.add_box(0.46, 0.40, 6.2, center=(wx + inner * 0.52, ry_pos, 4.4))
        # Giant controller symbols above the glass
        syms = ("triangle", "circle", "cross", "square")
        for k, (sym, sb) in enumerate(zip(syms, (green, pink, cyan, goldg))):
            add_controller_symbol(sb, sym, (wx + inner * 0.32, -11.5 + k * 5.2, 10.0), radius=0.6, depth=0.18, orientation="X")

    # ------------------------------------------------------------------
    # 7. ARCADE SIDE AMENITIES: Token Dispenser & Prize Counter Wall
    # ------------------------------------------------------------------
    # Change / Token Dispenser machine (Blender x = -12.8, y = -7.5)
    dark.add_box(0.8, 1.6, 2.4, center=(-12.8, -7.5, 1.5))
    goldg.add_box(0.82, 1.2, 0.28, center=(-12.8, -7.5, 2.4))
    white.add_box(0.84, 0.8, 0.08, center=(-12.8, -7.5, 2.4))  # "CHANGE 25¢"
    goldg.add_box(0.84, 0.32, 0.18, center=(-12.8, -7.5, 1.2))  # token cup
    cyan.add_box(0.82, 0.06, 0.36, center=(-12.8, -7.5, 1.7))   # arrow down

    # Arcade Prize Display Showcase on opposite wall (Blender x = 12.8, y = -7.5)
    slate.add_box(0.6, 5.2, 3.8, center=(12.8, -7.5, 2.4))
    pink.add_box(0.62, 5.4, 0.08, center=(12.8, -7.5, 4.35))
    white.add_box(0.64, 2.4, 0.10, center=(12.8, -7.5, 4.35))  # "PRIZES"
    for shelf_i in range(3):
        sz = 1.0 + shelf_i * 1.0
        B["glass"].add_box(0.55, 4.8, 0.06, center=(12.8, -7.5, sz))
        for pj in range(5):
            pb = neon[(shelf_i + pj) % 4]
            pb.add_sphere(0.18, segs=10, center=(12.6, -9.1 + pj * 0.8, sz + 0.20))

    # ------------------------------------------------------------------
    # 8. ENTRANCE WALL: PS5 console front framing the doors
    # ------------------------------------------------------------------
    ey = -15.5
    for sx in (-1, 1):
        for i in range(8):
            t = (i + 0.5) / 8
            seg_h = 9.6 / 8
            offs = 2.4 + 1.6 * (t ** 1.6)
            ps5.add_box(1.8 + 0.6 * t, 0.30, seg_h + 0.03, center=(sx * (offs + 0.9), ey + 0.2, t * 9.6))
        cyan.add_box(0.10, 0.34, 9.4, center=(sx * 2.25, ey + 0.22, 4.7))
        add_space_invader(cyan if sx > 0 else pink, sx * 8.6, ey + 0.32, 5.6, pixel=0.17, facing="Y")
    white.add_ring(1.75, 1.95, 0.30, segs=28, center=(0, ey + 0.25, 5.0), orientation="Y", arc_pi=1.0)
    for sx in (-1, 1):
        dark.add_box(1.55, 0.18, 5.0, center=(sx * 0.82, ey + 0.32, 2.5))
        cyan.add_box(0.06, 0.20, 4.6, center=(sx * 0.12, ey + 0.34, 2.5))

    # ------------------------------------------------------------------
    # 9. BACK WALL: motherboard + ARCADE marquee + AIO pump fans
    # ------------------------------------------------------------------
    by = 15.45
    slate.add_box(26.4, 0.10, 10.2, center=(0, by - 0.05, 5.4))
    for k in range(9):  # gold PCB traces
        tx = -12.0 + k * 3.0
        B["gold"].add_box(0.07, 0.04, 9.0, center=(tx, by - 0.12, 5.2))
    for k in range(4):
        B["gold"].add_box(26.0, 0.04, 0.07, center=(0, by - 0.12, 1.4 + k * 2.8))
    dark.add_box(12.4, 0.40, 3.4, center=(0, by - 0.25, 8.0))
    goldg.add_box(12.6, 0.44, 0.12, center=(0, by - 0.25, 9.75))
    goldg.add_box(12.6, 0.44, 0.12, center=(0, by - 0.25, 6.25))
    add_arcade_word(B["gold"], pink, 0, by - 0.50, 8.0, scale=1.28)
    for sx in (-1, 1):
        add_rgb_cooling_fan(dark, B["chrome"], cyan if sx > 0 else pink, (sx * 9.6, by - 0.3, 7.6), radius=1.7, depth=0.36, orientation="Y")

    # ------------------------------------------------------------------
    # 10. RAISED STAGE (Blender y 6.2 -> 15.4, 0.65 m) with neon step edges
    # ------------------------------------------------------------------
    for step_i in range(4):
        sy0 = 6.2 + step_i * 0.45
        sd = 15.4 - sy0
        sz = (step_i + 0.5) * 0.1625
        slate.add_box(14.2, sd, 0.1625, center=(0, sy0 + sd * 0.5, sz))
        (cyan if step_i % 2 == 0 else pink).add_box(14.0, 0.05, 0.04, center=(0, sy0 - 0.01, sz + 0.06))
    dark.add_box(13.8, 7.6, 0.03, center=(0, 11.5, 0.655))
    for k in range(-3, 4):  # stage floor light lines
        cyan.add_box(0.04, 7.0, 0.02, center=(k * 2.0, 11.6, 0.67))

    # ------------------------------------------------------------------
    # 11. 4 CLASSIC RETRO ARCADE MACHINES (playful Bruno-Simon palette!),
    #     2 CLAW MACHINES WITH CLEAR GLASS, AND AIR HOCKEY TABLE
    # ------------------------------------------------------------------
    machines = [
        # (mx, my, primary_b, secondary_b, t_mold_b, glow_b, theme, game_title)
        (5.1, 10.2, B["cab_cyan"], B["white"], B["cab_crimson"], cyan, "astro", "ASTRO BLASTER"),
        (1.7, 11.0, B["cab_amber"], B["cab_navy"], B["cab_crimson"], goldg, "brick", "BRICK SMASH"),
        (-1.7, 11.0, B["cab_crimson"], B["white"], goldg, B["cab_crimson"], "racer", "TURBO DRIFT"),
        (-5.1, 10.2, B["cab_violet"], B["cab_magenta"], goldg, pink, "hopper", "PIXEL HOPPER"),
    ]
    for mx, my, pri, sec, tmold, glow, theme, title in machines:
        build_arcade_machine_v3(B, pri, sec, tmold, glow, mx, my, 0.65, s=1.55, theme=theme, game_title=title)

    prizes = [pink, cyan, goldg, green]
    build_claw_machine(B["cab_crimson"], B["white"], B["gold"], B["chrome"], B["glass"], goldg, prizes,
                       cx=4.6, cy=-5.5, cz=0.0, scale=1.45, facing_dir=(-1, 0))
    build_claw_machine(B["white"], B["cab_crimson"], B["gold"], B["chrome"], B["glass"], cyan, prizes,
                       cx=4.6, cy=-1.2, cz=0.0, scale=1.45, facing_dir=(-1, 0))
    build_air_hockey(B["cab_crimson"], B["carpet"], B["gold"], B["chrome"], cyan, B["cab_crimson"], white,
                     cx=-4.4, cy=-3.3, cz=0.0, scale=1.45)

    for b in B.values():
        b.finalize(col)


def setup_scene_and_export():
    clear_scene()
    init_materials()
    scene = bpy.context.scene
    os.makedirs(PUBLIC_DIR, exist_ok=True)

    # 1. Build & Export Exterior Arcade Pavilion (public/arcade.glb)
    ext_col = bpy.data.collections.new("ArcadeExterior")
    scene.collection.children.link(ext_col)
    build_arcade_exterior(ext_col)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in ext_col.objects:
        obj.select_set(True)
    ext_glb = os.path.join(PUBLIC_DIR, "arcade.glb")
    bpy.ops.export_scene.gltf(
        filepath=ext_glb,
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )
    print(f"[Arcade] Exported Exterior -> {ext_glb}")

    # 2. Build & Export Indoor PC/PS5 Arcade Hall (public/arcade-interior.glb)
    int_col = bpy.data.collections.new("ArcadeInterior")
    scene.collection.children.link(int_col)
    build_arcade_interior(int_col)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in int_col.objects:
        obj.select_set(True)
    int_glb = os.path.join(PUBLIC_DIR, "arcade-interior.glb")
    bpy.ops.export_scene.gltf(
        filepath=int_glb,
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )
    print(f"[Arcade] Exported Interior -> {int_glb}")

    # 3. Shift Exterior to X = -42 so both Exterior and Interior have a wide gap in Blender
    for obj in ext_col.objects:
        obj.location.x -= 42.0

    # Lighting for Blender Viewport & Preview Renders (use_shadow = False on point lights to prevent shadow buffer overflow)
    sun_data = bpy.data.lights.new(name="Arcade_Sun", type="SUN")
    sun_data.energy = 2.8
    sun_data.color = (1.0, 0.94, 0.86)
    sun_obj = bpy.data.objects.new(name="Arcade_Sun", object_data=sun_data)
    sun_obj.rotation_euler = Euler((math.radians(50), math.radians(16), math.radians(28)), "XYZ")
    scene.collection.objects.link(sun_obj)

    pt_lights = [
        (0.0, 8.5, 4.8, (1.0, 0.85, 0.50), 650.0),
        (5.5, -3.3, 4.2, (0.2, 0.88, 1.0), 520.0),
        (-5.5, -3.3, 4.2, (1.0, 0.42, 0.68), 520.0),
        (0.0, -2.2, 6.5, (0.5, 0.90, 1.0), 480.0),
        (-42.0, -9.0, 6.5, (1.0, 0.85, 0.55), 650.0),
    ]
    for idx, (lx, ly, lz, col_rgb, energy) in enumerate(pt_lights):
        ld = bpy.data.lights.new(name=f"Arcade_Light_{idx}", type="POINT")
        ld.energy = energy
        ld.color = col_rgb
        ld.use_shadow = False
        lo = bpy.data.objects.new(name=f"Arcade_Light_{idx}", object_data=ld)
        lo.location = (lx, ly, lz)
        scene.collection.objects.link(lo)

    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.10, 0.14, 0.25, 1.0)
        bg.inputs[1].default_value = 0.95

    cam_data = bpy.data.cameras.new(name="Arcade_Cam")
    cam_data.lens = 21.0
    cam_obj = bpy.data.objects.new(name="Arcade_Cam", object_data=cam_data)
    cam_obj.location = (0.0, -12.6, 5.2)
    direction = Vector((0.0, 4.0, 2.6)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    if not bpy.app.background:
        try:
            for window in bpy.context.window_manager.windows:
                for area in window.screen.areas:
                    if area.type == "VIEW_3D":
                        for space in area.spaces:
                            if space.type == "VIEW_3D":
                                space.shading.type = "MATERIAL"
                                space.region_3d.view_perspective = "CAMERA"
        except Exception as exc:
            print("Viewport note:", exc)

        scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_x = 1280
        scene.render.resolution_y = 720
        scene.render.filepath = PREVIEW_PATH
        bpy.ops.render.render(write_still=True)
        print(f"[Arcade] Rendered interior preview -> {PREVIEW_PATH}")

        # Render Exterior Preview as well
        cam_obj.location = (-33.5, -26.5, 11.0)
        ext_dir = Vector((-42.0, 0.0, 5.6)) - cam_obj.location
        cam_obj.rotation_euler = ext_dir.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = EXT_PREVIEW_PATH
        bpy.ops.render.render(write_still=True)
        print(f"[Arcade] Rendered exterior preview -> {EXT_PREVIEW_PATH}")

        # Restore camera to Interior Hall for Live Viewport
        cam_obj.location = (0.0, -12.6, 5.2)
        cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


if __name__ == "__main__":
    setup_scene_and_export()
