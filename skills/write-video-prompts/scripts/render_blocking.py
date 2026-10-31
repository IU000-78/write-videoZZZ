#!/usr/bin/env python3
"""Render a monochrome blocking diagram and check its delivery references.

Requires Pillow. Input positions use world x/right, y/depth, with y=0 at entry.
Checks concern the declared data and deliverables, not physical/video correctness.
"""
import argparse
import json
import math
import os
from pathlib import Path
import re
import sys


def diagram_required(actors, text_only=False, explicitly_requested=False, *,
                     shot_sizes=(), needs_spatial_layout=False):
    """Gate default diagrams by shot size and spatial need, never actor count.

    shot_sizes contains declared sizes, not focal lengths: medium,
    medium_wide, wide, or their Chinese labels. Explicit requests may override
    the default shot-size gate; text_only still suppresses picture delivery.
    Actor data remains available for layout validation, including offscreen
    people, but its length is not a picture-generation trigger.
    """
    if text_only:
        return False
    if explicitly_requested:
        return True
    spatial_sizes = {"medium", "medium_wide", "wide", "中景", "中全景", "全景"}
    return bool(needs_spatial_layout and spatial_sizes.intersection(shot_sizes))


def validate(data):
    errors = []
    for key in ("reference", "title", "scene", "phase", "basis"):
        if not isinstance(data.get(key), str) or not data[key].strip():
            errors.append(f"missing text field: {key}")
    if not str(data.get("reference", "")).startswith("@"):
        errors.append("reference must be an @ diagram asset label")
    world = data.get("world", {})
    dims = [world.get("width"), world.get("depth")]
    if any(not isinstance(n, (int, float)) or isinstance(n, bool)
           or not math.isfinite(n) or n <= 0 for n in dims):
        return errors + ["world width/depth must be positive finite numbers"]

    def point(p, where):
        valid = (isinstance(p, (list, tuple)) and len(p) == 2
                 and all(isinstance(n, (int, float)) and not isinstance(n, bool)
                         and math.isfinite(n) for n in p))
        if not valid:
            errors.append(f"invalid coordinate: {where}")
        elif not (0 <= p[0] <= dims[0] and 0 <= p[1] <= dims[1]):
            errors.append(f"coordinate outside declared world: {where}")
        return valid

    shots = data.get("shots", [])
    if (not isinstance(shots, list) or not shots
            or any(not isinstance(s, str) or not re.fullmatch(r"镜号\d+", s) for s in shots)
            or len(set(shots)) != len(shots)):
        errors.append("shots must contain unique 镜号N labels")
        shots = []
    actors = data.get("actors", [])
    anchors = data.get("anchors", [])
    cameras = data.get("cameras", [])
    groups = [("actor", actors), ("anchor", anchors), ("camera", cameras)]
    ids = set()
    numbers = set()
    scene_marks = set()
    for kind, items in groups:
        if not isinstance(items, list):
            errors.append(f"{kind} list is invalid")
            continue
        for item in items:
            if not isinstance(item, dict):
                errors.append(f"invalid {kind} entry")
                continue
            ident = item.get("id")
            if not isinstance(ident, str) or not ident or ident in ids:
                errors.append(f"missing/duplicate id: {ident}")
            else:
                ids.add(ident)
            point(item.get("at"), str(ident))
            if kind == "actor":
                number = item.get("number", len(numbers) + 1)
                if not isinstance(number, int) or isinstance(number, bool) or number < 1 or number in numbers:
                    errors.append(f"invalid/duplicate actor number: {number}")
                else:
                    numbers.add(number)
                if not str(item.get("asset", "")).startswith("@"):
                    errors.append(f"actor asset label missing: {ident}")
                facing = item.get("facing")
                if (not isinstance(facing, list) or len(facing) != 2
                        or not all(isinstance(n, (int, float)) and math.isfinite(n) for n in facing)
                        or math.hypot(*facing) == 0):
                    errors.append(f"invalid facing vector: {ident}")
            elif kind == "anchor":
                if not item.get("label"):
                    errors.append(f"anchor label missing: {ident}")
                mark, asset = item.get("marker"), item.get("asset")
                if asset or mark:
                    if not isinstance(mark, str) or not re.fullmatch(r"S[1-9]\d*", mark) or mark in scene_marks:
                        errors.append(f"invalid/duplicate scene marker: {mark}")
                    else:
                        scene_marks.add(mark)
                    if not isinstance(asset, str) or not asset.startswith("@") or len(asset) < 2:
                        errors.append(f"scene asset label missing: {ident}")
                    for field in ("description", "role"):
                        if not isinstance(item.get(field), str) or not item[field].strip():
                            errors.append(f"scene anchor {ident} missing {field}")
            elif kind == "camera":
                if not isinstance(ident, str) or not re.fullmatch(r"C[1-9]\d*", ident):
                    errors.append("camera id must use C1, C2, ...")
                point(item.get("target"), f"{ident} target")
                for field in ("lens", "height", "mode", "background"):
                    if not isinstance(item.get(field), str) or not item[field].strip():
                        errors.append(f"camera {ident} missing {field}")
                assigned = item.get("shots", [])
                if not assigned or any(s not in shots for s in assigned):
                    errors.append(f"camera {ident} has unknown/missing shot mapping")
                if item.get("at") == item.get("target"):
                    errors.append(f"camera {ident} has no view direction")
                if item.get("pov_actor"):
                    owner = next((a for a in actors if a.get("id") == item["pov_actor"]), None)
                    if not owner or owner.get("at") != item.get("at"):
                        errors.append(f"POV camera {ident} must share its actor's eye-position projection")
    if not cameras:
        errors.append("at least one mapped camera is required")
    covered = {s for c in cameras for s in c.get("shots", [])}
    if set(shots) - covered:
        errors.append("some shots have no mapped camera")
    for path in data.get("paths", []):
        if path.get("kind") not in ("actor", "camera", "object"):
            errors.append("unknown path kind")
        if path.get("owner") not in ids:
            errors.append("path owner is not defined")
        points = path.get("points", [])
        if len(points) < 2:
            errors.append("path needs start and end")
        for p in points:
            point(p, "path")
    mode = data.get("diagram_mode", "blocking")
    if mode not in ("blocking", "continuous_take"):
        errors.append("unknown diagram mode")
    if mode == "continuous_take":
        route = data.get("camera_route", {})
        route = route if isinstance(route, dict) else {}
        shot, stops = route.get("shot"), route.get("stops")
        camera_map = {c.get("id"): c for c in cameras if isinstance(c, dict)}
        if len(shots) != 1 or shot not in shots:
            errors.append("continuous route must map to exactly one shot")
        if not isinstance(stops, list) or not stops:
            errors.append("continuous route needs at least one camera stop")
        else:
            for stop in stops:
                if not isinstance(stop, str) or stop not in camera_map:
                    errors.append("continuous route references unknown camera stop")
                elif shot not in camera_map[stop].get("shots", []):
                    errors.append("route camera does not belong to the continuous shot")
            if set(camera_map) - {x for x in stops if isinstance(x, str)}:
                errors.append("continuous diagram has cameras outside its route")
    axis = data.get("axis")
    if axis is not None:
        if not isinstance(axis, list) or len(axis) != 2:
            errors.append("axis needs two points")
        else:
            for p in axis:
                point(p, "axis")
    return errors


