#!/usr/bin/env python3
"""Repeatable tool-level regression cases; does not validate model/video behavior."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from render_blocking import check_delivery, diagram_required, prompt_notes, render, validate


ROOT = Path(__file__).resolve().parents[1]


class BlockingChecks(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads((ROOT / "assets/blocking-template.json").read_text())

    def test_actor_count_alone_does_not_trigger(self):
        self.assertFalse(diagram_required(self.spec["actors"]))
        self.assertFalse(diagram_required(self.spec["actors"][:2]))

    def test_two_person_medium_spatial_interaction_triggers(self):
        self.assertTrue(diagram_required(self.spec["actors"][:2],
                        shot_sizes=("medium",), needs_spatial_layout=True))

    def test_many_people_only_closeups_do_not_trigger(self):
        self.assertFalse(diagram_required(self.spec["actors"],
                         shot_sizes=("closeup", "近景", "特写"),
                         needs_spatial_layout=True))

    def test_wide_without_spatial_need_does_not_trigger(self):
        self.assertFalse(diagram_required(self.spec["actors"],
                         shot_sizes=("wide",)))

    def test_mixed_segment_with_spatial_wide_triggers(self):
        self.assertTrue(diagram_required(self.spec["actors"],
                        shot_sizes=("特写", "中全景"), needs_spatial_layout=True))

    def test_focal_length_is_not_a_shot_size(self):
        self.assertFalse(diagram_required(self.spec["actors"],
                         shot_sizes=("35mm",), needs_spatial_layout=True))

    def test_text_only_overrides_trigger(self):
        self.assertFalse(diagram_required(self.spec["actors"], text_only=True,
                         explicitly_requested=True, shot_sizes=("wide",),
                         needs_spatial_layout=True))

    def test_explicit_single_person_diagram(self):
        self.assertTrue(diagram_required(self.spec["actors"][:1], explicitly_requested=True))

    def test_template_is_valid(self):
        self.assertEqual(validate(self.spec), [])

    def test_duplicate_id_rejected(self):
        self.spec["actors"][1]["id"] = "P1"
        self.assertTrue(any("duplicate" in e for e in validate(self.spec)))

    def test_unknown_shot_rejected(self):
        self.spec["cameras"][0]["shots"] = ["镜号99"]
        self.assertTrue(any("mapping" in e for e in validate(self.spec)))

    def test_out_of_bounds_rejected(self):
        self.spec["cameras"][0]["at"] = [11, 5]
        self.assertTrue(any("outside" in e for e in validate(self.spec)))

    def test_pov_must_match_owner(self):
        self.spec["cameras"][0]["pov_actor"] = "P1"
        self.assertTrue(any("POV" in e for e in validate(self.spec)))
        self.spec["cameras"][0]["at"] = self.spec["actors"][0]["at"][:]
        self.assertEqual(validate(self.spec), [])

    def test_unknown_route_owner_rejected(self):
        self.spec["paths"] = [{"kind": "actor", "owner": "P99", "points": [[1, 1], [2, 2]]}]
        self.assertTrue(any("owner" in e for e in validate(self.spec)))

    def test_duplicate_station_number_rejected(self):
        self.spec["actors"][1]["number"] = 1
        self.assertTrue(any("actor number" in e for e in validate(self.spec)))

    def test_notes_contain_actor_and_anchor_descriptions(self):
        notes = prompt_notes(self.spec)
        self.assertIn("1号对应@人物甲", notes)
        self.assertIn("S1对应@入口场景资产（入口）；位于图下方中央", notes)
        self.assertIn("S2对应@纵深墙面资产（纵深墙面）；位于图上方", notes)
        self.assertIn("C1对应镜号1、镜号2", notes)

    def test_missing_picture_and_reference_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            errors = check_delivery(self.spec, Path(folder) / "missing.png", "镜号1：...镜号2：...")
            self.assertTrue(any("not delivered" in e for e in errors))
            self.assertTrue(any("exact @reference" in e for e in errors))

    def test_actual_render_and_prompt_mapping(self):
        prompt = prompt_notes(self.spec)
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "diagram.png"
            render(self.spec, target)
            self.assertEqual(check_delivery(self.spec, target, prompt), [])
            self.assertEqual(check_delivery(self.spec, target, prompt.replace("C1对应", "机位C1对应")), [])
            errors = check_delivery(self.spec, target, prompt.replace("@参考机位图", "@错误图"))
            self.assertTrue(any("exact @reference" in e for e in errors))
            errors = check_delivery(self.spec, target, prompt.replace("镜号1、镜号2", "镜号10、镜号20"))
            self.assertTrue(any("missing shot" in e for e in errors))
            errors = check_delivery(self.spec, target, prompt.replace("C1", "C10"))
            self.assertTrue(any("camera reference" in e for e in errors))
            errors = check_delivery(self.spec, target, prompt.replace("1号对应@人物甲", "9号对应@人物甲"))
            self.assertTrue(any("station-number binding" in e for e in errors))
            errors = check_delivery(self.spec, target, prompt.replace("纵深墙面", "其他墙"))
            self.assertTrue(any("fixed anchor" in e for e in errors))

    def test_png_draws_only_numbers_and_camera_marks(self):
        from PIL import ImageDraw
        seen = []
        original = ImageDraw.ImageDraw.text

        def capture(instance, xy, text, *args, **kwargs):
            seen.append(str(text))
            return original(instance, xy, text, *args, **kwargs)

        with tempfile.TemporaryDirectory() as folder:
            with patch.object(ImageDraw.ImageDraw, "text", new=capture):
                render(self.spec, Path(folder) / "minimal.png")
        self.assertEqual(seen, ["S1", "S2", "1", "2", "3", "C1"])

    def test_descriptions_anchors_paths_and_axis_do_not_change_png(self):
        for anchor in self.spec["anchors"]:
            for key in ("asset", "marker", "role"):
                anchor.pop(key, None)
        changed = json.loads(json.dumps(self.spec))
        changed["title"] = "不应进入图片的标题"
        changed["basis"] = "不应进入图片的空间说明"
        changed["actors"][0]["position"] = "仅在正文出现的位置说明"
        changed["actors"][0]["facing"] = [1, 0]
        changed["anchors"][0]["at"] = [1, 1]
        changed["anchors"][0]["label"] = "不应进入图片的锚点"
        changed["axis"] = [[1, 1], [8, 8]]
        changed["paths"] = [{"kind": "actor", "owner": "P1", "points": [[4, 3], [5, 5]]}]
        changed["cameras"][0]["lens"] = "85mm"
        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder) / "a.png", Path(folder) / "b.png"
            render(self.spec, a)
            render(changed, b)
            self.assertEqual(a.read_bytes(), b.read_bytes())

    def test_scene_asset_requires_marker_and_role(self):
        self.spec["anchors"][0].pop("marker")
        self.spec["anchors"][1].pop("role")
        errors = validate(self.spec)
        self.assertTrue(any("scene marker" in e for e in errors))
        self.assertTrue(any("missing role" in e for e in errors))

    def test_scene_markers_are_unique_and_asset_backed(self):
        self.spec["anchors"][1]["marker"] = "S1"
        self.spec["anchors"][0].pop("asset")
        errors = validate(self.spec)
        self.assertTrue(any("duplicate scene marker" in e for e in errors))
        self.assertTrue(any("scene asset label missing" in e for e in errors))

    def test_wrong_scene_binding_rejected(self):
        prompt = prompt_notes(self.spec)
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "scene.png"
            render(self.spec, target)
            for wrong in (prompt.replace("S1对应", "S10对应"),
                          prompt.replace("S1对应@入口场景资产", "S1对应@错误资产")):
                self.assertTrue(any("scene-marker binding" in e for e in check_delivery(self.spec, target, wrong)))

    def test_scene_coordinate_changes_png(self):
        changed = json.loads(json.dumps(self.spec))
        changed["anchors"][0]["at"] = [2, 0]
        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder) / "a.png", Path(folder) / "b.png"
            render(self.spec, a)
            render(changed, b)
            self.assertNotEqual(a.read_bytes(), b.read_bytes())

    def test_upward_camera_label_does_not_overlap_lens(self):
        from PIL import ImageDraw
        self.spec["cameras"][0]["target"] = [8.5, 10]
        text_box, polygons = [], []
        original_text, original_polygon = ImageDraw.ImageDraw.text, ImageDraw.ImageDraw.polygon

        def capture_text(instance, xy, text, *args, **kwargs):
            if text == "C1":
                text_box.append(instance.textbbox(xy, text, font=kwargs["font"], anchor=kwargs.get("anchor")))
            return original_text(instance, xy, text, *args, **kwargs)

        def capture_polygon(instance, points, *args, **kwargs):
            polygons.append(points)
            return original_polygon(instance, points, *args, **kwargs)

        with tempfile.TemporaryDirectory() as folder:
            with patch.object(ImageDraw.ImageDraw, "text", new=capture_text), patch.object(ImageDraw.ImageDraw, "polygon", new=capture_polygon):
                render(self.spec, Path(folder) / "upward.png")
        self.assertEqual(len(text_box), 1)
        self.assertEqual(len(polygons), 1)
        self.assertGreater(text_box[0][1], max(p[1] for p in polygons[0]))


class ContinuousRouteChecks(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads((ROOT / "assets/continuous-take-template.json").read_text())

    def test_template_and_return_route(self):
        self.assertEqual(validate(self.spec), [])
        self.assertEqual(self.spec["camera_route"]["stops"], ["C1", "C2", "C1"])

    def test_unknown_stop_rejected(self):
        self.spec["camera_route"]["stops"].append("C99")
        self.assertTrue(any("unknown camera" in e for e in validate(self.spec)))

    def test_multiple_shots_rejected(self):
        self.spec["shots"].append("镜号2")
        self.assertTrue(any("exactly one shot" in e for e in validate(self.spec)))

    def test_empty_route_rejected(self):
        self.spec["camera_route"]["stops"] = []
        self.assertTrue(any("at least one" in e for e in validate(self.spec)))

    def test_unused_camera_rejected(self):
        self.spec["camera_route"]["stops"] = ["C1"]
        self.assertTrue(any("outside its route" in e for e in validate(self.spec)))

    def test_fixed_camera_does_not_invent_path(self):
        self.spec["cameras"] = self.spec["cameras"][:1]
        self.spec["camera_route"]["stops"] = ["C1"]
        self.assertEqual(validate(self.spec), [])
        notes = prompt_notes(self.spec)
        self.assertIn("摄影机固定在该位置", notes)
        self.assertNotIn("R1、R2", notes)
        with tempfile.TemporaryDirectory() as folder:
            png = Path(folder) / "fixed.png"
            render(self.spec, png)
            self.assertEqual(check_delivery(self.spec, png, notes), [])

    def test_route_png_arrows_and_ordered_prompt(self):
        from PIL import ImageDraw
        seen = []
        original = ImageDraw.ImageDraw.text
        def capture(instance, xy, text, *args, **kwargs):
            seen.append(str(text))
            return original(instance, xy, text, *args, **kwargs)
        notes = prompt_notes(self.spec)
        with tempfile.TemporaryDirectory() as folder:
            png = Path(folder) / "route.png"
            with patch.object(ImageDraw.ImageDraw, "text", new=capture):
                render(self.spec, png)
            self.assertEqual(check_delivery(self.spec, png, notes), [])
            errors = check_delivery(self.spec, png, notes.replace("C1→C2→C1", "C1→C2"))
            self.assertTrue(any("ordered continuous" in e for e in errors))
        self.assertIn("R1", seen)
        self.assertIn("R2", seen)

    def test_route_geometry_changes_png(self):
        changed = json.loads(json.dumps(self.spec))
        changed["camera_route"]["stops"] = ["C1", "C2"]
        with tempfile.TemporaryDirectory() as folder:
            a,b = Path(folder)/"a.png",Path(folder)/"b.png"
            render(self.spec,a);render(changed,b)
            self.assertNotEqual(a.read_bytes(),b.read_bytes())


if __name__ == "__main__":
    unittest.main(verbosity=2)
