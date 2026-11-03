export function validateCommit(commit) {
  if (commit?.length !== 40 || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full lowercase commit SHA is required.');
  return commit;
}

export function validateDigest(digest) {
  if (digest?.length !== 71 || !/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('An immutable sha256 image digest is required.');
  return digest;
}

export function promotionPolicy(tag) {
  const match = /^(staging|production)-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag ?? '');
  if (!match || match[0] !== tag) throw new Error('Promotion tags must be staging-vX.Y.Z or production-vX.Y.Z.');
  return {
    ring: match[1],
    version: match[2],
    requiredStagingTag: match[1] === 'production' ? `staging-v${match[2]}` : null,
  };
}

export function validateDeploymentRef(ring, ref) {
  if (!['test', 'staging', 'production'].includes(ring)) throw new Error('Unknown deployment ring.');
  if (ref === 'refs/heads/main') return;
  if (ref?.startsWith('refs/tags/') && promotionPolicy(ref.slice(10)).ring === ring) return;
  throw new Error('Deployments require main or a matching protected promotion tag.');
}