def actor_numbers(data):
    return {actor["id"]: actor.get("number", i) for i, actor in enumerate(data["actors"], 1)}


def prompt_notes(data):
    """Descriptions belong in the video prompt, never inside the diagram PNG."""
    errors = validate(data)
    if errors:
        raise ValueError("; ".join(errors))
    numbers = actor_numbers(data)

    def direction(vector):
        angle = math.atan2(vector[1], vector[0])
        names = ["图右方", "图右上方", "图上方", "图左上方", "图左方", "图左下方", "图下方", "图右下方"]
        return names[round(angle / (math.pi / 4)) % 8]

    def coordinate(at):
        return f"图中示意坐标（横向{at[0]}，纵深{at[1]}），非实测尺寸"

    binding = "" if data.get("reference_bound") else "（建议引用名，使用时绑定本图）"
    lines = [f'站位图引用：{data["reference"]}{binding}，用于{data["scene"]}的{data["phase"]}；仅参考站位及机位，不采用俯拍，不生成图中编号或机位符号。',
             "空间基准：" + data["basis"], "人物与站位序号："]
    for actor in data["actors"]:
        value = f'{numbers[actor["id"]]}号对应{actor["asset"]}；位于{actor.get("position", coordinate(actor["at"]))}，面向{direction(actor["facing"])}'
        if actor.get("state"):
            value += "，" + actor["state"]
        if actor.get("offscreen"):
            value += "；真实在场，保持画外或隐藏状态"
        lines.append(value + "。")
    lines.append("固定锚点：")
    for anchor in data.get("anchors", []):
        if anchor.get("asset"):
            lines.append(f'{anchor["marker"]}对应{anchor["asset"]}（{anchor["label"]}）；'
                         f'{anchor["description"]}；参考用途：{anchor["role"]}。')
        else:
            lines.append(anchor["label"] + "：" + anchor.get("description", coordinate(anchor["at"])) + "。")
    lines.append("机位与镜号：")
    for camera in data["cameras"]:
        lines.append(f'{camera["id"]}对应{"、".join(camera["shots"])}；{camera.get("position", coordinate(camera["at"]))}；'
                     f'{camera["lens"]}，{camera["height"]}，{camera["mode"]}；背景为{camera["background"]}。')
        if camera.get("pov_actor"):
            lines.append(f'{camera["id"]}位于{numbers[camera["pov_actor"]]}号本人眼位，图上偏移的编号仅为标注，不移动实际机位。')
    for path in data.get("paths", []):
        owner = path["owner"]
        label = f"{numbers[owner]}号" if owner in numbers else owner
        points = path["points"]
        kind = {"actor": "人物", "camera": "机位", "object": "物件"}[path["kind"]]
        via = f'，途经{points[1:-1]}' if points[1:-1] else ""
        lines.append(f'{label}的{kind}路线：{path.get("label", "按起点、途经、终点连续执行")}；'
                     f'起点{points[0]}{via}，终点{points[-1]}（示意坐标，最终正文按实际锚点说明）。')
    if data.get("axis"):
        lines.append(f'对峙轴线连接{data["axis"][0]}与{data["axis"][1]}（示意坐标）；机位半区、人物自身左右及跨轴条件按正文核对，图中不绘制轴线。')
    if data.get("diagram_mode") == "continuous_take":
        route = data["camera_route"]
        stops = route["stops"]
        lines.append(f'本图为{route["shot"]}唯一的完整运动轨迹图；C编号是同一摄影机的途经位置，不是切镜。')
        lines.append('摄影机依次经过：' + '→'.join(stops) + '；空心圆为起点，方框为终点，重合时两者同时保留。')
        if len(stops) == 1:
            lines.append('摄影机固定在该位置；朝向按机位描述，不虚构水平位移。')
        else:
            lines.append('R1、R2等为连续运动路段的先后顺序，箭头表示运动方向；返回路线的并行偏移仅为图示，不改变实际机位。')
        lines.append('只交本镜这张轨迹图，不另交阶段图、起落幅或构图图。')
    return "\n".join(lines)


