#!/usr/bin/env python3
"""P19 offline, deterministic in-memory package preview; never releases files."""
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = (
    "content/colors.js",
    "vendor/neural_core/neural-core.js",
    "content/neural.js",
    "content/ai-first-beta.js",
    "content/content.js",
)
ICONS = {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
}
FILES = frozenset(("manifest.json", "popup/index.html",
                   "popup/popup.js", "popup/popup.css",
                   *SCRIPTS, *ICONS.values()))
NETWORK_OR_EVAL = re.compile(
    r"\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(|"
    r"\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|"
    r"\bimportScripts\s*\(|\bhttps?://", re.I)
REMOTE_CSS = re.compile(r"@import\b|url\s*\(\s*['\"]?(?:https?:|//)", re.I)


class Popup(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.js, self.css, self.images = [], [], []
        self.in_script = False
        self.inline = False

    def handle_starttag(self, tag, pairs):
        # HTMLParser does not reject duplicate attribute names by itself.
        names = [name for name, _ in pairs]
        if len(set(names)) != len(names):
            raise ValueError("P19: duplicated HTML attribute")
        a = dict(pairs)
        if (tag in ("iframe", "embed", "object", "base", "style",
                    "form", "svg", "math", "video", "audio", "source",
                    "track", "template") or
            any(name.startswith("on") or
                name in ("style", "srcset", "action", "formaction", "poster",
                         "background") for name in names)):
            raise ValueError("P19: inline code, media or active HTML")
        # Block unapproved resource loads and navigation schemes on any tag.
        if tag == "script":
            if set(a) != {"src", "defer"} or a["defer"] is not None:
                raise ValueError("P19: unexpected script attributes")
            self.in_script = True
            self.js.append(a["src"])
        elif tag == "link":
            if a != {"rel": "stylesheet", "href": "popup.css"}:
                raise ValueError("P19: unapproved stylesheet or preload")
            self.css.append(a["href"])
        elif tag == "img":
            if a.get("src") != "../icons/icon-48.png":
                raise ValueError("P19: unapproved image source")
            self.images.append(a["src"])
        elif tag == "meta":
            if a not in (
                {"charset": "utf-8"},
                {"name": "viewport", "content": "width=device-width, initial-scale=1"},
                {"name": "color-scheme", "content": "dark"},
            ):
                raise ValueError("P19: metadata redirect or policy override")
        if tag not in ("script", "link", "img") and ("href" in a or "src" in a):
            raise ValueError("P19: unexpected navigation or resource URL")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag == "script":
            raise ValueError("P19: self-closing script is forbidden")

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script = False

    def handle_data(self, data):
        if self.in_script and data.strip():
            self.inline = True


def validate_manifest(m):
    expected = {"manifest_version", "name", "short_name", "version",
                "description", "permissions", "action", "content_scripts",
                "icons"}
    if (type(m) is not dict or set(m) != expected or m["manifest_version"] != 3 or
        m["permissions"] != ["storage", "activeTab"] or m["icons"] != ICONS or
        type(m["version"]) is not str or
        not re.fullmatch(r"\d+\.\d+\.\d+", m["version"])):
        raise ValueError("P19: unauthorized permissions or metadata")
    action = m["action"]
    if (type(action) is not dict or
        set(action) != {"default_title", "default_popup", "default_icon"} or
        action["default_popup"] != "popup/index.html" or
        action["default_icon"] != {k: ICONS[k] for k in ("16", "32", "48")}):
        raise ValueError("P19: unauthorized popup or icon")
    scripts = m["content_scripts"]
    if (type(scripts) is not list or len(scripts) != 1 or
        type(scripts[0]) is not dict or
        set(scripts[0]) != {"matches", "js", "run_at", "all_frames"}):
        raise ValueError("P19: unknown injected-script settings")
    s = scripts[0]
    if (s["matches"] != ["http://*/*", "https://*/*"] or
        s["js"] != list(SCRIPTS) or s["run_at"] != "document_start" or
        s["all_frames"] is not True):
        raise ValueError("P19: injected code/hosts changed")
    return FILES


def validate_popup(html):
    p = Popup()
    p.feed(html)
    p.close()
    if (p.js != ["popup.js"] or p.css != ["popup.css"] or
        p.images != ["../icons/icon-48.png"] or p.inline):
        raise ValueError("P19: remote, unexpected or inline popup resource")
    return True


def validate_source(name, data):
    if name.endswith(".js") and NETWORK_OR_EVAL.search(data.decode("utf8")):
        raise ValueError("P19: dynamic code or network API")
    if name.endswith(".css") and REMOTE_CSS.search(data.decode("utf8")):
        raise ValueError("P19: external stylesheet")
    if name.endswith(".png") and not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("P19: invalid PNG")
    return True


def create_preview(root=ROOT):
    root = Path(root).resolve()
    manifest = root / "manifest.json"
    if manifest.is_symlink() or not manifest.is_file():
        raise ValueError("P19: missing or linked manifest")
    approved = validate_manifest(json.loads(manifest.read_text(encoding="utf8")))
    items, total = {}, 0
    for name in sorted(approved):
        rel = PurePosixPath(name)
        file = root / name
        if (rel.is_absolute() or ".." in rel.parts or file.is_symlink() or
            not file.is_file() or not file.resolve().is_relative_to(root)):
            raise ValueError("P19: missing, linked or escaped runtime file")
        payload = file.read_bytes()
        total += len(payload)
        if not payload or len(payload) > 1048576 or total > 3145728:
            raise ValueError("P19: runtime files exceed limits")
        validate_source(name, payload)
        items[name] = payload
    validate_popup(items["popup/index.html"].decode("utf8"))
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for name, payload in items.items():
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            z.writestr(info, payload, compress_type=zipfile.ZIP_DEFLATED,
                       compresslevel=9)
    archive = output.getvalue()
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if set(z.namelist()) != approved or len(z.namelist()) != len(approved):
            raise ValueError("P19: unexpected ZIP entries")
        if any(z.read(name) != items[name] for name in approved):
            raise ValueError("P19: ZIP bytes differ from sources")
    return archive, {
        "kind": "p19-package-preflight-v1",
        "status": "runtime-structure-verified-only",
        "runtimeFileCount": len(items), "sourceBytes": total,
        "zipBytes": len(archive),
        "sha256": hashlib.sha256(archive).hexdigest(),
        "includesTrainingOrCandidateFiles": False,
        "extraPermissions": False,
        "independentSecurityReviewComplete": False,
        "humanVisualValidationComplete": False,
        "regionalModelApproved": False,
        "holdoutEvaluated": False,
        "releaseEligible": False,
        "archiveWrittenToDisk": False,
    }


if __name__ == "__main__":
    import sys
    if sys.argv[1:] != ["--check"]:
        raise SystemExit("P19: only --check; never write a release archive")
    print(json.dumps(create_preview()[1], sort_keys=True))
