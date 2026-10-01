#!/usr/bin/env python3
"""Trim one actual learning recording by reviewed action markers.

The beginning, completion, and reloaded saved home belong to the same capture.
Only repeated cards and the long reload wait are omitted. No UI is fabricated.
"""
import argparse
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, type=Path)
    args = parser.parse_args()
    base = args.directory.resolve()
    evidence = json.loads((base / 'capture/evidence.json').read_text())
    if not evidence.get('verifiedNewUi') or not evidence.get('syntheticData'):
        raise SystemExit('A verified synthetic local capture is required.')
    capture = next(c for c in evidence['clips'] if c['name'] == 'learner')
    source = base / 'capture' / capture['video']
    if capture['pageErrorCount']:
        raise SystemExit('Capture contains browser errors.')
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
        'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(source)]))

    def marker(name):
        return next(a['atSeconds'] for a in capture['actions'] if a.get('marker') == name)

    first_rating = next(a['atSeconds'] for a in capture['actions']
                        if a['action'] == 'click' and a.get('testId') == 'study-rate-3')
    home_shot = next(a['atSeconds'] for a in capture['actions']
                    if a.get('name') == 'learner-saved-home.png')
    segments = [
        {'start': marker('home-ready') + .18, 'end': first_rating + .22,
         'reason': '学習ホームから1語目の意味確認・自己評価まで'},
        {'start': marker('completed') + .31, 'end': home_shot + .25,
         'reason': '同一20語セッションの完了・ホームへ戻る'},
        {'start': marker('saved-home-reloaded') + .49, 'end': duration - .02,
         'reason': '同一セッションの再読込後の保存記録'}
    ]
    filters = []
    for index, item in enumerate(segments):
        if not 0 <= item['start'] < item['end'] <= duration:
            raise SystemExit('Edit markers exceed the source recording.')
        filters.append(f"[0:v]trim=start={item['start']}:end={item['end']},setpts=PTS-STARTPTS[v{index}]")
    filters.append(''.join(f'[v{i}]' for i in range(len(segments))) +
                   f'concat=n={len(segments)}:v=1:a=0[v]')
    target = base / 'capture/learner-edited.mp4'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
        '-filter_complex', ';'.join(filters), '-map', '[v]', '-an', '-r', '30', '-c:v',
        'libx264', '-crf', '18', '-preset', 'fast', '-threads', '4', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', str(target)], check=True)
    result = {'source': source.name, 'target': target.name, 'sourceSeconds': duration,
              'editedSeconds': sum(s['end'] - s['start'] for s in segments),
              'segments': segments, 'sameActualLearningSession': True,
              'omitted': '反復する19語の操作と再読込の待機時間',
              'actualAssertions': ['20語完了', '保存エラー非表示', 'ホーム復帰', '再読込後ホーム表示']}
    (base / 'capture/edit-evidence.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