def find_font(explicit=None):
    candidates = [explicit, os.environ.get("BLOCKING_FONT"),
                  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
                  "/System/Library/Fonts/Helvetica.ttc", "C:/Windows/Fonts/arial.ttf"]
    for name in candidates:
        if name and Path(name).is_file():
            return str(name)
    # Only numeric stations and C/S identifiers are drawn; no Chinese font required.
    return None


def render(data, output, font_path=None):
    from PIL import Image, ImageDraw, ImageFont
    errors = validate(data)
    if errors:
        raise ValueError("; ".join(errors))
    font_path = find_font(font_path)
    font = lambda n: ImageFont.truetype(font_path, n) if font_path else ImageFont.load_default(size=n)
    width, height = 1600, 1400
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    scale = min((width - 200) / data["world"]["width"], (height - 200) / data["world"]["depth"])
    left = (width - data["world"]["width"] * scale) / 2
    top = (height - data["world"]["depth"] * scale) / 2
    right, bottom = width - left, height - top
    numbers = actor_numbers(data)

    def position(p):
        return (left + p[0] / data["world"]["width"] * (right - left),
                bottom - p[1] / data["world"]["depth"] * (bottom - top))

    def text(x, y, value, size=32, anchor=None):
        draw.text((x, y), str(value), fill="black", font=font(size), anchor=anchor)

    if data.get("diagram_mode") == "continuous_take":
        camera_map = {c["id"]: c for c in data["cameras"]}
        stops = data["camera_route"]["stops"]
        # Retraced segments get a small visual lane offset, not a new world route.
        for index, (start, end) in enumerate(zip(stops, stops[1:]), 1):
            a, b = position(camera_map[start]["at"]), position(camera_map[end]["at"])
            length = math.dist(a, b)
            if length < 1:
                continue  # Same location: describe pan/height change in the prompt.
            ux, uy = (b[0]-a[0])/length, (b[1]-a[1])/length
            offset = 12
            a = (a[0]-uy*offset, a[1]+ux*offset)
            b = (b[0]-uy*offset, b[1]+ux*offset)
            draw.line([a, b], fill="black", width=4)
            mx, my = (a[0]+b[0])/2, (a[1]+b[1])/2
            draw.polygon([(mx+ux*14,my+uy*14),
                          (mx-ux*10-uy*8,my-uy*10+ux*8),
                          (mx-ux*10+uy*8,my-uy*10-ux*8)], fill="black")
            text(mx-uy*30, my+ux*30, f"R{index}", size=24, anchor="mm")
        x, y = position(camera_map[stops[0]]["at"])
        draw.ellipse((x-42,y-42,x+42,y+42), outline="black", width=3)
        x, y = position(camera_map[stops[-1]]["at"])
        draw.rectangle((x-49,y-49,x+49,y+49), outline="black", width=3)

    # Asset-backed scene anchors use square S markers; unbound anchors stay text-only.
    # Names, descriptions, routes, axes and legends stay in prompt_notes.
    for anchor in data.get("anchors", []):
        if anchor.get("asset"):
            x, y = position(anchor["at"])
            draw.rectangle((x - 36, y - 25, x + 36, y + 25), fill="white", outline="black", width=3)
            text(x, y, anchor["marker"], size=28, anchor="mm")
    pov_owners = {c.get("pov_actor") for c in data["cameras"] if c.get("pov_actor")}
    for actor in data["actors"]:
        x, y = position(actor["at"])
        draw.ellipse((x - 32, y - 32, x + 32, y + 32), fill="white", outline="black", width=4)
        text(x, y + (52 if actor["id"] in pov_owners else 0), numbers[actor["id"]], anchor="mm")
    for camera in data["cameras"]:
        x, y = position(camera["at"])
        target = position(camera["target"])
        distance = math.dist((x, y), target)
        ux, uy = (target[0] - x) / distance, (target[1] - y) / distance
        # A short lens triangle belongs to the camera icon, not a route or FOV line.
        size = 14 if camera.get("pov_actor") else 28
        draw.rectangle((x - size, y - size * .65, x + size, y + size * .65), fill="black")
        tip = (x + ux * (size + 17), y + uy * (size + 17))
        draw.polygon([tip, (x + ux * size - uy * 10, y + uy * size + ux * 10),
                      (x + ux * size + uy * 10, y + uy * size - ux * 10)], fill="black")
        if camera.get("pov_actor"):
            # POV camera is exactly at the actor; offset ONLY the label, not its coordinates.
            sx, sy = (-1 if ux > 0 else 1), (-1 if uy > 0 else 1)
            draw.line([(x + sx * 10, y + sy * 10), (x + sx * 80, y + sy * 65)], fill="black", width=2)
            text(x + sx * 85, y + sy * 65, camera["id"], anchor="rm" if sx < 0 else "lm")
        else:
            label_gap = 80 if data.get("diagram_mode") == "continuous_take" else 48
            text(x, y + (label_gap if uy < -.35 else -label_gap), camera["id"], anchor="mm")
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG")
    return output


