"""Regression checks for story pages, side stories, and saved reading links."""

import tempfile
import unittest
from pathlib import Path

from build import make_section, parse_file


class StoryPagesTest(unittest.TestCase):
    def parse(self, text):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "3.0-第三章第1至2幕-须弥.md"
            path.write_text(text, encoding="utf-8")
            return parse_file(path, 3, 0)

    def test_story_stays_out_of_world_story_and_questions(self):
        volume = self.parse(
            "# 3.0｜须弥主线\n\n纳西妲救下被困梦中的居民。\n\n"
            "## 同期世界支线：森林书\n\n兰那罗帮助拉娜。\n\n"
            "## 此刻悬而未决\n\n贤者为何收集梦境？\n\n"
            "## 资料\n\n[任务记录](https://example.com/source)\n"
        )
        story, world, question = volume["sections"]
        self.assertEqual(story["title"], "须弥主线")
        self.assertIn("纳西妲", story["html"])
        self.assertNotIn("纳西妲", world["html"])
        self.assertNotIn("纳西妲", question["html"])
        self.assertEqual(world["kind"], "world")
        self.assertEqual(question["kind"], "question")
        self.assertIn("任务记录", volume["sources"])
        self.assertNotIn("任务记录", "".join(s["html"] for s in volume["sections"]))

    def test_leading_story_preserves_existing_numbered_links(self):
        headings = "## 世界支线\n\n旧事。\n\n## 此刻悬而未决\n\n疑问。\n"
        original = self.parse("# 3.0｜须弥\n\n" + headings)
        expanded = self.parse("# 3.0｜须弥\n\n旅人来到须弥。\n\n" + headings)
        self.assertEqual(expanded["sections"][0]["id"], "v3.0-sintro")
        self.assertEqual(
            [s["id"] for s in original["sections"]],
            [s["id"] for s in expanded["sections"]][1:],
        )

    def test_single_page_uses_story_title_and_keeps_its_link(self):
        volume = self.parse("# 3.0｜须弥主线\n\n故事。\n\n## 参考资料\n\n来源。\n")
        self.assertEqual(len(volume["sections"]), 1)
        self.assertEqual(volume["sections"][0]["id"], "v3.0-s0")
        self.assertEqual(volume["sections"][0]["title"], "须弥主线")

    def test_explicit_acts_keep_their_original_order(self):
        volume = self.parse("# 3.0｜须弥\n\n## 第一幕\n\n雨林。\n\n## 第二幕\n\n梦境。\n")
        self.assertEqual([s["title"] for s in volume["sections"]], ["第一幕", "第二幕"])
        self.assertEqual([s["id"] for s in volume["sections"]], ["v3.0-s0", "v3.0-s1"])

    def test_reading_time_ignores_link_targets(self):
        short = make_section("v3.0-s0", "须弥", "[线索](https://example.com/" + "a" * 3000 + ")")
        long = make_section("v3.0-s1", "须弥", "林" * 801)
        self.assertEqual(short["readingMinutes"], 1)
        self.assertEqual(long["readingMinutes"], 3)


if __name__ == "__main__":
    unittest.main()
