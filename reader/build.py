"""将 story-summaries 中的版本 Markdown 编译为可离线打开的静态阅读器数据。"""

from __future__ import annotations

import json
import re
from pathlib import Path

from markdown_it import MarkdownIt


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "story-summaries"
OUTPUT = Path(__file__).resolve().parent / "story-data.js"
VERSION_FILE = re.compile(r"^(\d+)\.(\d+)(?:-(.*))?\.md$")
GROUP_DIR = re.compile(r"^\d+\.x$")
H2 = re.compile(r"(?m)^##\s+(.+?)\s*$")
H1 = re.compile(r"(?m)^#\s+(.+?)\s*$")
MARKDOWN = MarkdownIt("commonmark", {"html": False})


def title_kind(heading: str) -> str:
    if any(word in heading for word in ("世界", "支线", "线索", "同期")):
        return "world"
    if "悬而未决" in heading:
        return "question"
    return "chapter"


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
        if heading in ("资料", "资料来源", "参考资料"):
            sources = MARKDOWN.render(body)
            continue
        if not sections and preamble.strip():
            body = preamble.strip() + "\n\n" + body
        sections.append(
            {
                "id": f"v{major}.{minor}-s{len(sections)}",
                "title": heading,
                "kind": title_kind(heading),
                "html": MARKDOWN.render(body),
            }
        )
    if not sections:
        sections.append(
            {
                "id": f"v{major}.{minor}-s0",
                "title": "本版纪事",
                "kind": "chapter",
                "html": MARKDOWN.render(preamble.strip()),
            }
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
    data = {"schema": 1, "volumes": volumes}
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("<", "\\u003c").replace(">", "\\u003e")
    OUTPUT.write_text("window.GENSHIN_STORY = " + payload + ";\n", encoding="utf-8")
    print(f"已生成 {OUTPUT.name}：{len(volumes)} 个版本，{sum(len(v['sections']) for v in volumes)} 页")


if __name__ == "__main__":
    build()