def check_delivery(data, image_path, prompt):
    from PIL import Image
    errors = validate(data)
    path = Path(image_path)
    if not path.is_file():
        errors.append("diagram PNG not delivered")
    else:
        try:
            with Image.open(path) as image:
                rgb = image.convert("RGB")
                r, g, b = rgb.split()
                if r.tobytes() != g.tobytes() or g.tobytes() != b.tobytes():
                    errors.append("diagram is not monochrome")
                if rgb.getpixel((0, 0)) != (255, 255, 255):
                    errors.append("diagram background must be white")
                if rgb.getextrema()[0] == (255, 255):
                    errors.append("diagram is blank")
                if image.format != "PNG":
                    errors.append("deliverable must be PNG")
        except (OSError, ValueError) as exc:
            errors.append(f"diagram cannot be opened: {exc}")
    if data.get("diagram_mode") == "continuous_take":
        ordered = "→".join(data.get("camera_route", {}).get("stops", []))
        if ordered and ordered not in prompt:
            errors.append("prompt missing ordered continuous camera route")
    if data.get("reference", "") not in prompt:
        errors.append("prompt does not cite the diagram's exact @reference")
    for actor in data.get("actors", []):
        if actor.get("asset", "") not in prompt:
            errors.append(f'prompt missing actor asset: {actor.get("id")}')
    numbers = actor_numbers(data)
    for actor in data.get("actors", []):
        binding = rf'(?<!\d){numbers[actor["id"]]}号[^。\n；;]*?{re.escape(actor["asset"])}'
        if not re.search(binding, prompt):
            errors.append(f'prompt missing station-number binding: {numbers[actor["id"]]}')
    for anchor in data.get("anchors", []):
        if anchor["label"] not in prompt:
            errors.append(f'prompt missing fixed anchor: {anchor["label"]}')
    for anchor in data.get("anchors", []):
        if anchor.get("asset"):
            binding = (r'(?<![A-Za-z0-9_])' + re.escape(anchor["marker"]) +
                       r'(?![A-Za-z0-9_])[^。\n；;]*?' + re.escape(anchor["asset"]))
            if not re.search(binding, prompt):
                errors.append(f'prompt missing scene-marker binding: {anchor["marker"]}')
    for camera in data.get("cameras", []):
        if not re.search(r'(?<![A-Za-z0-9_])' + re.escape(camera["id"]) + r'(?![A-Za-z0-9_])', prompt):
            errors.append(f'prompt missing camera reference: {camera["id"]}')
        for shot in camera.get("shots", []):
            if not re.search(re.escape(shot) + r'(?!\d)', prompt):
                errors.append(f"prompt missing shot: {shot}")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", type=Path)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--output", type=Path)
    group.add_argument("--check-delivery", type=Path)
    group.add_argument("--validate", action="store_true")
    group.add_argument("--describe", action="store_true")
    parser.add_argument("--prompt", type=Path)
    parser.add_argument("--font")
    parser.add_argument("--notes-output", type=Path, help="Write descriptions to UTF-8 text for inclusion in the video prompt")
    args = parser.parse_args()
    try:
        data = json.loads(args.spec.read_text(encoding="utf-8"))
        errors = validate(data)
        if args.check_delivery:
            if not args.prompt:
                raise ValueError("--check-delivery requires --prompt")
            errors = check_delivery(data, args.check_delivery, args.prompt.read_text(encoding="utf-8"))
        if errors:
            print(json.dumps({"ok": False, "errors": errors}, ensure_ascii=False))
            return 2
        if args.output:
            render(data, args.output, args.font)
        if args.notes_output:
            args.notes_output.parent.mkdir(parents=True, exist_ok=True)
            args.notes_output.write_text(prompt_notes(data), encoding="utf-8")
        if args.describe:
            print(prompt_notes(data))
            return 0
        print(json.dumps({"ok": True, "reference": data["reference"],
                          "output": str(args.output) if args.output else None,
                          "scope": "data/PNG/reference checks only; manually inspect framing, geometry and image"}, ensure_ascii=False))
        return 0
    except (ValueError, OSError, TypeError, KeyError, ImportError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())
