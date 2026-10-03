#!/usr/bin/env python3
"""Verify the local meeting deliverable without extracting every frame."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

NARU_BOOK_TITLE = 'Naruシスト'
NARU_WORD_COUNT = 1530


def timestamp(value):
    h, m, s, ms = [int(part) for part in re.split('[:,]', value)]
    return h * 3600 + m * 60 + s + ms / 1000


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, type=Path)
    args = parser.parse_args()
    base = args.directory.resolve()
    movie = base / 'medase-meeting-2026-10-12.mp4'
    subtitles = base / 'medase-meeting-2026-10-12.ja.srt'
    manifest = json.loads((base / 'manifest.json').read_text())
    metadata = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format',
        '-show_streams', '-of', 'json', str(movie)]))
    video = next(s for s in metadata['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in metadata['streams'] if s['codec_type'] == 'audio')
    seconds = float(metadata['format']['duration'])
    expected = sum(s['duration'] for s in manifest['scenes'])
    assert 60 <= seconds <= 120 and abs(seconds - expected) < .15
    assert (video['width'], video['height'], video['codec_name']) == (1920, 1080, 'h264')
    assert video['r_frame_rate'] == '30/1'
    assert audio['codec_name'] == 'aac' and audio['sample_rate'] == '48000'
    assert manifest['verifiedNewUi'] is True and manifest['syntheticData'] is True
    cues = subtitles.read_text().strip().split('\n\n')
    prior_end = 0
    for index, cue in enumerate(cues, 1):
        lines = cue.splitlines()
        assert int(lines[0]) == index
        start, end = map(timestamp, lines[1].split(' --> '))
        assert prior_end <= start < end <= seconds + .001
        assert 1 <= len(lines[2:]) <= 2 and re.search('[ぁ-んァ-ヶ一-龯]', ''.join(lines[2:]))
        prior_end = end
    evidence = json.loads((base / 'capture/evidence.json').read_text())
    assert evidence['syntheticData'] and evidence['verifiedNewUi']
    assert evidence['localOrigin'].startswith('http://127.0.0.1:')
    for name in ['learner', 'mobile', 'instructor']:
        clip = next(c for c in evidence['clips'] if c['name'] == name)
        assert clip['pageErrorCount'] == 0 and (base / 'capture' / clip['video']).is_file()
        if name in ['mobile', 'instructor']:
            assert clip['beforeHtml'] == clip['afterHtml']
            assert clip['beforeHtml']['status'] == 200
            assert clip['beforeHtml']['sha256'] == manifest['runtimeEvidence']['expectedHtmlSha256']
            assert clip['beforeHtml']['module'] == manifest['runtimeEvidence']['expectedModule']
            for stage in ['authenticatedBefore', 'authenticatedAfter']:
                assert clip[stage]['sessionStatus'] == 200
                assert clip[stage]['catalogReadStatus'] == 200
                assert type(clip[stage]['originalBookCount']) is int and clip[stage]['originalBookCount'] == 1
                assert type(clip[stage]['originalWordCount']) is int and clip[stage]['originalWordCount'] == NARU_WORD_COUNT
                assert clip[stage]['originalBooks'] == [{'title': NARU_BOOK_TITLE, 'wordCount': NARU_WORD_COUNT}]
    edits = json.loads((base / 'capture/edit-evidence.json').read_text())
    assert edits['sameActualLearningSession'] is True
    decoded = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-threads', '4',
        '-i', str(movie), '-filter_complex', '[0:a]ebur128=peak=true[a]',
        '-map', '0:v', '-map', '[a]', '-f', 'null', '-'], capture_output=True, text=True)
    (base / 'decode-audio-qa.log').write_text(decoded.stderr)
    assert decoded.returncode == 0
    summary = decoded.stderr.split('Summary:')[-1]
    loudness = float(re.search(r'I:\s+(-?[\d.]+) LUFS', summary).group(1))
    peak = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', summary).group(1))
    assert -19 <= loudness <= -13 and peak < 0
    result = {
        'status': 'passed', 'durationSeconds': seconds, 'resolution': [1920, 1080],
        'fps': 30, 'videoCodec': 'h264', 'audioCodec': 'aac', 'audioSampleRate': 48000,
        'integratedLoudnessLUFS': loudness, 'truePeakDBFS': peak, 'fullDecodeExitCode': 0,
        'japaneseSubtitleCues': len(cues), 'subtitlesWithinDuration': True,
        'allThreeActualCaptureContextsWithoutPageErrors': True,
        'mobileAndTeacherFixedHtmlModuleSessionAnd1530WordsBeforeAfter': True,
        'originalMaterial': {'title': NARU_BOOK_TITLE, 'bookCount': 1, 'wordCount': NARU_WORD_COUNT},
        'earlierLearnerHashNotCaptured': True,
        'repeatedLearningOperationsEditedWithinSameSession': True,
        'visualInspectionRequired': [f'inspection/chapter-{i:02}.jpg' for i in range(1, 8)],
        'sha256': {p.name: hashlib.file_digest(p.open('rb'), 'sha256').hexdigest()
                   for p in [movie, subtitles]},
        'limits': ['合成ユーザー・ローカル環境', '学習者と講師は別の独立デモ',
                   '390pxブラウザー幅でのスマホ表示', '小テスト本文一致は未確認',
                   '本番切替・配備・通知送信は未実施']}
    (base / 'qa.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
