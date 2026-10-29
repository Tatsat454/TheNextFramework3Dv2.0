import bpy
import bmesh
import math
import os
from mathutils import Vector, Euler, Matrix

# ==============================================================================
# TEMPLE OF TRIBULATIONS — 5 INTERACTIVE PROJECT STATUE ASSETS BUILDER
# Exports 5 standalone .glb models to public/:
#   1. statue-lightning.glb  (PJM Electricity Paper — Lightning Bolt)
#   2. statue-stocks.glb     (Stock Market Research — 3D Graph & Candlesticks)
#   3. statue-pokemon.glb    (Pokemon RL Model — GameBoy + Pikachu + Pokéball)
#   4. statue-robot.glb      (Flo the Robot — Hovering Helper Robot)
#   5. statue-bellman.glb    (DDC Taxi Model — NYC Taxi + 3D Bellman Equation)
# ==============================================================================

if "WORKSPACE_DIR" not in globals():
    WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(WORKSPACE_DIR, "public")


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def get_mat(name, hex_color, roughness=0.4, metallic=0.0, emission_hex=None, emission_strength=0.0):
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


class PartBuilder:
    def __init__(self, name, material):
        self.name = name
        self.material = material
        self.bm = bmesh.new()

    def add_box(self, sx, sy, sz, center=(0, 0, 0), rot=(0, 0, 0)):
        mat = Matrix.Translation(Vector(center)) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((sx, sy, sz, 1.0))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=mat)

    def add_cyl(self, r1, r2, h, segs=16, center=(0, 0, 0), rot=(0, 0, 0)):
        mat = Matrix.Translation(Vector(center)) @ Euler(rot, "XYZ").to_matrix().to_4x4()
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h, matrix=mat)

    def add_sphere(self, radius, segs=14, center=(0, 0, 0), scale=(1, 1, 1)):
        mat = Matrix.Translation(Vector(center)) @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
        bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=max(8, segs // 2), radius=radius, matrix=mat)

    def add_extruded_poly(self, pts_2d, thickness, center=(0, 0, 0), rot=(0, 0, 0)):
        """Extrude a 2D polygon in the X-Z plane along Y by thickness."""
        ht = thickness * 0.5
        rot_m = Euler(rot, "XYZ").to_matrix()
        ctr = Vector(center)
        front_v = [self.bm.verts.new(ctr + rot_m @ Vector((px, -ht, pz))) for px, pz in pts_2d]
        back_v = [self.bm.verts.new(ctr + rot_m @ Vector((px, +ht, pz))) for px, pz in pts_2d]
        self.bm.faces.new(front_v)
        self.bm.faces.new(list(reversed(back_v)))
        n = len(pts_2d)
        for i in range(n):
            ni = (i + 1) % n
            self.bm.faces.new((front_v[i], back_v[i], back_v[ni], front_v[ni]))

    def finalize(self, collection, offset_x=0.0):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        obj.location.x = offset_x
        obj.data.materials.append(self.material)
        collection.objects.link(obj)
        return obj


def add_greek_pedestal(marble_b, blue_b, gold_b, accent_b):
    """Build an ornate Greek marble & gold pedestal base (Z = 0.0 -> 1.45m)."""
    # Stepped base
    marble_b.add_box(1.75, 1.75, 0.18, center=(0, 0, 0.09))
    gold_b.add_box(1.58, 1.58, 0.06, center=(0, 0, 0.21))
    marble_b.add_box(1.48, 1.48, 0.16, center=(0, 0, 0.32))
    # Fluted core column / pillar
    marble_b.add_cyl(0.62, 0.58, 0.78, segs=16, center=(0, 0, 0.79))
    # 4 Royal Blue & Gold relief plaques around pillar
    for ang in (0, math.pi * 0.5, math.pi, math.pi * 1.5):
        px = math.sin(ang) * 0.59
        py = -math.cos(ang) * 0.59
        blue_b.add_box(0.46, 0.06, 0.52, center=(px, py, 0.79), rot=(0, 0, ang))
        gold_b.add_box(0.22, 0.08, 0.22, center=(px, py, 0.79), rot=(0, math.pi * 0.25, ang))
    # Capital & glowing holo ring at Z = 1.45
    gold_b.add_cyl(0.64, 0.68, 0.08, segs=16, center=(0, 0, 1.22))
    marble_b.add_box(1.52, 1.52, 0.16, center=(0, 0, 1.34))
    accent_b.add_cyl(0.58, 0.58, 0.05, segs=20, center=(0, 0, 1.44))


def build_statue_lightning(col, offset_x=0.0):
    """1. PJM Electricity Paper — Giant Jagged Golden & Cyan Lightning Bolt Monument."""
    marble = PartBuilder("Pedestal_Marble", get_mat("Statue_Marble", "#F3E5CE", 0.38))
    blue = PartBuilder("Pedestal_Blue", get_mat("Statue_Blue", "#1C3F7A", 0.48))
    gold = PartBuilder("Pedestal_Gold", get_mat("Statue_Gold", "#E8AD3A", 0.24, 0.88))
    bolt = PartBuilder("Statue_Glow_Yellow", get_mat("Bolt_GoldGlow", "#FFD438", 0.18, 0.4, "#FFB81C", 4.5))
    cyan = PartBuilder("Statue_Glow_Cyan", get_mat("Bolt_CyanGlow", "#38E8FF", 0.15, 0.2, "#14E4FF", 5.0))
    dark = PartBuilder("Statue_Dark_Coil", get_mat("Coil_Dark", "#263044", 0.4, 0.6))

    add_greek_pedestal(marble, blue, gold, cyan)

    # Tesla / PJM Power Grid Coil rings at base of bolt
    dark.add_cyl(0.38, 0.44, 0.22, segs=16, center=(0, 0, 1.56))
    for z_ring, r_ring in ((1.72, 0.48), (1.88, 0.38), (2.04, 0.28)):
        cyan.add_cyl(r_ring, r_ring, 0.05, segs=20, center=(0, 0, z_ring))

    # Iconic Jagged 3D Lightning Bolt (Z = 1.85 -> 3.95)
    bolt_pts = [
        (0.28, 3.95),
        (-0.52, 2.82),
        (-0.04, 2.82),
        (-0.38, 1.78),
        (0.54, 2.96),
        (0.06, 2.96),
    ]
    bolt.add_extruded_poly(bolt_pts, thickness=0.26, center=(0, 0, 0))
    # Inner bright cyan energy core bevel
    core_pts = [(x * 0.65, (z - 2.85) * 0.82 + 2.85) for x, z in bolt_pts]
    cyan.add_extruded_poly(core_pts, thickness=0.30, center=(0, 0, 0))

    # Orbiting electric energy shards
    for i in range(4):
        ang = i * math.pi * 0.5 + 0.4
        cyan.add_cyl(0.08, 0.01, 0.28, segs=4, center=(math.cos(ang) * 0.68, math.sin(ang) * 0.68, 2.55 + (i % 2) * 0.45), rot=(0.4, 0.3, ang))

    return [b.finalize(col, offset_x) for b in (marble, blue, gold, bolt, cyan, dark)]


def build_statue_stocks(col, offset_x=0.0):
    """2. Stock Market Research — 3D Candlesticks, Bar Chart & Rising Bullish Trend Arrow."""
    marble = PartBuilder("Pedestal_Marble", get_mat("Statue_Marble", "#F3E5CE", 0.38))
    blue = PartBuilder("Pedestal_Blue", get_mat("Statue_Blue", "#1C3F7A", 0.48))
    gold = PartBuilder("Pedestal_Gold", get_mat("Statue_Gold", "#E8AD3A", 0.24, 0.88))
    green = PartBuilder("Statue_Glow_Green", get_mat("Stock_Green", "#2EE87A", 0.22, 0.2, "#2EE87A", 3.5))
    red = PartBuilder("Statue_Red", get_mat("Stock_Red", "#FF4A4A", 0.25, 0.2, "#FF4A4A", 2.0))
    dark = PartBuilder("Statue_Dark_Grid", get_mat("Coil_Dark", "#263044", 0.4, 0.6))

    add_greek_pedestal(marble, blue, gold, green)

    # 3D Terminal Frame Base
    dark.add_box(1.25, 0.36, 0.12, center=(0, 0, 1.54))
    # 5 3D Candlesticks (with thin gold wicks and glowing green/red bodies)
    candles = [
        (-0.44, 1.75, 2.15, 1.65, 2.28, True),
        (-0.22, 1.95, 2.45, 1.82, 2.58, True),
        (0.00,  2.10, 2.38, 1.98, 2.52, False),
        (0.22,  2.05, 2.78, 1.95, 2.92, True),
        (0.44,  2.35, 3.22, 2.22, 3.38, True),
    ]
    for cx, b0, b1, w0, w1, is_bull in candles:
        gold.add_cyl(0.025, 0.025, w1 - w0, segs=8, center=(cx, 0, (w0 + w1) * 0.5))
        builder = green if is_bull else red
        builder.add_box(0.14, 0.14, b1 - b0, center=(cx, 0, (b0 + b1) * 0.5))

    # Sweeping 3D Golden/Green Bullish Trend Arrow soaring upward across the front!
    segs = [
        ((-0.55, 1.85), (-0.18, 2.35)),
        ((-0.18, 2.35), (0.08, 2.18)),
        ((0.08, 2.18), (0.56, 3.45)),
    ]
    for (x0, z0), (x1, z1) in segs:
        dx, dz = x1 - x0, z1 - z0
        length = math.hypot(dx, dz) + 0.06
        ang = math.atan2(dz, dx)
        gold.add_box(length, 0.12, 0.12, center=((x0 + x1) * 0.5, -0.16, (z0 + z1) * 0.5), rot=(0, -ang, 0))
    # Arrowhead at (0.58, -0.16, 3.50)
    gold.add_cyl(0.22, 0.01, 0.38, segs=4, center=(0.60, -0.16, 3.52), rot=(0, math.radians(22), 0))

    return [b.finalize(col, offset_x) for b in (marble, blue, gold, green, red, dark)]


def build_statue_pokemon(col, offset_x=0.0):
    """3. Pokemon RL Model — Stylized Classic GameBoy + Cute Low-Poly Pikachu + Pokéball."""
    marble = PartBuilder("Pedestal_Marble", get_mat("Statue_Marble", "#F3E5CE", 0.38))
    blue = PartBuilder("Pedestal_Blue", get_mat("Statue_Blue", "#1C3F7A", 0.48))
    gold = PartBuilder("Pedestal_Gold", get_mat("Statue_Gold", "#E8AD3A", 0.24, 0.88))
    gb_body = PartBuilder("Statue_GameBoy_Shell", get_mat("GB_Shell", "#D8D6CE", 0.35))
    gb_screen = PartBuilder("Statue_Glow_Screen", get_mat("GB_Screen", "#8BAC0F", 0.2, 0.0, "#9BBC0F", 2.5))
    pika_yellow = PartBuilder("Statue_Pikachu_Yellow", get_mat("Pika_Yellow", "#FFD426", 0.32))
    pika_red = PartBuilder("Statue_Pikachu_Red", get_mat("Pika_Red", "#EE3232", 0.3))
    dark = PartBuilder("Statue_Dark_Parts", get_mat("Pika_Black", "#1E1E24", 0.35))

    add_greek_pedestal(marble, blue, gold, pika_yellow)

    # 1. Classic GameBoy angled on the left side of the pedestal (X = -0.24, Z = 1.55 -> 2.65)
    gb_x = -0.24
    gb_body.add_box(0.68, 0.22, 1.08, center=(gb_x, 0.05, 2.08), rot=(0.12, 0, 0.18))
    dark.add_box(0.54, 0.24, 0.44, center=(gb_x, 0.04, 2.30), rot=(0.12, 0, 0.18))
    gb_screen.add_box(0.42, 0.26, 0.34, center=(gb_x, 0.03, 2.30), rot=(0.12, 0, 0.18))
    # D-Pad & A/B buttons
    dark.add_box(0.18, 0.26, 0.06, center=(gb_x - 0.14, 0.01, 1.86), rot=(0.12, 0, 0.18))
    dark.add_box(0.06, 0.26, 0.18, center=(gb_x - 0.14, 0.01, 1.86), rot=(0.12, 0, 0.18))
    pika_red.add_cyl(0.05, 0.05, 0.26, segs=10, center=(gb_x + 0.16, 0.01, 1.90), rot=(math.pi * 0.5, 0, 0.18))
    pika_red.add_cyl(0.05, 0.05, 0.26, segs=10, center=(gb_x + 0.06, 0.01, 1.83), rot=(math.pi * 0.5, 0, 0.18))

    # 2. Cute Low-Poly Pikachu standing heroically on the right/top (X = +0.22, Z = 1.55 -> 3.25)
    px, py, pz = 0.22, -0.06, 1.92
    # Torso & Head
    pika_yellow.add_sphere(0.32, segs=14, center=(px, py, pz), scale=(0.95, 0.85, 1.15))
    pika_yellow.add_sphere(0.29, segs=14, center=(px, py - 0.02, pz + 0.48), scale=(1.05, 0.95, 0.98))
    # Feet & Arms
    for sx in (-1, 1):
        pika_yellow.add_box(0.14, 0.24, 0.10, center=(px + sx * 0.16, py - 0.06, pz - 0.32))
        pika_yellow.add_sphere(0.10, segs=10, center=(px + sx * 0.28, py - 0.06, pz + 0.08), scale=(0.8, 0.8, 1.4))
        # Red cheeks & Dark eyes
        pika_red.add_sphere(0.065, segs=10, center=(px + sx * 0.21, py - 0.24, pz + 0.42))
        dark.add_sphere(0.048, segs=10, center=(px + sx * 0.12, py - 0.27, pz + 0.53))
        # Long Pikachu Ears + Black Ear Tips!
        ear_ang = sx * 0.36
        pika_yellow.add_cyl(0.08, 0.04, 0.38, segs=10, center=(px + sx * 0.20, py, pz + 0.84), rot=(0, ear_ang, 0))
        dark.add_cyl(0.04, 0.008, 0.18, segs=10, center=(px + sx * 0.28, py, pz + 1.06), rot=(0, ear_ang, 0))

    # Pikachu Lightning-Bolt Tail!
    tail_pts = [
        (0.0, 0.0),
        (0.18, 0.16),
        (0.08, 0.24),
        (0.34, 0.48),
        (0.18, 0.56),
        (0.48, 0.88),
        (0.12, 0.72),
        (0.22, 0.52),
        (-0.02, 0.36),
        (0.08, 0.20),
    ]
    pika_yellow.add_extruded_poly(tail_pts, thickness=0.06, center=(px + 0.12, py + 0.26, pz - 0.12), rot=(0, 0, -0.25))

    return [b.finalize(col, offset_x) for b in (marble, blue, gold, gb_body, gb_screen, pika_yellow, pika_red, dark)]


def build_statue_robot(col, offset_x=0.0):
    """4. Flo the Robot — Cute Hovering Autonomous Helper Robot."""
    marble = PartBuilder("Pedestal_Marble", get_mat("Statue_Marble", "#F3E5CE", 0.38))
    blue = PartBuilder("Pedestal_Blue", get_mat("Statue_Blue", "#1C3F7A", 0.48))
    gold = PartBuilder("Pedestal_Gold", get_mat("Statue_Gold", "#E8AD3A", 0.24, 0.88))
    bot_white = PartBuilder("Statue_Robot_Shell", get_mat("Bot_White", "#F0F4FA", 0.22, 0.3))
    bot_dark = PartBuilder("Statue_Robot_Visor", get_mat("Bot_Dark", "#1A2234", 0.2, 0.5))
    bot_cyan = PartBuilder("Statue_Glow_Cyan", get_mat("Bot_Cyan", "#14E4FF", 0.15, 0.2, "#14E4FF", 5.5))
    bot_pink = PartBuilder("Statue_Robot_Accent", get_mat("Bot_Pink", "#FF3D8A", 0.25, 0.3, "#FF3D8A", 2.0))

    add_greek_pedestal(marble, blue, gold, bot_cyan)

    # Hover Thruster Energy Rings floating above pedestal (Z = 1.68, 1.86, 2.04)
    for r_ring, z_ring in ((0.44, 1.68), (0.34, 1.85), (0.24, 2.00)):
        bot_cyan.add_cyl(r_ring, r_ring * 0.85, 0.05, segs=20, center=(0, 0, z_ring))

    # Hovering Robot Body & Head (Z = 2.15 -> 3.45)
    # Rounded capsule torso
    bot_white.add_sphere(0.42, segs=16, center=(0, 0, 2.48), scale=(1.0, 0.85, 1.15))
    bot_pink.add_box(0.48, 0.74, 0.12, center=(0, 0, 2.48))
    bot_cyan.add_sphere(0.11, segs=12, center=(0, -0.35, 2.48))

    # Cute wide visor head
    bot_white.add_box(0.72, 0.48, 0.44, center=(0, 0, 3.12))
    bot_dark.add_box(0.60, 0.10, 0.28, center=(0, -0.22, 3.12))
    # Glowing cyan digital eyes
    for sx in (-1, 1):
        bot_cyan.add_sphere(0.075, segs=12, center=(sx * 0.15, -0.26, 3.12), scale=(1.1, 0.4, 1.3))
        # Side ear pods & articulated helper arms
        bot_pink.add_cyl(0.10, 0.10, 0.12, segs=12, center=(sx * 0.40, 0, 3.12), rot=(0, math.pi * 0.5, 0))
        bot_white.add_sphere(0.13, segs=12, center=(sx * 0.54, -0.06, 2.52), scale=(0.75, 0.75, 1.8))
        bot_cyan.add_cyl(0.08, 0.08, 0.06, segs=10, center=(sx * 0.54, -0.12, 2.25))

    # Top antenna with glowing orb
    bot_dark.add_cyl(0.03, 0.02, 0.24, segs=8, center=(0, 0, 3.44))
    bot_cyan.add_sphere(0.07, segs=10, center=(0, 0, 3.58))

    return [b.finalize(col, offset_x) for b in (marble, blue, gold, bot_white, bot_dark, bot_cyan, bot_pink)]


def add_3d_glyph(builder, char, x, y, z, s=0.22):
    """Build crisp 3D mathematical characters for the hovering Bellman Equation: V(s) = max [ R + γ V ]"""
    t = s * 0.22
    if char == "V":
        builder.add_box(t, t, s, center=(x - s * 0.22, y, z), rot=(0, 0.28, 0))
        builder.add_box(t, t, s, center=(x + s * 0.22, y, z), rot=(0, -0.28, 0))
    elif char == "(":
        builder.add_box(t, t, s * 0.6, center=(x, y, z))
        builder.add_box(t, t, s * 0.35, center=(x + s * 0.12, y, z + s * 0.38), rot=(0, 0.45, 0))
        builder.add_box(t, t, s * 0.35, center=(x + s * 0.12, y, z - s * 0.38), rot=(0, -0.45, 0))
    elif char == ")":
        builder.add_box(t, t, s * 0.6, center=(x, y, z))
        builder.add_box(t, t, s * 0.35, center=(x - s * 0.12, y, z + s * 0.38), rot=(0, -0.45, 0))
        builder.add_box(t, t, s * 0.35, center=(x - s * 0.12, y, z - s * 0.38), rot=(0, 0.45, 0))
    elif char == "s":
        builder.add_box(s * 0.55, t, t, center=(x, y, z + s * 0.32))
        builder.add_box(s * 0.55, t, t, center=(x, y, z))
        builder.add_box(s * 0.55, t, t, center=(x, y, z - s * 0.32))
        builder.add_box(t, t, s * 0.34, center=(x - s * 0.22, y, z + s * 0.16))
        builder.add_box(t, t, s * 0.34, center=(x + s * 0.22, y, z - s * 0.16))
    elif char == "=":
        builder.add_box(s * 0.65, t, t, center=(x, y, z + s * 0.16))
        builder.add_box(s * 0.65, t, t, center=(x, y, z - s * 0.16))
    elif char == "+":
        builder.add_box(s * 0.65, t, t, center=(x, y, z))
        builder.add_box(t, t, s * 0.65, center=(x, y, z))
    elif char == "R":
        builder.add_box(t, t, s, center=(x - s * 0.22, y, z))
        builder.add_box(s * 0.5, t, t, center=(x, y, z + s * 0.42))
        builder.add_box(s * 0.5, t, t, center=(x, y, z + s * 0.04))
        builder.add_box(t, t, s * 0.42, center=(x + s * 0.22, y, z + s * 0.23))
        builder.add_box(t, t, s * 0.52, center=(x + s * 0.12, y, z - s * 0.22), rot=(0, 0.42, 0))
    elif char == "G":  # gamma (γ)
        builder.add_box(t, t, s * 0.75, center=(x - s * 0.14, y, z + s * 0.12), rot=(0, 0.35, 0))
        builder.add_box(t, t, s * 1.05, center=(x + s * 0.10, y, z - s * 0.05), rot=(0, -0.32, 0))
    elif char == "S":  # Sigma (Σ)
        builder.add_box(s * 0.72, t, t, center=(x, y, z + s * 0.44))
        builder.add_box(s * 0.72, t, t, center=(x, y, z - s * 0.44))
        builder.add_box(t, t, s * 0.62, center=(x - s * 0.05, y, z + s * 0.22), rot=(0, -0.58, 0))
        builder.add_box(t, t, s * 0.62, center=(x - s * 0.05, y, z - s * 0.22), rot=(0, 0.58, 0))


def build_statue_bellman(col, offset_x=0.0):
    """5. DDC Taxi Driver Model — Stylized NYC Yellow Taxi + Hovering 3D Golden Bellman Equation."""
    marble = PartBuilder("Pedestal_Marble", get_mat("Statue_Marble", "#F3E5CE", 0.38))
    blue = PartBuilder("Pedestal_Blue", get_mat("Statue_Blue", "#1C3F7A", 0.48))
    gold = PartBuilder("Pedestal_Gold", get_mat("Statue_Gold", "#E8AD3A", 0.24, 0.88))
    taxi_yellow = PartBuilder("Statue_Taxi_Yellow", get_mat("Taxi_Yellow", "#FFC824", 0.28))
    eq_glow = PartBuilder("Statue_Glow_Equation", get_mat("Eq_GoldGlow", "#FFE066", 0.18, 0.5, "#FFBE2E", 4.5))
    dark = PartBuilder("Statue_Dark_Wheels", get_mat("Taxi_Dark", "#1E222B", 0.4))

    add_greek_pedestal(marble, blue, gold, eq_glow)

    # 1. Stylized NYC Checker Taxi on the lower pedestal (Z = 1.62 -> 2.28)
    tz = 1.78
    taxi_yellow.add_box(1.12, 0.54, 0.26, center=(0, 0, tz))
    taxi_yellow.add_box(0.62, 0.48, 0.24, center=(-0.04, 0, tz + 0.24))
    dark.add_box(0.64, 0.50, 0.16, center=(-0.04, 0, tz + 0.23))
    # Glowing TAXI roof sign
    eq_glow.add_box(0.22, 0.14, 0.10, center=(-0.04, 0, tz + 0.40))
    # 4 Wheels
    for wx in (-0.34, 0.34):
        for wy in (-0.28, 0.28):
            dark.add_cyl(0.13, 0.13, 0.10, segs=12, center=(wx, wy, tz - 0.10), rot=(math.pi * 0.5, 0, 0))

    # 2. Hovering 3D Golden Bellman Equation Monument: "V(s) = R + γ Σ V" (Z = 2.65 -> 3.55)
    # Framed by an glowing mathematical holo-arc
    eq_glow.add_box(2.15, 0.05, 0.05, center=(0, 0, 2.52))
    eq_glow.add_box(2.15, 0.05, 0.05, center=(0, 0, 3.48))
    sequence = [
        ("V", -0.88),
        ("(", -0.68),
        ("s", -0.52),
        (")", -0.36),
        ("=", -0.10),
        ("R", 0.18),
        ("+", 0.46),
        ("G", 0.72),
        ("S", 0.98),
    ]
    for ch, gx in sequence:
        add_3d_glyph(eq_glow, ch, gx, 0.0, 3.00, s=0.36)

    return [b.finalize(col, offset_x) for b in (marble, blue, gold, taxi_yellow, eq_glow, dark)]


def build_all_and_export():
    scene = bpy.context.scene
    statue_col = bpy.data.collections.get("TempleStatues")
    if statue_col:
        for obj in list(statue_col.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        statue_col = bpy.data.collections.new("TempleStatues")
        scene.collection.children.link(statue_col)

    builders = [
        ("statue-lightning.glb", build_statue_lightning, -10.0),
        ("statue-stocks.glb",    build_statue_stocks,    -5.0),
        ("statue-pokemon.glb",   build_statue_pokemon,    0.0),
        ("statue-robot.glb",     build_statue_robot,      5.0),
        ("statue-bellman.glb",   build_statue_bellman,   10.0),
    ]

    # Hide temple temporarily during individual statue exports, then show all together in Blender!
    for filename, fn, preview_x in builders:
        # Build at origin (0, 0, 0) first for clean GLB export
        objs = fn(statue_col, offset_x=0.0)
        for o in bpy.data.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        out_path = os.path.join(PUBLIC_DIR, filename)
        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format="GLB",
            use_selection=True,
            export_cameras=False,
            export_lights=False,
            export_yup=True,
            export_apply=True,
        )
        # Move to preview lineup in front of the temple in Blender so the user can see all 5!
        for o in objs:
            o.location.x = preview_x
            o.location.y = -15.5

    print("Exported all 5 project statues to public/!")


if __name__ == "__main__":
    build_all_and_export()
