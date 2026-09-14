"""Build Phaser sprite sheets for 刘看山 (Liu Kanshan) from the official GIF pack.

The official pack ships animated GIFs, which Phaser cannot play directly, so this
tool slices every GIF into a uniform grid sheet plus a small TypeScript manifest
consumed by src/companion/kanshanAssets.ts.

Usage:
    python tools/build-kanshan-sprites.py [--src <dir with the GIFs>] [--check]

Requires Pillow (pip install pillow).
"""

from __future__ import annotations

import argparse
import math
import os
import sys

from PIL import Image, ImageSequence

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
OUT_PNG = os.path.join(PROJECT, 'public', 'assets', 'kanshan')
OUT_TS = os.path.join(PROJECT, 'src', 'companion', 'kanshanAssets.ts')
DEFAULT_SRC = os.path.join(os.path.dirname(PROJECT), '刘看山素材包', '刘看山动态')

# Crop window in source pixels: the union bounding box of every frame of all six
# animations (plus padding), so each sheet shares one scale and nothing is clipped.
# The upper band matters: the 电脑 (desk) animation pops a light bulb above the head.
# key -> union bbox: idle x[74,257] y[54,315] / greet x[48,262] y[30,316]
# wander x[30,283] y[47,318] / desk x[30,287] y[3,318] / sleepy x[73,270] y[54,316]
# dribble x[39,290] y[51,316]
CROP = (24, 0, 296, 320)
FRAME_H = 176
COLS = 8

# key, source GIF, frame step (2 => 10 fps), Chinese label
ANIMS = [
    ('idle', '待机_5秒_320x320_20fps_透明.gif', 2, '待机'),
    ('greet', '打招呼_4秒_320x320_20fps_透明.gif', 1, '打招呼'),
    ('wander', '晃悠_320x320_3秒_20fps_透明.gif', 1, '晃悠'),
    ('desk', '电脑_6秒_320x320_20fps_透明.gif', 2, '电脑'),
    ('sleepy', '瞌睡_5秒_320x320_20fps_透明.gif', 2, '瞌睡'),
    ('dribble', '运球_4秒_320x320_20fps_透明.gif', 1, '运球'),
]


def build(src: str, check_only: bool = False) -> None:
    crop_w = CROP[2] - CROP[0]
    crop_h = CROP[3] - CROP[1]
    scale = FRAME_H / crop_h
    frame_w = int(round(crop_w * scale))
    os.makedirs(OUT_PNG, exist_ok=True)

    entries = []
    for key, gif, step, label in ANIMS:
        path = os.path.join(src, gif)
        if not os.path.exists(path):
            sys.exit(f'missing source GIF: {path}')
        with Image.open(path) as im:
            frames = []
            for index, frame in enumerate(ImageSequence.Iterator(im)):
                if index % step:
                    continue
                rgba = frame.convert('RGBA')
                if rgba.getbbox() is None:
                    sys.exit(f'{gif} frame {index} is empty - GIF compositing failed')
                frames.append(rgba.crop(CROP).resize((frame_w, FRAME_H), Image.LANCZOS))
        rows = math.ceil(len(frames) / COLS)
        sheet = Image.new('RGBA', (COLS * frame_w, rows * FRAME_H), (0, 0, 0, 0))
        for index, frame in enumerate(frames):
            sheet.paste(frame, ((index % COLS) * frame_w, (index // COLS) * FRAME_H), frame)
        out_name = f'{key}.png'
        if not check_only:
            sheet.save(os.path.join(OUT_PNG, out_name), optimize=True)
        fps = 20 // step
        size = os.path.getsize(os.path.join(OUT_PNG, out_name)) if os.path.exists(os.path.join(OUT_PNG, out_name)) else 0
        entries.append(
            dict(key=key, file=out_name, label=label, source=gif, step=step,
                 frameWidth=frame_w, frameHeight=FRAME_H, cols=COLS, rows=rows,
                 frames=len(frames), fps=fps, bytes=size)
        )
        print(f'{key:8s} <- {gif}  frames={len(frames):3d} @{fps}fps  sheet={COLS * frame_w}x{rows * FRAME_H}  {size / 1024:.0f}KB')

    write_manifest(entries, frame_w, crop_h / FRAME_H)


def write_manifest(entries: list[dict], frame_w: int, source_px_per_sheet_px: float) -> None:
    lines = [
        '/**',
        ' * 刘看山动画清单 —— 由 tools/build-kanshan-sprites.py 从官方素材包（刘看山动态.zip）生成，请勿手改。',
        ' *',
        ' * 官方素材是 320×320 / 20fps 的透明 GIF，Phaser 不能直接播放 GIF，',
        ' * 因此构建脚本把它们切成等距网格精灵图（每帧同尺寸），这里只记录网格参数。',
        f' * 每张图 1 像素对应源素材 {source_px_per_sheet_px:.3f} 像素（所有动画共用同一比例，身高一致）。',
        ' */',
        '',
        'export type KanshanAnimKey = ' + ' | '.join(f"'{e['key']}'" for e in entries) + ';',
        '',
        'export interface KanshanAnimSpec {',
        '  /** Phaser 纹理键与动画键 */',
        '  key: KanshanAnimKey;',
        '  /** 中文动作名，仅用于注释与调试 */',
        '  label: string;',
        '  /** public/assets/kanshan/ 下的文件名 */',
        '  file: string;',
        '  /** 官方素材包里的原始 GIF 名 */',
        '  source: string;',
        '  frameWidth: number;',
        '  frameHeight: number;',
        '  /** 精灵图列数；行数由帧数推出 */',
        '  cols: number;',
        '  frames: number;',
        '  /** 播放帧率（源素材 20fps，抽帧后降低） */',
        '  fps: number;',
        '}',
        '',
        'export const KANSHAN_ANIMS: Record<KanshanAnimKey, KanshanAnimSpec> = {',
    ]
    for e in entries:
        lines += [
            f"  {e['key']}: {{",
            f"    key: '{e['key']}',",
            f"    label: '{e['label']}',",
            f"    file: '{e['file']}',",
            f"    source: '{e['source']}',",
            f"    frameWidth: {e['frameWidth']},",
            f"    frameHeight: {e['frameHeight']},",
            f"    cols: {e['cols']},",
            f"    frames: {e['frames']},",
            f"    fps: {e['fps']}",
            '  },',
        ]
    lines += [
        '};',
        '',
        '/** 实际渲染高度（设计空间 960×640 里的像素，含头顶留白；角色本体约 120px）。 */',
        'export const KANSHAN_DISPLAY_HEIGHT = 144;',
        '',
        '/** 精灵图缩放比：帧像素 → 设计空间像素。 */',
        'export const KANSHAN_SPRITE_SCALE = KANSHAN_DISPLAY_HEIGHT / KANSHAN_ANIMS.idle.frameHeight;',
        '',
    ]
    if not os.path.exists(OUT_TS) or open(OUT_TS, encoding='utf-8').read() != '\n'.join(lines):
        os.makedirs(os.path.dirname(OUT_TS), exist_ok=True)
        with open(OUT_TS, 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(lines))
        print('wrote', OUT_TS)
    else:
        print('unchanged', OUT_TS)
    assert frame_w > 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', default=DEFAULT_SRC, help='directory holding 刘看山动态/*.gif')
    parser.add_argument('--check', action='store_true', help='validate sources without writing sheets')
    args = parser.parse_args()
    build(args.src, args.check)
