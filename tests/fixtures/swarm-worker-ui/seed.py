#!/usr/bin/env python3
"""Seed only the disposable local fixture through Dokploy's HTTP APIs."""
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.parse
import urllib.request

os.umask(0o077)
os.chdir(Path(__file__).resolve().parent)
state = Path('.state')
base = 'http://127.0.0.1:17777'
jar = http.cookiejar.MozillaCookieJar(str(state / 'cookies.txt'))
if Path(jar.filename).exists():
    jar.load(ignore_discard=True, ignore_expires=True)
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request(path, data=None):
    body = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(base + path, data=body, headers={
        'Content-Type': 'application/json', 'Origin': base,
    })
    try:
        with opener.open(req, timeout=90) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'{path}: {error.code} {error.read().decode()}') from error
    jar.save(ignore_discard=True, ignore_expires=True)
    return result


def rpc(method, data=None, mutation=False):
    if mutation:
        result = request('/api/trpc/' + method, {'json': data or {}})
    else:
        query = urllib.parse.urlencode({'input': json.dumps({'json': data or {}})})
        result = request('/api/trpc/' + method + '?' + query)
    return result['result']['data'].get('json')


def docker(*args):
    return subprocess.check_output(['docker', 'compose', 'exec', '-T', 'manager', 'docker', *args], text=True).strip()


credentials_path = state / 'owner.json'
if not credentials_path.exists():
    credentials_path.write_text(json.dumps({
        'email': 'owner@swarm-worker-ui.test', 'password': secrets.token_urlsafe(24),
        'name': 'Swarm Worker Lab Owner',
    }))
credentials = json.loads(credentials_path.read_text())
ids_path = state / 'seed.json'
ids = json.loads(ids_path.read_text()) if ids_path.exists() else {}


def save():
    ids_path.write_text(json.dumps(ids, indent=2))


if not ids.get('userId'):
    result = request('/api/auth/sign-up/email', credentials)
    ids['userId'] = result['user']['id']
    save()
request('/api/auth/sign-in/email', {
    'email': credentials['email'], 'password': credentials['password'],
})
session = request('/api/auth/get-session')
ids['organizationId'] = session['session']['activeOrganizationId']
save()
if not ids.get('sshKeyId'):
    rpc('sshKey.create', {
        'name': 'Local Swarm fixture', 'description': 'Disposable local DinD workers',
        'privateKey': (state / 'id_ed25519').read_text(),
        'publicKey': (state / 'id_ed25519.pub').read_text(),
        'organizationId': ids['organizationId'],
    }, True)
    keys = rpc('sshKey.all')
    ids['sshKeyId'] = next(key['sshKeyId'] for key in keys if key['name'] == 'Local Swarm fixture')
    save()
for worker in ('worker-a', 'worker-b'):
    if worker not in ids:
        node = json.loads(docker('node', 'inspect', worker))[0]
        server = rpc('server.create', {
            'name': worker, 'description': 'Already joined local Swarm worker; do not run setup',
            'ipAddress': node['Status']['Addr'], 'port': 22, 'username': 'root',
            'sshKeyId': ids['sshKeyId'], 'serverType': 'deploy', 'enableDockerCleanup': False,
        }, True)
        ids[worker] = {'serverId': server['serverId'], 'nodeId': node['ID']}
        save()
if not ids.get('projectId'):
    project = rpc('project.create', {
        'name': 'Swarm Worker UI Lab', 'description': 'Local two-worker integration fixture',
    }, True)
    ids['projectId'] = project['project']['projectId']
    ids['environmentId'] = project['environment']['environmentId']
    save()
if not ids.get('composeId'):
    compose = rpc('compose.create', {
        'name': 'Two worker replicas', 'description': 'Existing worker-ui-fixture Swarm service',
        'appName': 'worker-ui-fixture', 'environmentId': ids['environmentId'],
        'composeType': 'stack', 'sourceType': 'raw',
        'composeFile': 'services:\n  fixture:\n    image: alpine:3.21\n    deploy:\n      replicas: 2\n      placement:\n        constraints: [node.role == worker]\n        max_replicas_per_node: 1\n',
    }, True)
    ids['composeId'] = compose['composeId']
    ids['appName'] = compose['appName']
    save()
docker('service', 'update', '--detach', '--label-add',
       'com.docker.stack.namespace=' + ids['appName'], 'worker-ui-fixture')
mapping = {ids[worker]['nodeId']: ids[worker]['serverId'] for worker in ('worker-a', 'worker-b')}
env_path = state / 'runtime.env'
lines = [line for line in env_path.read_text().splitlines() if not line.startswith('DOKPLOY_SWARM_NODE_SERVERS=')]
lines.append('DOKPLOY_SWARM_NODE_SERVERS=' + json.dumps(mapping, separators=(',', ':')))
env_path.write_text('\n'.join(lines) + '\n')
print(json.dumps(ids, indent=2))
