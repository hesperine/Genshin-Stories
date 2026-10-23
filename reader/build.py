"""将 story-summaries 中的版本 Markdown 编译为可离线打开的静态阅读器数据。"""

from __future__ import annotations

import json
import math
import re
from html import unescape
from pathlib import Path

from markdown_it import MarkdownIt


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "story-summaries"
EPIC_SOURCE = ROOT / "story-editions" / "epic"
OUTPUT = Path(__file__).resolve().parent / "story-data.js"
VERSION_FILE = re.compile(r"^(\d+)\.(\d+)(?:-(.*))?\.md$")
EDITION_FILE = re.compile(r"^v(\d+)\.(\d+)-s(intro|\d+)\.md$")
GROUP_DIR = re.compile(r"^\d+\.x$")
H2 = re.compile(r"(?m)^##\s+(.+?)\s*$")
H1 = re.compile(r"(?m)^#\s+(.+?)\s*$")
MARKDOWN = MarkdownIt("commonmark", {"html": False})
SOURCE_HEADINGS = {"资料", "资料来源", "参考资料"}


def title_kind(heading: str) -> str:
    if any(word in heading for word in ("世界", "支线", "线索", "同期")):
        return "world"
    if "悬而未决" in heading:
        return "question"
    return "chapter"


def make_section(section_id: str, heading: str, body: str) -> dict:
    rendered = MARKDOWN.render(body)
    text = unescape(re.sub(r"<[^>]+>", "", rendered))
    words = re.findall(r"[\u3400-\u4dbf\u4e00-\u9fff]|[A-Za-z0-9]+", text)
    return {
        "id": section_id,
        "title": heading,
        "kind": title_kind(heading),
        "html": rendered,
        "readingMinutes": max(1, math.ceil(len(words) / 400)),
    }


def parse_file(path: Path, major: int, minor: int) -> dict:
    source = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
    h1_match = H1.search(source)
    full_title = h1_match.group(1).strip() if h1_match else path.stem
    title = full_title.split("｜", 1)[-1].strip()
    if h1_match:
        source = source[: h1_match.start()] + source[h1_match.end() :]

    matches = list(H2.finditer(source))
    preamble = source[: matches[0].start()] if matches else source
    sections = []
    sources = ""
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(source)
        heading = match.group(1).strip()
        body = source[match.end() : end].strip()
        if heading in SOURCE_HEADINGS:
            sources = MARKDOWN.render(body)
            continue
        sections.append(
            make_section(f"v{major}.{minor}-s{len(sections)}", heading, body)
        )
    if sections and preamble.strip():
        # Keep existing numbered sections stable when a leading story becomes its own page.
        sections.insert(
            0, make_section(f"v{major}.{minor}-sintro", title, preamble.strip())
        )
    elif not sections:
        sections.append(
            make_section(f"v{major}.{minor}-s0", title, preamble.strip())
        )

    file_parts = path.stem.split("-", 2)
    chapter = file_parts[1] if len(file_parts) > 1 else "无"
    return {
        "version": f"{major}.{minor}",
        "major": major,
        "minor": minor,
        "title": title,
        "chapter": chapter if chapter != "无" else "无主线",
        "sections": sections,
        "sources": sources,
    }


def attach_epic_edition(volumes: list[dict], source: Path = EPIC_SOURCE) -> int:
    """Attach each rewrite to its existing page without changing the ordinary edition."""
    if not source.is_dir():
        return 0
    pages = {section["id"]: section for volume in volumes for section in volume["sections"]}
    count = 0
    for path in sorted(source.glob("*.md")):
        match = EDITION_FILE.fullmatch(path.name)
        if not match or path.stem not in pages:
            raise ValueError(f"史诗文稿没有对应的普通版页面：{path.name}")
        volume = parse_file(path, int(match[1]), int(match[2]))
        page = pages[path.stem]
        if (
            len(volume["sections"]) != 1
            or volume["title"] != page["title"]
            or volume["sections"][0]["title"] != page["title"]
        ):
            raise ValueError(f"史诗文稿须为单页，且标题与普通版一致：{path.name}")
        section = volume["sections"][0]
        if not re.sub(r"<[^>]+>", "", section["html"]).strip():
            raise ValueError(f"史诗文稿正文为空：{path.name}")
        page.setdefault("editions", {})["epic"] = {
            "html": section["html"],
            "readingMinutes": section["readingMinutes"],
            "sources": volume["sources"],
        }
        count += 1
    return count


def build() -> None:
    if not SOURCE.is_dir():
        raise SystemExit(f"找不到剧情文档目录：{SOURCE}")
    found: list[tuple[int, int, Path]] = []
    for folder in SOURCE.iterdir():
        if not folder.is_dir() or not GROUP_DIR.fullmatch(folder.name):
            continue
        for path in folder.glob("*.md"):
            match = VERSION_FILE.fullmatch(path.name)
            if not match:
                continue
            major, minor = int(match.group(1)), int(match.group(2))
            if major != int(folder.name[:-2]):
                raise SystemExit(f"文件所在大版本与文件名不符：{path}")
            found.append((major, minor, path))
    found.sort(key=lambda item: (item[0], item[1]))
    if not found:
        raise SystemExit("没有找到版本 Markdown")
    keys = [(major, minor) for major, minor, _ in found]
    if len(keys) != len(set(keys)):
        raise SystemExit("发现重复版本号，请检查 Markdown 文件名")

    volumes = [parse_file(path, major, minor) for major, minor, path in found]
    epic_count = attach_epic_edition(volumes)
    data = {"schema": 1, "volumes": volumes}
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("<", "\\u003c").replace(">", "\\u003e")
    OUTPUT.write_text("window.GENSHIN_STORY = " + payload + ";\n", encoding="utf-8")
    print(f"已生成 {OUTPUT.name}：{len(volumes)} 个版本，{sum(len(v['sections']) for v in volumes)} 页，{epic_count} 页史诗版")


if __name__ == "__main__":
    build()
