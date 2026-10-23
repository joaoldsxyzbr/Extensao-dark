#!/usr/bin/env python3
"""Download isolated official P3 browser/baseline assets; stdlib only. Never shipped in extension."""
import hashlib
import io
import json
import os
import pathlib
import sys
import urllib.request
import zipfile

BASE = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'extensao-dark-p3'
BASE.mkdir(parents=True, exist_ok=True)
CFT = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'
DARKREADER = 'https://github.com/darkreader/darkreader/releases/download/v4.9.133/darkreader-chrome-mv3.zip'
DARKREADER_SHA256 = 'a5a1a9c78d377fafd8c9190ce9d57b96f89bc95d21f077888601e4c445b20ebf'


def download(url, max_bytes):
    assert url.startswith(('https://googlechromelabs.github.io/', 'https://storage.googleapis.com/chrome-for-testing-public/', 'https://github.com/darkreader/darkreader/releases/download/'))
    req = urllib.request.Request(url, headers={'User-Agent': 'Extensao-dark-CI/1.0'})
    with urllib.request.urlopen(req, timeout=50) as resp:
        content = resp.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise ValueError('Arquivo excede limite esperado')
    return content


def safe_extract(blob, target):
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        for entry in archive.infolist():
            path = pathlib.PurePosixPath(entry.filename)
            if path.is_absolute() or '..' in path.parts:
                raise ValueError('Caminho ZIP inseguro')
        archive.extractall(target)


def main():
    manifest = json.loads(download(CFT, 100_000))
    stable = manifest['channels']['Stable']
    platforms = [e for e in stable['downloads']['chrome'] if e['platform'] == 'linux64']
    if len(platforms) != 1:
        raise ValueError('Chrome for Testing linux64 não encontrado')
    chrome = download(platforms[0]['url'], 350_000_000)
    chrome_dir = BASE / 'chrome'
    safe_extract(chrome, chrome_dir)
    binary = chrome_dir / 'chrome-linux64' / 'chrome'
    if not binary.is_file():
        raise FileNotFoundError(binary)
    binary.chmod(binary.stat().st_mode | 0o111)

    darkreader = download(DARKREADER, 20_000_000)
    digest = hashlib.sha256(darkreader).hexdigest()
    if digest != DARKREADER_SHA256:
        raise ValueError(f'Dark Reader digest inválido: {digest}')
    baseline_dir = BASE / 'dark-reader'
    safe_extract(darkreader, baseline_dir)
    matches = list(baseline_dir.rglob('manifest.json'))
    if len(matches) != 1:
        raise ValueError('Manifesto da extensão de comparação não identificado')
    baseline = matches[0].parent
    baseline_name = json.loads(matches[0].read_text(encoding='utf8')).get('name', '')
    if 'dark reader' not in baseline_name.lower() and not baseline_name.startswith('__MSG_'):
        raise ValueError(f'Extensão de comparação inesperada: {baseline_name}')

    env_file = os.environ.get('GITHUB_ENV')
    if env_file:
        with open(env_file, 'a', encoding='utf8') as env:
            env.write(f'CHROME_BIN={binary}\nDARK_READER_TEST_PATH={baseline}\n')
    else:
        print(f'CHROME_BIN={binary}')
        print(f'DARK_READER_TEST_PATH={baseline}')
    print('Chrome for Testing:', stable['version'], '| Dark Reader: v4.9.133 SHA256 verificado')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Não foi possível preparar o navegador/baseline oficial: {error}', file=sys.stderr)
        raise
