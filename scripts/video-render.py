#!/usr/bin/env python3
"""Render the instructor-meeting video from verified local UI recordings.

Only reads the supplied manifest and its capture assets. No network, application
DB, environment secrets, or production mutations. All outputs stay below the
manifest directory. Dependencies: Pillow, ffmpeg, ffprobe; optional macOS say.
"""

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 30
CREAM, INK, ORANGE, GOLD = '#FDF3ED', '#2F1609', '#F66D0B', '#FFBF52'
FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc'
BOLD = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'


def run(args):
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{Path(str(args[0])).name} failed: {result.stderr[-5000:]}')
    return result.stdout


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


def wrap(draw, text, f, width):
    lines, current = [], ''
    for char in text:
        if char == '\n':
            lines.append(current)
            current = ''
        elif current and draw.textlength(current + char, font=f) > width:
            lines.append(current)
            current = char
        else:
            current += char
    if current:
        lines.append(current)
    return lines


def lines(draw, text, pos, size=54, width=1650, gap=20, bold=False, color=INK):
    x, y = pos
    f = font(size, bold)
    result = wrap(draw, text, f, width)
    for line in result:
        draw.text((x, y), line, fill=color, font=f)
        y += size + gap
    return y


def background(scene, index, count, dest):
    im = Image.new('RGB', (W, H), CREAM)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 16, H), radius=0, fill=ORANGE)
    d.text((96, 52), 'MedAse', fill=ORANGE, font=font(58, True))
    d.text((402, 68), 'STUDY SPACE', fill=INK, font=font(27, True))
    d.rounded_rectangle((1370, 58, 1824, 116), 29, fill='white')
    d.ellipse((1400, 78, 1416, 94), fill=ORANGE)
    d.text((1434, 69), '開発版・架空の学習履歴', fill=INK, font=font(27))

    if scene['kind'] == 'card':
        label = scene.get('eyebrow', '講師ミーティング / 2026.10.12')
        d.text((96, 195), label, fill='#66321A', font=font(36, True))
        y = lines(d, scene['headline'], (96, 284), size=scene.get('headlineSize', 92),
                  width=1650, gap=28, bold=True)
        if scene.get('body'):
            lines(d, scene['body'], (96, y + 42), size=scene.get('bodySize', 47),
                  width=1620, gap=22)
        for i, item in enumerate(scene.get('facts', [])):
            y0 = 424 + i * 137
            d.rounded_rectangle((96, y0, 1824, y0 + 114), radius=20, fill='white')
            d.rounded_rectangle((96, y0, 109, y0 + 114), radius=6, fill=ORANGE)
            lines(d, item, (140, y0 + 24), size=43, width=1620, gap=8)
    else:
        d.text((96, 133), scene['headline'], fill=INK, font=font(45, True))
        d.rounded_rectangle((90, 218, 1830, 904), radius=26, fill='#D8C9BE')
        d.rounded_rectangle((94, 220, 1826, 900), radius=24, fill='white')
        if scene.get('layout') == 'mobile':
            lines(d, 'スマホでも、\n今日の一歩から。', (140, 340), size=74,
                  width=990, gap=28, bold=True)
            lines(d, '学習の入口から、単語の意味へ。\nスマホ幅で、操作を確かめました。',
                  (140, 568), size=42, width=960, gap=22)
            d.text((140, 793), 'スマホ幅のブラウザーで実操作', fill='#66321A', font=font(27))

    # Fixed caption backing. The Japanese subtitles are burned in separately.
    d.rounded_rectangle((72, 934, 1848, 1040), radius=22, fill=INK)
    d.text((96, 1051), 'メッドエース スタディスペース  |  ローカル実操作デモ',
           fill='#66321A', font=font(19))
    d.text((1760, 1051), f'{index + 1:02d} / {count:02d}', fill='#66321A', font=font(19))
    im.save(dest)


def srt_time(seconds):
    ms = round(seconds * 1000)
    return f'{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}'


def ass_time(seconds):
    cs = round(seconds * 100)
    return f'{cs // 360000:01}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}'


