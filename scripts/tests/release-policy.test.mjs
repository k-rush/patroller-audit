import assert from 'node:assert/strict';
import test from 'node:test';
import { promotionPolicy, validateCommit, validateDeploymentRef, validateDigest } from '../release-policy.mjs';

test('production promotion requires the matching staging version', () => {
  assert.deepEqual(promotionPolicy('production-v1.2.3'), {
    ring: 'production', version: '1.2.3', requiredStagingTag: 'staging-v1.2.3',
  });
  assert.equal(promotionPolicy('staging-v0.1.0').requiredStagingTag, null);
});

test('promotion rejects malformed, prerelease, and ambiguous version tags', () => {
  for (const tag of ['test-v1.2.3', 'production-v01.2.3', 'staging-v1.2', 'production-v1.2.3-rc1', 'staging-v1.2.3\n']) {
    assert.throws(() => promotionPolicy(tag));
  }
});

test('release inputs reject abbreviated commits and mutable image references', () => {
  assert.throws(() => validateCommit('abc123'));
  assert.throws(() => validateDigest('patroller-audit:latest'));
  assert.throws(() => validateDigest(`sha256:${'A'.repeat(64)}`));
});

test('deployment refs reject pull requests and mismatched ring tags', () => {
  validateDeploymentRef('test', 'refs/heads/main');
  validateDeploymentRef('production', 'refs/tags/production-v1.2.3');
  assert.throws(() => validateDeploymentRef('test', 'refs/pull/4/merge'));
  assert.throws(() => validateDeploymentRef('production', 'refs/tags/staging-v1.2.3'));
});
