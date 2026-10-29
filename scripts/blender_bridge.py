import bpy
import json
import os
import sys
import traceback
import io
import math
from mathutils import Vector, Euler

WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE_DIR = os.path.join(WORKSPACE_DIR, "scripts", "blender_live")
CMD_FILE = os.path.join(LIVE_DIR, "run.py")
RESULT_FILE = os.path.join(LIVE_DIR, "result.json")
HEARTBEAT_FILE = os.path.join(LIVE_DIR, "heartbeat.json")

os.makedirs(LIVE_DIR, exist_ok=True)


def frame_all_viewports():
    """Redraw all 3D viewports in the live Blender UI."""
    if bpy.app.background:
        return
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == "VIEW_3D":
                area.tag_redraw()


def render_preview_grid(name="preview", distance=8.0, elevation=30.0, resolution=512):
    """
    Render 4 orthographic/perspective views (Front-Right Iso, Back-Left Iso, Front, Top)
    for the Gemini 4 Argon visual critique loop without disturbing the user's viewport.
    """
    out_dir = os.path.join(LIVE_DIR, "renders")
    os.makedirs(out_dir, exist_ok=True)

    scene = bpy.context.scene
    # Ensure a camera exists for preview rendering
    cam_obj = bpy.data.objects.get("_AgentPreviewCam")
    if cam_obj is None:
        cam_data = bpy.data.cameras.new("_AgentPreviewCam")
        cam_obj = bpy.data.objects.new("_AgentPreviewCam", cam_data)
        scene.collection.objects.link(cam_obj)

    prev_cam = scene.camera
    prev_res_x = scene.render.resolution_x
    prev_res_y = scene.render.resolution_y
    prev_filepath = scene.render.filepath
    prev_engine = scene.render.engine

    # Use EEVEE for fast multi-angle critique renders
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "WORKBENCH"):
        try:
            scene.render.engine = eng
            break
        except Exception:
            continue

    scene.camera = cam_obj
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution

    # Ensure basic sun light exists if no lights in scene
    lights = [o for o in scene.objects if o.type == "LIGHT"]
    temp_light = None
    if not lights:
        light_data = bpy.data.lights.new(name="_AgentPreviewSun", type="SUN")
        light_data.energy = 3.0
        temp_light = bpy.data.objects.new(name="_AgentPreviewSun", object_data=light_data)
        temp_light.rotation_euler = Euler((math.radians(45), math.radians(15), math.radians(30)), "XYZ")
        scene.collection.objects.link(temp_light)

    angles = [
        ("iso_front", 45.0, elevation),
        ("iso_back", 225.0, elevation),
        ("front", 0.0, 15.0),
        ("top", 0.0, 85.0),
    ]
    saved_paths = []
    elev_rad = math.radians(elevation)

    try:
        for label, azim_deg, el_deg in angles:
            az = math.radians(azim_deg)
            el = math.radians(el_deg)
            x = distance * math.cos(el) * math.sin(az)
            y = -distance * math.cos(el) * math.cos(az)
            z = distance * math.sin(el)
            cam_obj.location = Vector((x, y, z))
            direction = Vector((0.0, 0.0, 0.5)) - cam_obj.location
            cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

            out_path = os.path.join(out_dir, f"{name}_{label}.png")
            scene.render.filepath = out_path
            bpy.ops.render.render(write_still=True)
            saved_paths.append(out_path)
    finally:
        scene.camera = prev_cam
        scene.render.resolution_x = prev_res_x
        scene.render.resolution_y = prev_res_y
        scene.render.filepath = prev_filepath
        scene.render.engine = prev_engine
        if temp_light is not None:
            bpy.data.objects.remove(temp_light, do_unlink=True)
        bpy.data.objects.remove(cam_obj, do_unlink=True)

    return saved_paths


def export_glb(filename, selected_only=False):
    """Export the current scene (excluding helper cameras/lights) to public/<filename>."""
    if not filename.endswith(".glb"):
        filename += ".glb"
    out_path = os.path.join(WORKSPACE_DIR, "public", filename)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=selected_only,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_apply=True,
    )
    return out_path


def get_scene_summary():
    """Return a structured summary of all objects in the live scene."""
    objs = []
    for obj in bpy.data.objects:
        if obj.name.startswith("_AgentPreview"):
            continue
        objs.append({
            "name": obj.name,
            "type": obj.type,
            "location": [round(v, 4) for v in obj.location],
            "rotation_euler": [round(v, 4) for v in obj.rotation_euler],
            "scale": [round(v, 4) for v in obj.scale],
            "dimensions": [round(v, 4) for v in obj.dimensions],
            "materials": [slot.material.name for slot in obj.material_slots if slot.material],
        })
    return objs


def poll_live_commands():
    """Timer callback that executes queued agent Python scripts inside the open Blender UI."""
    try:
        with open(HEARTBEAT_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "alive": True,
                "objects": get_scene_summary(),
            }, f, indent=2)
    except Exception:
        pass

    if os.path.exists(CMD_FILE):
        try:
            with open(CMD_FILE, "r", encoding="utf-8") as f:
                code = f.read()
            os.remove(CMD_FILE)

            stdout_buf = io.StringIO()
            stderr_buf = io.StringIO()
            old_stdout, old_stderr = sys.stdout, sys.stderr
            sys.stdout, sys.stderr = stdout_buf, stderr_buf

            exec_globals = {
                "__name__": "__main__",
                "bpy": bpy,
                "WORKSPACE_DIR": WORKSPACE_DIR,
                "LIVE_DIR": LIVE_DIR,
                "render_preview_grid": render_preview_grid,
                "export_glb": export_glb,
                "get_scene_summary": get_scene_summary,
                "frame_all_viewports": frame_all_viewports,
            }

            ok = True
            err_msg = None
            try:
                exec(compile(code, CMD_FILE, "exec"), exec_globals)
            except Exception:
                ok = False
                err_msg = traceback.format_exc()
            finally:
                sys.stdout, sys.stderr = old_stdout, old_stderr

            frame_all_viewports()

            with open(RESULT_FILE, "w", encoding="utf-8") as f:
                json.dump({
                    "ok": ok,
                    "stdout": stdout_buf.getvalue(),
                    "stderr": stderr_buf.getvalue(),
                    "error": err_msg,
                    "objects": get_scene_summary(),
                }, f, indent=2)
        except Exception as e:
            with open(RESULT_FILE, "w", encoding="utf-8") as f:
                json.dump({"ok": False, "error": str(e)}, f, indent=2)

    return 0.25


if not bpy.app.timers.is_registered(poll_live_commands):
    bpy.app.timers.register(poll_live_commands, first_interval=0.1, persistent=True)

print("=== Antigravity Live Blender Bridge Active ===")
print(f"Watching: {CMD_FILE}")
