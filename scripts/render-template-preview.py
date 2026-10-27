#!/usr/bin/env python3
"""Render a WhatsApp-style message preview PNG for a template in lib/marketingCampaigns/templateRegistry.js.

  python3 scripts/render-template-preview.py <registry-key> <samples.json> <out.png>

samples.json maps VARIABLE NAMES (as in variables.js) to fake example values, e.g.
  {"first_name":"Rahul","records_label":"Full Body Checkup","last_visit_date":"12 Mar 2025","lab_contact":"04000000000"}
The header image is read from the registry's header.sample_url mapped to public/ (or "header_image" in the JSON, a local path).
Needs: Pillow, node. Layout is an approximation of WhatsApp (not pixel exact) for internal review only.
"""
import json, os, re, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FD = "/usr/share/fonts/truetype/noto/"
S = 2  # supersample

def load_template(key):
    js = ("import {TEMPLATES} from './lib/marketingCampaigns/templateRegistry.js';"
          "console.log(JSON.stringify(TEMPLATES.find(t=>t.key===process.argv[1])||null))")
    out = subprocess.run(["node", "--input-type=module", "-e", js, key], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    t = json.loads(out)
    if not t: sys.exit(f"unknown template key: {key}")
    return t

def font(name, size): return ImageFont.truetype(FD + name, size * S)

def wrap(draw, text, fnt, width):
    lines = []
    for para in text.split("\n"):
        if not para.strip(): lines.append(""); continue
        cur = ""
        for w in para.split(" "):
            t = (cur + " " + w).strip()
            if draw.textlength(t, font=fnt) <= width: cur = t
            else: lines.append(cur); cur = w
        lines.append(cur)
    return lines

def main():
    key, samples_path, out = sys.argv[1:4]
    t = load_template(key)
    vals = json.load(open(samples_path))
    body = t["body"]
    for i, name in enumerate(t["params"], 1):
        body = body.replace("{{%d}}" % i, str(vals.get(name, "{{%s}}" % name)))
    body = "".join(c for c in body if ord(c) <= 0xFFFF)  # no colour-emoji font in the preview

    W = 520; PAD = 12; BW = 400; X0 = (W - BW) // 2
    img_path = vals.get("header_image")
    if not img_path and t["header"]["type"] == "image":
        img_path = os.path.join(ROOT, "public", re.sub(r"^https://[^/]+/", "", t["header"]["sample_url"]))
    hdr = None
    if t["header"]["type"] == "image":
        hdr = Image.open(img_path).convert("RGB")
        hw = (BW - 8) * S; hh = int(hw * hdr.size[1] / hdr.size[0]); hdr = hdr.resize((hw, hh), Image.LANCZOS)

    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    fb, ff, ft, fbtn = font("NotoSans-Regular.ttf", 15), font("NotoSans-Regular.ttf", 12), font("NotoSans-Regular.ttf", 11), font("NotoSans-Medium.ttf", 15)
    tw = (BW - 2 * PAD) * S
    lines = wrap(probe, body, fb, tw)
    lh = 21 * S
    footer = t.get("footer")
    body_h = len(lines) * lh
    bub_h = 4 * S + (hdr.size[1] + 6 * S if hdr else PAD * S) + body_h + (20 * S if footer else 0) + 26 * S
    btns = t.get("buttons", [])
    btn_h = 40 * S; gap = 3 * S
    H = int(bub_h + 40 * S + len(btns) * (btn_h + gap) + 30 * S)
    im = Image.new("RGB", (W * S, H), (229, 221, 213)); d = ImageDraw.Draw(im)
    # faint doodle-free chat background
    y0 = 20 * S; x0 = X0 * S; x1 = (X0 + BW) * S
    d.rounded_rectangle([x0, y0, x1, y0 + bub_h], radius=10 * S, fill=(255, 255, 255))
    y = y0 + 4 * S
    if hdr:
        mask = Image.new("L", hdr.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, hdr.size[0], hdr.size[1]], radius=7 * S, fill=255)
        im.paste(hdr, (x0 + 4 * S, y), mask); y += hdr.size[1] + 6 * S
    else:
        y += PAD * S - 4 * S
    for ln in lines:
        d.text((x0 + PAD * S, y), ln, font=fb, fill=(17, 27, 33)); y += lh
    if footer:
        d.text((x0 + PAD * S, y + 4 * S), footer, font=ff, fill=(134, 150, 160)); y += 20 * S
    ts = "10:42 am"
    d.text((x1 - PAD * S - d.textlength(ts, font=ft), y0 + bub_h - 20 * S), ts, font=ft, fill=(134, 150, 160))
    by = y0 + bub_h + gap
    blue = (0, 140, 220)
    for b in btns:
        d.rounded_rectangle([x0, by, x1, by + btn_h], radius=8 * S, fill=(255, 255, 255))
        label = b["text"]; lw = d.textlength(label, font=fbtn); cx = (x0 + x1) / 2; cy = by + btn_h / 2
        ix = cx - lw / 2 - 22 * S; r = 6 * S
        if b["type"] == "url":  # "open link" arrow
            d.line([(ix - r, cy + r), (ix + r, cy - r)], fill=blue, width=2 * S)
            d.line([(ix - 1 * S, cy - r), (ix + r, cy - r), (ix + r, cy + 1 * S)], fill=blue, width=2 * S)
        else:  # reply arrow
            d.line([(ix + r, cy + r), (ix + r, cy - 1 * S), (ix - r, cy - 1 * S)], fill=blue, width=2 * S)
            d.polygon([(ix - r - 2 * S, cy - 1 * S), (ix - 1 * S, cy - 6 * S), (ix - 1 * S, cy + 4 * S)], fill=blue)
        d.text((cx - lw / 2 + 8 * S, cy - 10 * S), label, font=fbtn, fill=blue)
        by += btn_h + gap
    # caption
    cap = f"Preview: {t['name']} ({t['category']}, {t['status']}). Example data only."
    d.text((x0, H - 24 * S), cap, font=ft, fill=(100, 110, 115))
    im = im.resize((W, H // S), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    im.save(out)
    print("wrote", out)

if __name__ == "__main__":
    main()
