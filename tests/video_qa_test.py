"""Run the video QA CLI against synthetic captures and deterministic media probes.

The ffprobe/ffmpeg substitutes exercise the validator's media contracts; they do
not claim to encode or decode a real movie. No existing recording is accessed.
"""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


QA_SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/video-qa.py'


class VideoQaTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='naru-video-qa-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        (self.base / 'capture').mkdir()
        (self.base / 'bin').mkdir()
        self.manifest = {
            'scenes': [{'duration': 80}], 'verifiedNewUi': True,
            'syntheticData': True, 'runtimeEvidence': {
                'expectedHtmlSha256': 'a' * 64, 'expectedModule': '/assets/reviewed.js'},
        }
        html = {'status': 200, 'sha256': 'a' * 64, 'module': '/assets/reviewed.js'}
        authenticated = {
            'sessionStatus': 200, 'catalogReadStatus': 200,
            'originalBookCount': 1, 'originalWordCount': 1530,
            'originalBooks': [{'title': 'Naruシスト', 'wordCount': 1530}],
        }
        self.evidence = {
            'syntheticData': True, 'verifiedNewUi': True,
            'localOrigin': 'http://127.0.0.1:49123', 'clips': [],
        }
        for name in ['learner', 'mobile', 'instructor']:
            (self.base / 'capture' / f'{name}.webm').write_bytes(b'synthetic capture')
            self.evidence['clips'].append({
                'name': name, 'video': f'{name}.webm', 'pageErrorCount': 0,
                'beforeHtml': copy.deepcopy(html), 'afterHtml': copy.deepcopy(html),
                'authenticatedBefore': copy.deepcopy(authenticated),
                'authenticatedAfter': copy.deepcopy(authenticated),
            })
        self.media = {
            'metadata': {'format': {'duration': '80'}, 'streams': [
                {'codec_type': 'video', 'width': 1920, 'height': 1080,
                 'codec_name': 'h264', 'r_frame_rate': '30/1'},
                {'codec_type': 'audio', 'codec_name': 'aac', 'sample_rate': '48000'},
            ]},
            'decodeExitCode': 0,
            'audioSummary': 'Summary:\n I: -16.0 LUFS\n Peak: -1.0 dBFS\n',
        }
        for name in ['ffprobe', 'ffmpeg']:
            executable = self.base / 'bin' / name
            executable.write_text(
                f'#!{sys.executable}\n'
                'import json, os, sys\n'
                'from pathlib import Path\n'
                'config = json.loads(Path(os.environ["VIDEO_QA_TEST_MEDIA"]).read_text())\n'
                'if Path(sys.argv[0]).name == "ffprobe":\n'
                '    print(json.dumps(config["metadata"]))\n'
                'else:\n'
                '    sys.stderr.write(config["audioSummary"])\n'
                '    sys.exit(config["decodeExitCode"])\n')
            executable.chmod(0o700)
        (self.base / 'medase-meeting-2026-10-12.mp4').write_bytes(b'synthetic movie')
        self.subtitles = '1\n00:00:00,000 --> 00:00:02,000\n一冊の教材を学習します\n'
        self.edits = {'sameActualLearningSession': True}

    def run_qa(self):
        # Each invocation must establish success independently.
        (self.base / 'qa.json').unlink(missing_ok=True)
        for filename, data in [('manifest.json', self.manifest),
                               ('capture/evidence.json', self.evidence),
                               ('capture/edit-evidence.json', self.edits),
                               ('media.json', self.media)]:
            (self.base / filename).write_text(json.dumps(data))
        (self.base / 'medase-meeting-2026-10-12.ja.srt').write_text(self.subtitles)
        environment = {**os.environ, 'PATH': f'{self.base / "bin"}{os.pathsep}{os.environ.get("PATH", "")}',
                       'VIDEO_QA_TEST_MEDIA': str(self.base / 'media.json')}
        return subprocess.run([sys.executable, str(QA_SCRIPT), '--directory', str(self.base)],
                              env=environment, capture_output=True, text=True)

    def assert_rejected(self):
        result = self.run_qa()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertFalse((self.base / 'qa.json').exists())

    def test_one_naru_book_and_1530_words_pass_with_all_existing_gates(self):
        result = self.run_qa()
        self.assertEqual(result.returncode, 0, result.stderr)
        qa = json.loads((self.base / 'qa.json').read_text())
        self.assertEqual(qa['status'], 'passed')
        self.assertEqual(qa['originalMaterial'], {'title': 'Naruシスト', 'bookCount': 1, 'wordCount': 1530})
        self.assertEqual(qa['integratedLoudnessLUFS'], -16)
        self.assertEqual(qa['fullDecodeExitCode'], 0)
        self.assertEqual(len(qa['sha256']), 2)

    def test_rejects_old_four_books_wrong_counts_and_unauthenticated_catalogs(self):
        original = copy.deepcopy(self.evidence)
        invalid = [('originalBookCount', 4), ('originalBookCount', 0),
                   ('originalBookCount', True), ('originalWordCount', 1529),
                   ('originalWordCount', 1531), ('originalWordCount', '1530'),
                   ('sessionStatus', 401), ('catalogReadStatus', 403),
                   ('originalBooks', [{'title': 'Naruシスト 動詞', 'wordCount': 1530}]),
                   ('originalBooks', [{'title': 'Naruシスト', 'wordCount': 1529}])]
        for name in ['mobile', 'instructor']:
            for stage in ['authenticatedBefore', 'authenticatedAfter']:
                for field, value in invalid:
                    with self.subTest(name=name, stage=stage, field=field, value=value):
                        self.evidence = copy.deepcopy(original)
                        clip = next(c for c in self.evidence['clips'] if c['name'] == name)
                        clip[stage][field] = value
                        self.assert_rejected()

    def test_rejects_changed_build_browser_errors_and_nonlocal_captures(self):
        original = copy.deepcopy(self.evidence)
        for name in ['mobile', 'instructor']:
            for field, value in [('status', 404), ('sha256', 'b' * 64), ('module', '/assets/old.js')]:
                with self.subTest(name=name, field=field):
                    self.evidence = copy.deepcopy(original)
                    clip = next(c for c in self.evidence['clips'] if c['name'] == name)
                    # Even a consistently wrong before/after build must fail.
                    for stage in ['beforeHtml', 'afterHtml']:
                        clip[stage][field] = value
                    self.assert_rejected()
        for name in ['learner', 'mobile', 'instructor']:
            self.evidence = copy.deepcopy(original)
            next(c for c in self.evidence['clips'] if c['name'] == name)['pageErrorCount'] = 1
            self.assert_rejected()
        self.evidence = copy.deepcopy(original)
        self.evidence['localOrigin'] = 'https://medace-english-app.pages.dev'
        self.assert_rejected()

    def test_rejects_invalid_media_subtitles_and_learning_edit_evidence(self):
        original = copy.deepcopy(self.media)
        for stream, field, value in [(0, 'width', 1280), (0, 'r_frame_rate', '24/1'),
                                     (0, 'codec_name', 'vp9'), (1, 'codec_name', 'mp3'),
                                     (1, 'sample_rate', '44100')]:
            with self.subTest(field=field):
                self.media = copy.deepcopy(original)
                self.media['metadata']['streams'][stream][field] = value
                self.assert_rejected()
        self.media = copy.deepcopy(original)
        self.media['decodeExitCode'] = 1
        self.assert_rejected()
        self.media = copy.deepcopy(original)
        self.media['audioSummary'] = 'Summary:\n I: -25.0 LUFS\n Peak: -1.0 dBFS\n'
        self.assert_rejected()
        self.media['audioSummary'] = 'Summary:\n I: -16.0 LUFS\n Peak: 0.0 dBFS\n'
        self.assert_rejected()
        self.media = copy.deepcopy(original)
        self.media['metadata']['format']['duration'] = '81'
        self.assert_rejected()
        self.media = copy.deepcopy(original)
        self.subtitles = '1\n00:00:00,000 --> 00:01:21,000\n字幕\n'
        self.assert_rejected()
        self.subtitles = '1\n00:00:00,000 --> 00:00:02,000\n字幕\n'
        self.edits['sameActualLearningSession'] = False
        self.assert_rejected()


if __name__ == '__main__':
    unittest.main()
