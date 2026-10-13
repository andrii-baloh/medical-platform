const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (ok, message) => { if (!ok) throw new Error(message); };
const parseYaml = (rel) => {
  const value = yaml.load(read(rel));
  must(value && typeof value === 'object', `${rel}: expected YAML object`);
  return value;
};
const parseJson = (rel, transform = (x) => x) => JSON.parse(transform(read(rel)));

const compose = parseYaml('docker-compose.yml');
const override = parseYaml('docker-compose.override.yml');
parseYaml('infra/docker-compose.dev.yml');
parseYaml('infra/livekit/config.yaml');
parseJson('infra/keycloak/realm-export.json');
parseJson('infra/minio/app-policy.template.json', (text) => text.replaceAll('__BUCKET__', 'medical-documents'));

for (const name of ['postgres', 'keycloak', 'minio', 'minio-init', 'clamav', 'livekit']) {
  must(compose.services?.[name], `docker-compose.yml: missing service ${name}`);
}
for (const name of ['api', 'web']) must(override.services?.[name], `docker-compose.override.yml: missing service ${name}`);

const apiDeps = override.services.api.depends_on || {};
must(apiDeps.postgres?.condition === 'service_healthy', 'api must wait for healthy postgres');
must(apiDeps.keycloak?.condition === 'service_healthy', 'api must wait for healthy keycloak');
must(apiDeps['minio-init']?.condition === 'service_completed_successfully', 'api must wait for minio-init');
must(apiDeps.clamav?.condition === 'service_healthy', 'api must wait for healthy clamav');
must(apiDeps.livekit?.condition === 'service_healthy', 'api must wait for healthy livekit');
must(override.services.web.depends_on?.api?.condition === 'service_healthy', 'web must wait for ready api');

function checkRelativeBinds(doc, composeRel) {
  const base = path.dirname(path.join(root, composeRel));
  for (const [serviceName, service] of Object.entries(doc.services || {})) {
    for (const volume of service.volumes || []) {
      const source = typeof volume === 'string' ? volume.split(':')[0] : volume?.source;
      if (!source || (!source.startsWith('.') && !source.startsWith('..'))) continue;
      const resolved = path.resolve(base, source);
      must(fs.existsSync(resolved), `${composeRel}: ${serviceName} bind source missing: ${source}`);
    }
  }
  for (const [configName, config] of Object.entries(doc.configs || {})) {
    if (!config?.file) continue;
    const resolved = path.resolve(base, config.file);
    must(fs.existsSync(resolved), `${composeRel}: config ${configName} file missing: ${config.file}`);
  }
}

checkRelativeBinds(compose, 'docker-compose.yml');
checkRelativeBinds(override, 'docker-compose.override.yml');

for (const rel of [
  'apps/api/Dockerfile',
  'apps/web/Dockerfile',
  'infra/web/next.config.mjs',
  'scripts/dev-up.ps1',
  'scripts/dev-down.ps1',
  'scripts/check.ps1',
  'scripts/dev-up.sh',
  'scripts/check.sh',
]) must(fs.existsSync(path.join(root, rel)), `missing ${rel}`);

console.log('INFRA_CHECK=PASS');