def escaped_ass(text):
    return text.replace('\\', '\\\\').replace('{', '\\{').replace('}', '\\}').replace('\n', '\\N')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--narration', action='store_true', help='Opt in to local macOS speech synthesis.')
    args = parser.parse_args()
    manifest_path = args.manifest.resolve()
    base = manifest_path.parent
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('verifiedNewUi') is not True:
        raise SystemExit('Refusing final render: manifest must confirm verifiedNewUi=true.')
    scenes = manifest['scenes']
    if not any(s['kind'] == 'video' for s in scenes):
        raise SystemExit('The meeting deliverable requires actual UI recording.')
    duration = sum(s['duration'] for s in scenes)
    if not 60 <= duration <= 120:
        raise SystemExit(f'Expected 60–120 seconds, got {duration}.')
    build = base / 'render'
    build.mkdir(parents=True, exist_ok=True)
    srt, dialogue, chapter = [], [], []
    t = 0.0
    for idx, scene in enumerate(scenes):
        seconds = scene['duration']
        bg = build / f'scene-{idx:02}.png'
        background(scene, idx, len(scenes), bg)
        result = build / f'scene-{idx:02}.mp4'
        argv = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1',
                '-framerate', FPS, '-i', bg]
        if scene['kind'] == 'video':
            source = (base / scene['asset']).resolve()
            if not source.is_file() or base not in source.parents:
                raise SystemExit(f'Missing asset or path outside video directory: {source}')
            argv += ['-ss', scene.get('trimStart', 0), '-i', source]
            # Never fabricate a completed UI state. The captured ending may hold.
            if scene.get('layout') == 'mobile':
                filt = '[1:v]setpts=PTS-STARTPTS,scale=380:652:force_original_aspect_ratio=decrease,pad=380:652:(ow-iw)/2:(oh-ih)/2:color=white,tpad=stop_mode=clone:stop_duration=120[ui];[0:v][ui]overlay=1300:238:shortest=1[v]'
            else:
                filt = '[1:v]setpts=PTS-STARTPTS,scale=1720:672:force_original_aspect_ratio=decrease,pad=1720:672:(ow-iw)/2:(oh-ih)/2:color=white,tpad=stop_mode=clone:stop_duration=120[ui];[0:v][ui]overlay=100:224:shortest=1[v]'
            argv += ['-filter_complex', filt, '-map', '[v]']
        else:
            argv += ['-vf', 'format=yuv420p']
        argv += ['-t', seconds, '-r', FPS, '-an', '-c:v', 'libx264', '-preset', 'fast',
                 '-crf', '19', '-threads', '4', '-pix_fmt', 'yuv420p', result]
        run(argv)
        caption = scene['caption']
        parts = scene.get('captions', [{'at': 0, 'duration': seconds, 'text': caption}])
        previous_end = 0
        for part in parts:
            start, end = part['at'], part['at'] + part['duration']
            if start < previous_end or end > seconds or start < 0 or end <= start:
                raise SystemExit(f'Scene {idx}: caption timings overlap or exceed chapter duration.')
            caption_lines = wrap(ImageDraw.Draw(Image.new('RGB', (W, H))), part['text'], font(42), 1670)
            if len(caption_lines) > 2:
                raise SystemExit(f'Scene {idx}: caption exceeds two readable lines.')
            caption_text = '\n'.join(caption_lines)
            srt.append(f'{len(srt) + 1}\n{srt_time(t + start)} --> {srt_time(t + end)}\n{caption_text}\n')
            dialogue.append(f'Dialogue: 0,{ass_time(t + start)},{ass_time(t + end)},Default,,0,0,0,,{escaped_ass(caption_text)}')
            previous_end = end
        chapter.append({'index': idx + 1, 'start': t, 'end': t + seconds,
                        'headline': scene['headline'], 'caption': caption,
                        'kind': scene['kind'], 'asset': scene.get('asset'), 'captions': parts})
        t += seconds

    subtitle = base / 'medase-meeting-2026-10-12.ja.srt'
    subtitle.write_text('\n'.join(srt))
    ass = build / 'subtitles.ass'
    ass.write_text('[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Hiragino Sans,42,&H00FFFFFF,&H00FFFFFF,&H002F1609,&H002F1609,0,0,0,0,100,100,0,0,1,0,0,2,112,112,61,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' + '\n'.join(dialogue) + '\n')
    concat = build / 'scenes.txt'
    concat.write_text('\n'.join(f"file '{(build / f'scene-{idx:02}.mp4').as_posix()}'" for idx in range(len(scenes))))
    combined = build / 'combined.mp4'
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0',
         '-i', concat, '-c', 'copy', combined])

    # Narration per scene is padded to its matching chapter; a scene must never
    # be shorter than its spoken narration. Local system voice, no uploads.
    audio_inputs = []
    if args.narration and shutil.which('say'):
        for idx, scene in enumerate(scenes):
            speech = scene.get('narration', scene['caption'])
            txt = build / f'narration-{idx:02}.txt'
            txt.write_text(speech)
            aiff = build / f'narration-{idx:02}.aiff'
            run(['say', '-v', manifest.get('voice', 'Kyoko'), '-r', manifest.get('speechRate', 178),
                 '-f', txt, '-o', aiff])
            probed = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                          '-of', 'default=noprint_wrappers=1:nokey=1', aiff]).strip()
            if not probed or probed == 'N/A' or float(probed) <= 0:
                raise SystemExit('Local speech service produced no audio. Rerun without --narration.')
            spoken_seconds = float(probed)
            if spoken_seconds > scene['duration'] - 0.4:
                raise SystemExit(f'Scene {idx}: narration {spoken_seconds:.1f}s does not fit {scene["duration"]}s.')
            wav = build / f'narration-{idx:02}.wav'
            run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', aiff, '-af',
                 'adelay=300|300,apad', '-t', scene['duration'], '-ar', '48000', '-ac', '2', wav])
            audio_inputs.append(wav)
    audio = build / 'narration.wav'
    if audio_inputs:
        ac = build / 'audio.txt'
        ac.write_text('\n'.join(f"file '{p.as_posix()}'" for p in audio_inputs))
        run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0',
             '-i', ac, '-c', 'copy', audio])

    final = base / 'medase-meeting-2026-10-12.mp4'
    argv = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', combined]
    if audio_inputs:
        argv += ['-i', audio, '-map', '0:v', '-map', '1:a', '-af',
                 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '160k']
    argv += ['-vf', f'ass={ass.as_posix()}', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
             '-threads', '4', '-pix_fmt', 'yuv420p', '-t', duration, '-movflags', '+faststart', final]
    run(argv)
    metadata = json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', final]))
    (base / 'ffprobe.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
    (base / 'storyboard.json').write_text(json.dumps(chapter, ensure_ascii=False, indent=2))
    contacts = base / 'inspection'
    contacts.mkdir(exist_ok=True)
    for item in chapter:
        run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', (item['start'] + item['end']) / 2,
             '-i', final, '-frames:v', '1', contacts / f'chapter-{item["index"]:02}.jpg'])
    print(json.dumps({'video': str(final), 'subtitles': str(subtitle), 'seconds': duration,
                      'resolution': [W, H], 'fps': FPS, 'narration': bool(audio_inputs)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, KeyError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
