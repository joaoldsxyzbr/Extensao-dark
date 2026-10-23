"""Testa extração de pacotes externos sem bibliotecas adicionais."""
import importlib.util
import io
from pathlib import Path
import stat
import tempfile
import unittest
import warnings
import zipfile

spec=importlib.util.spec_from_file_location('assets',Path(__file__).resolve().parents[1]/'scripts'/'prepare-browser-fixtures.py')
assets=importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)

def zip_bytes(files):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for name,data in files:
            z.writestr(name,data)
    return out.getvalue()

class ArchiveSecurityTest(unittest.TestCase):
    def test_safe_file(self):
        with tempfile.TemporaryDirectory() as temp:
            assets.safe_extract(zip_bytes([('root/ok.txt','ok')]),Path(temp)/'dest')
            self.assertEqual((Path(temp)/'dest/root/ok.txt').read_text(),'ok')

    def test_unsafe_paths_rejected(self):
        for name in ('../bad','/tmp/bad','root/../../bad','root\\bad','C:/bad'):
            with self.subTest(name=name),tempfile.TemporaryDirectory() as temp,self.assertRaises(ValueError):
                assets.safe_extract(zip_bytes([(name,'evil')]),Path(temp)/'dest')

    def test_duplicates_rejected(self):
        with warnings.catch_warnings():
            warnings.simplefilter('ignore',UserWarning)
            payload=zip_bytes([('same','a'),('same','b')])
        with tempfile.TemporaryDirectory() as temp,self.assertRaises(ValueError):
            assets.safe_extract(payload,Path(temp)/'dest')

    def test_size_limits(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                assets.safe_extract(zip_bytes([('big','x'*200)]),Path(temp)/'one',max_unpacked=30)
            with self.assertRaises(ValueError):
                assets.safe_extract(zip_bytes([('a','x'),('b','y')]),Path(temp)/'two',max_files=1)

    def test_symlink_rejected(self):
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:
            entry=zipfile.ZipInfo('link')
            entry.create_system=3
            entry.external_attr=(stat.S_IFLNK|0o777)<<16
            z.writestr(entry,'target')
        with tempfile.TemporaryDirectory() as temp,self.assertRaises(ValueError):
            assets.safe_extract(out.getvalue(),Path(temp)/'dest')

    def test_versions_frozen(self):
        self.assertEqual(assets.CHROME_VERSION,'156.0.8078.47')
        self.assertIn('/156.0.8078.47/linux64/chrome-linux64.zip',assets.CHROME_URL)
        self.assertIn('/v4.9.133/',assets.DARKREADER)
        self.assertEqual(len(assets.DARKREADER_SHA256),64)
        self.assertEqual(assets.CHROME_SHA256,'e6c94490f0b6b337225aeb2d2a5034858516b7017356980ba94f5176d8774a50')
