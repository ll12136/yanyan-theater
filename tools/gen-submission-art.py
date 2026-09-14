# 生成黑客松提交用的封面图与 icon。
#
# 素材只用项目里已有的东西：刘看山的官方 sprite sheet 第一帧 + 界面那套暗紫夜色色板。
# 用法：python tools/gen-submission-art.py
# 产物：submission/封面-1200x630.png、submission/icon-512.png
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "submission"
FOX_SHEET = ROOT / "public" / "assets" / "kanshan" / "greet.png"
FOX_FRAME = (0, 0, 150, 176)  # MenuScene 里 spritesheet 的 frameWidth/frameHeight

BG_TOP = (30, 23, 48)      # THEME.bg
BG_BOTTOM = (23, 17, 38)   # THEME.bg2
TEXT = (242, 237, 251)     # THEME.text
MUTED = (196, 185, 221)    # THEME.muted
FAINT = (145, 132, 176)    # THEME.faint
WARM = (229, 181, 103)     # THEME.warm
GREEN = (134, 214, 180)    # THEME.green
LINE = (74, 63, 107)       # THEME.line

BOLD = "C:/Windows/Fonts/msyhbd.ttc"
REGULAR = "C:/Windows/Fonts/msyh.ttc"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def gradient(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), BG_TOP)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        draw.line(
            [(0, y), (w, y)],
            fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)),
        )
    # 和界面同款的那层点阵，密度低一点，不抢主体
    for x in range(24, w, 40):
        for y in range(24, h, 40):
            draw.point((x, y), fill=LINE)
    return img


def fox(size: int) -> Image.Image:
    sheet = Image.open(FOX_SHEET).convert("RGBA")
    frame = sheet.crop(FOX_FRAME)
    frame = frame.resize((size, round(size * FOX_FRAME[3] / FOX_FRAME[2])), Image.LANCZOS)
    return frame.transpose(Image.FLIP_LEFT_RIGHT)  # 和首屏一样，脸朝左半区的文案


def cover() -> None:
    w, h = 1200, 630
    img = gradient(w, h).convert("RGBA")
    draw = ImageDraw.Draw(img)

    # 顶部品牌行（不要用 ✦ 这类符号：微软雅黑没有这个字形，会渲染成豆腐块）
    draw.text((72, 64), "知乎黑客松 2026 · 跨次元游乐场 · AI 游戏与互动叙事", font=font(REGULAR, 22), fill=FAINT)
    draw.line([(72, 104), (1128, 104)], fill=LINE, width=1)

    # 主标题：一句话问出来
    draw.text((72, 150), "看山问你，", font=font(BOLD, 68), fill=TEXT)
    draw.text((72, 232), "睡了吗？", font=font(BOLD, 68), fill=TEXT)

    # 主张
    draw.text((72, 344), "先松开，再动一动", font=font(BOLD, 34), fill=WARM)
    draw.text(
        (72, 396),
        "睡不着的时候，硬躺着没用：\n先缓解一点压力，再做一点运动。",
        font=font(REGULAR, 24),
        fill=MUTED,
        spacing=12,
    )

    # 三句硬事实，用薄荷绿
    facts = ["三个声音来自知乎真实内容 · 一字不改", "AI 只改编，不生成一句安慰", "三分钟走完 · 键鼠与体感都能玩"]
    for i, text in enumerate(facts):
        y = 496 + i * 32
        draw.ellipse([(72, y + 8), (80, y + 16)], fill=GREEN)
        draw.text((96, y), text, font=font(REGULAR, 20), fill=MUTED)

    # 右侧：刘看山
    art = fox(360)
    img.alpha_composite(art, (760, 190))

    img.convert("RGB").save(OUT / "封面-1200x630.png", quality=95)


def icon() -> None:
    size = 512
    img = gradient(size, size).convert("RGBA")
    # 圆角：叠一层遮罩，只留中间那块
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=96, fill=255)
    img.putalpha(mask)

    art = fox(330)
    img.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2 + 18))

    img.save(OUT / "icon-512.png")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    cover()
    icon()
    print(f"已生成：{OUT / '封面-1200x630.png'}、{OUT / 'icon-512.png'}")
