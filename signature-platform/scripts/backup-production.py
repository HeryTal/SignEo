"""Quiesced backup of the production Compose stack. Never prints credentials."""
import os
import argparse, datetime, hashlib, json, pathlib, subprocess
parser=argparse.ArgumentParser()
parser.add_argument('--destination',required=True)
parser.add_argument('--env-file',default='.env.production')
args=parser.parse_args()
os.environ["API_ENV_FILE"]=str(pathlib.Path(args.env_file).resolve())
target=pathlib.Path(args.destination).resolve()/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
target.mkdir(parents=True,exist_ok=False)
base=['docker','compose','--env-file',args.env_file,'-f','compose.production.yml']
def run(*command,**kwargs):return subprocess.run(base+list(command),check=True,**kwargs)
# Stop writers first so database and files represent one consistent checkpoint.
run('stop','web','api')
try:
 with (target/'database.dump').open('xb') as output:
  run('exec','-T','postgres','sh','-c','exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc',stdout=output)
 with (target/'documents.tar.gz').open('xb') as output:
  run('run','--rm','--no-deps','-T','--entrypoint','tar','api','-C','/data','-czf','-','uploads',stdout=output)
 manifest={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':{}}
 for name in ['database.dump','documents.tar.gz']:
  with (target/name).open('rb') as data: manifest['files'][name]={'sha256':hashlib.file_digest(data,'sha256').hexdigest(),'bytes':(target/name).stat().st_size}
 (target/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
 print('Backup created:',target)
finally:
 run('start','api','web')
