"""Restore a verified backup into a NEW isolated Compose project only."""
import os
import argparse, pathlib, subprocess, sys
parser=argparse.ArgumentParser()
parser.add_argument('--backup',required=True)
parser.add_argument('--project',required=True,help='New project name starting with signeo-restore-')
parser.add_argument('--env-file',required=True,help='Private configuration for the restore environment')
args=parser.parse_args()
os.environ["API_ENV_FILE"]=str(pathlib.Path(args.env_file).resolve())
if not args.project.startswith('signeo-restore-') or not all(c.islower() or c.isdigit() or c=='-' for c in args.project):
 raise SystemExit('Use a new project named signeo-restore-<suffix>.')
root=pathlib.Path(args.backup).resolve()
subprocess.run([sys.executable,str(pathlib.Path(__file__).with_name('verify-backup.py')),str(root)],check=True)
# An existing project/volume is never overwritten, even when its containers are stopped.
for resource in ['container','volume']:
 result=subprocess.run(['docker',resource,'ls']+(['-a'] if resource=='container' else [])+['-q','--filter','label=com.docker.compose.project='+args.project],check=True,capture_output=True,text=True)
 if result.stdout.strip():raise SystemExit('Restore refused: the target project already has '+resource+' resources.')
base=['docker','compose','--env-file',args.env_file,'--project-name',args.project,'-f','compose.production.yml']
def run(*command,**kwargs):return subprocess.run(base+list(command),check=True,**kwargs)
run('up','-d','--wait','postgres','redis')
with (root/'database.dump').open('rb') as stream:
 run('exec','-T','postgres','sh','-c','exec pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"',stdin=stream)
with (root/'documents.tar.gz').open('rb') as stream:
 run('run','--rm','--no-deps','-T','--entrypoint','tar','api','-C','/data','-xzf','-',stdin=stream)
run('run','--rm','--no-deps','-T','api','npm','run','migration:run','--workspace','api')
print('Restored into isolated project:',args.project)
print('API/web remain stopped. Validate data and configure distinct ports before starting them. No traffic has been switched.')
