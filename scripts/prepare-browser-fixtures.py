#!/usr/bin/env python3
"""Download isolated official P3 browser/baseline assets; stdlib only. Never shipped in extension."""
import hashlib
import io
import stat
import shutil
import subprocess
import json
import os
import pathlib
import sys
import urllib.request
import zipfile

BASE = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'extensao-dark-p3'
CHROME_VERSION = '156.0.8078.47'
CHROME_URL = f'https://storage.googleapis.com/chrome-for-testing-public/{CHROME_VERSION}/linux64/chrome-linux64.zip'
# SHA-256 registrado no CI da primeira execução e fixado na revisão seguinte.
CHROME_SHA256 = 'e6c94490f0b6b337225aeb2d2a5034858516b7017356980ba94f5176d8774a50'
DARKREADER = 'https://github.com/darkreader/darkreader/releases/download/v4.9.133/darkreader-chrome-mv3.zip'
DARKREADER_SHA256 = 'a5a1a9c78d377fafd8c9190ce9d57b96f89bc95d21f077888601e4c445b20ebf'


def download(url, max_bytes):
    if url not in (CHROME_URL, DARKREADER):
        raise ValueError('Download fora da lista oficial permitida')
    req = urllib.request.Request(url, headers={'User-Agent': 'Extensao-dark-CI/1.0'})
    with urllib.request.urlopen(req, timeout=50) as resp:
        content = resp.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise ValueError('Arquivo excede limite esperado')
    return content


def safe_extract(blob, target, *, max_files=16000, max_unpacked=1_500_000_000):
    """Reject paths, links, duplicates, encrypted archives and ZIP bombs."""
    target = pathlib.Path(target)
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        entries = archive.infolist()
        if len(entries) > max_files:
            raise ValueError('Excesso de entradas ZIP')
        total = 0
        seen = set()
        for entry in entries:
            name = entry.filename
            path = pathlib.PurePosixPath(name)
            if (not name or path.is_absolute() or '..' in path.parts or
                    '\\' in name or ':' in name or name.startswith('~')):
                raise ValueError('Caminho ZIP inseguro')
            normalized = str(path).rstrip('/')
            if normalized in seen:
                raise ValueError('Entrada ZIP duplicada')
            seen.add(normalized)
            mode = entry.external_attr >> 16
            if stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise ValueError('Tipo de arquivo ZIP não permitido')
            if entry.flag_bits & 1:
                raise ValueError('ZIP criptografado não permitido')
            total += entry.file_size
            if total > max_unpacked:
                raise ValueError('ZIP muito grande após descompressão')
        target.mkdir(parents=True, exist_ok=True)
        for entry in entries:
            dest = target.joinpath(*pathlib.PurePosixPath(entry.filename).parts)
            if entry.is_dir():
                dest.mkdir(parents=True, exist_ok=True)
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(entry) as source, open(dest, 'xb') as output:
                shutil.copyfileobj(source, output)
            executable = (entry.external_attr >> 16) & 0o111
            if executable:
                dest.chmod(dest.stat().st_mode | executable)


def main():
    chrome = download(CHROME_URL, 350_000_000)
    checksum = hashlib.sha256(chrome).hexdigest()
    if checksum != CHROME_SHA256:
        raise ValueError('Checksum SHA-256 do Chrome divergiu')
    print('SHA256 Chrome for Testing:', checksum)
    chrome_dir = BASE / 'chrome'
    safe_extract(chrome, chrome_dir)
    binary = chrome_dir / 'chrome-linux64' / 'chrome'
    if not binary.is_file():
        raise FileNotFoundError(binary)
    binary.chmod(binary.stat().st_mode | 0o111)
    actual = subprocess.check_output([str(binary), '--version'], text=True, timeout=20).strip()
    if CHROME_VERSION not in actual:
        raise ValueError('Versão do Chrome inesperada: ' + actual)

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
    print('Chrome for Testing:', CHROME_VERSION, '| Dark Reader: v4.9.133 SHA256 verificado')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Não foi possível preparar o navegador/baseline oficial: {error}', file=sys.stderr)
        raise
