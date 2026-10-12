"""Verify backup integrity before copying or restoring. Does not extract anything."""
import argparse,hashlib,json,pathlib,tarfile
parser=argparse.ArgumentParser();parser.add_argument('directory');args=parser.parse_args()
root=pathlib.Path(args.directory).resolve()
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
if set(manifest['files'])!={'database.dump','documents.tar.gz'}:raise SystemExit('Unexpected backup manifest')
for name,expected in manifest['files'].items():
 with (root/name).open('rb') as stream:
  if hashlib.file_digest(stream,'sha256').hexdigest()!=expected['sha256']:raise SystemExit('Checksum mismatch: '+name)
 if (root/name).stat().st_size!=expected['bytes']:raise SystemExit('Size mismatch: '+name)
with (root/'database.dump').open('rb') as stream:
 if stream.read(5)!=b'PGDMP':raise SystemExit('Invalid PostgreSQL archive')
with tarfile.open(root/'documents.tar.gz','r:gz') as archive:
 for member in archive:
  path=pathlib.PurePosixPath(member.name)
  if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0]!='uploads' or not (member.isfile() or member.isdir()):raise SystemExit('Unsafe archive entry')
print('Backup integrity and archive paths verified.')
