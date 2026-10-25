// Tests for ManifestStructureValidator — verifies required fields, types, and name format.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifestStructure } from '../src/manifest-structure-validator.js';

function createValidManifest(overrides = {}) {
  return {
    name: 'acme.test',
    version: '1.0.0',
    architecture: '0.9',
    description: 'test plugin',
    type: 'product',
    dependencies: { required: [], optional: [] },
    provides: [],
    events: [],
    config: {},
    ...overrides,
  };
}

test('validateManifestStructure — valid manifest returns valid: true', () => {
  const manifest = createValidManifest();
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, true);
  assert.equal(result.errors, undefined);
});

test('validateManifestStructure — null manifest returns invalid', () => {
  const result = validateManifestStructure(null);
  assert.equal(result.valid, false);
  assert.ok(result.errors[0].includes('not an object'));
});

test('validateManifestStructure — array manifest returns invalid', () => {
  const result = validateManifestStructure([]);
  assert.equal(result.valid, false);
  assert.ok(result.errors[0].includes('not an object'));
});

test('validateManifestStructure — missing required field "name"', () => {
  const manifest = createValidManifest();
  delete manifest.name;
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('missing required field "name"')));
});

test('validateManifestStructure — missing required field "version"', () => {
  const manifest = createValidManifest();
  delete manifest.version;
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('missing required field "version"')));
});

test('validateManifestStructure — missing required field "architecture"', () => {
  const manifest = createValidManifest();
  delete manifest.architecture;
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('missing required field "architecture"')));
});

test('validateManifestStructure — missing required field "description"', () => {
  const manifest = createValidManifest();
  delete manifest.description;
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('missing required field "description"')));
});

test('validateManifestStructure — missing required field "type"', () => {
  const manifest = createValidManifest();
  delete manifest.type;
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('missing required field "type"')));
});

test('validateManifestStructure — missing required field "dependencies"', () => {
  const manifest = createValidManifest();
  delete manifest.dependencies;
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('missing required field "dependencies"')));
});

test('validateManifestStructure — missing required field "provides"', () => {
  const manifest = createValidManifest();
  delete manifest.provides;
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('missing required field "provides"')));
});

test('validateManifestStructure — missing required field "events"', () => {
  const manifest = createValidManifest();
  delete manifest.events;
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('missing required field "events"')));
});

test('validateManifestStructure — name without dot is invalid', () => {
  const manifest = createValidManifest({ name: 'invalidname' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('vendor.name format')));
});

test('validateManifestStructure — name with empty vendor is invalid', () => {
  const manifest = createValidManifest({ name: '.test' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('vendor.name format')));
});

test('validateManifestStructure — name with empty name segment is invalid', () => {
  const manifest = createValidManifest({ name: 'acme.' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('vendor.name format')));
});

test('validateManifestStructure — name with uppercase is invalid', () => {
  const manifest = createValidManifest({ name: 'Acme.Test' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('vendor.name format')));
});

test('validateManifestStructure — name with hyphens is valid', () => {
  const manifest = createValidManifest({ name: 'acme.my-plugin' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, true);
});

test('validateManifestStructure — name with numbers is valid', () => {
  const manifest = createValidManifest({ name: 'acme.storage2' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, true);
});

test('validateManifestStructure — empty name string is invalid', () => {
  const manifest = createValidManifest({ name: '' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('"name" must be a non-empty string')));
});

test('validateManifestStructure — empty version string is invalid', () => {
  const manifest = createValidManifest({ version: '' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('"version" must be a non-empty string')));
});

test('validateManifestStructure — empty architecture string is invalid', () => {
  const manifest = createValidManifest({ architecture: '' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('"architecture" must be a non-empty string')));
});

test('validateManifestStructure — empty type string is invalid', () => {
  const manifest = createValidManifest({ type: '' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('"type" must be a non-empty string')));
});

test('validateManifestStructure — dependencies as array is invalid', () => {
  const manifest = createValidManifest({ dependencies: [] });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('"dependencies" must be an object')));
});

test('validateManifestStructure — dependencies as null is invalid', () => {
  const manifest = createValidManifest({ dependencies: null });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('"dependencies" must be an object')));
});

test('validateManifestStructure — provides as object is invalid', () => {
  const manifest = createValidManifest({ provides: {} });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('"provides" must be an array')));
});

test('validateManifestStructure — events as object is invalid', () => {
  const manifest = createValidManifest({ events: {} });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('"events" must be an array')));
});

test('validateManifestStructure — description as number is invalid', () => {
  const manifest = createValidManifest({ description: 123 });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('"description" must be a string')));
});

test('validateManifestStructure — multiple missing fields reported together', () => {
  const manifest = { name: 'acme.test' };
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  const missingFields = result.errors.filter((e) => e.includes('missing required field'));
  assert.equal(missingFields.length, 7);
});

test('validateManifestStructure — type "infrastructure" is valid', () => {
  const manifest = createValidManifest({ type: 'infrastructure' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, true);
});

test('validateManifestStructure — type "platform" is valid', () => {
  const manifest = createValidManifest({ type: 'platform' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, true);
});

test('validateManifestStructure — type "product" is valid', () => {
  const manifest = createValidManifest({ type: 'product' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, true);
});

test('validateManifestStructure — type "feature" is valid', () => {
  const manifest = createValidManifest({ type: 'feature' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, true);
});

test('validateManifestStructure — type "transport" is valid', () => {
  const manifest = createValidManifest({ type: 'transport' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, true);
});

test('validateManifestStructure — type with invalid value is rejected', () => {
  const manifest = createValidManifest({ type: 'database' });
  const result = validateManifestStructure(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('"type" must be one of')));
});
