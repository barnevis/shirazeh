// ManifestStructureValidator — validates the structural integrity of a plugin manifest.
// Checks that all required fields are present with correct types, and that the
// plugin name follows the vendor.name naming convention. Runs after the manifest
// is loaded (Step 1) and before startup validation (Step 2).

/**
 * Required top-level fields in every plugin manifest.
 *
 * @private
 */
const REQUIRED_FIELDS = [
  'name',
  'version',
  'architecture',
  'description',
  'type',
  'dependencies',
  'provides',
  'events',
];

/**
 * Allowed values for the `type` field.
 *
 * @private
 */
const ALLOWED_TYPES = ['infrastructure', 'platform', 'product', 'feature', 'transport'];

/**
 * Regex that matches the vendor.name naming convention.
 * Both segments must be non-empty and consist of lowercase letters,
 * digits, or hyphens.
 *
 * @private
 */
const NAME_PATTERN = /^[a-z0-9-]+\.[a-z0-9-]+$/;

/**
 * Validates the structural integrity of a plugin manifest.
 *
 * Checks that:
 * 1. The manifest is a non-null object.
 * 2. All required fields are present (`name`, `version`, `architecture`,
 *    `description`, `type`, `dependencies`, `provides`, `events`).
 * 3. Each field has the correct type (string, object, or array).
 * 4. The `name` field follows the `vendor.name` naming convention.
 *
 * This function does NOT check business rules (architecture version
 * compatibility, dependency availability, adapterType rules). Those are
 * handled by the StartupValidator in Step 2.
 *
 * @param {object} manifest - The parsed manifest to validate.
 * @returns {{valid: boolean, errors?: string[]}}
 *   - `valid: true` if the manifest structure is correct.
 *   - `valid: false, errors` with a list of structural problems.
 */
export function validateManifestStructure(manifest) {
  const errors = [];

  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['INVALID_MANIFEST_STRUCTURE: manifest is not an object'] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in manifest)) {
      errors.push(`INVALID_MANIFEST_STRUCTURE: missing required field "${field}"`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    errors.push('INVALID_MANIFEST_STRUCTURE: "name" must be a non-empty string');
  } else if (!NAME_PATTERN.test(manifest.name)) {
    errors.push(`INVALID_MANIFEST_STRUCTURE: "name" must be in vendor.name format, got "${manifest.name}"`);
  }

  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    errors.push('INVALID_MANIFEST_STRUCTURE: "version" must be a non-empty string');
  }

  if (typeof manifest.architecture !== 'string' || manifest.architecture.length === 0) {
    errors.push('INVALID_MANIFEST_STRUCTURE: "architecture" must be a non-empty string');
  }

  if (typeof manifest.description !== 'string') {
    errors.push('INVALID_MANIFEST_STRUCTURE: "description" must be a string');
  }

  if (typeof manifest.type !== 'string' || manifest.type.length === 0) {
    errors.push('INVALID_MANIFEST_STRUCTURE: "type" must be a non-empty string');
  } else if (!ALLOWED_TYPES.includes(manifest.type)) {
    errors.push(`INVALID_MANIFEST_STRUCTURE: "type" must be one of ${ALLOWED_TYPES.join(', ')}, got "${manifest.type}"`);
  }

  if (manifest.dependencies === null || typeof manifest.dependencies !== 'object' || Array.isArray(manifest.dependencies)) {
    errors.push('INVALID_MANIFEST_STRUCTURE: "dependencies" must be an object');
  }

  if (!Array.isArray(manifest.provides)) {
    errors.push('INVALID_MANIFEST_STRUCTURE: "provides" must be an array');
  }

  if (!Array.isArray(manifest.events)) {
    errors.push('INVALID_MANIFEST_STRUCTURE: "events" must be an array');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
