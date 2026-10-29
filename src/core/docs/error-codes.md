# Pey Core Error Codes Catalog

## Host Source Errors

| Code | Description | Context |
|------|-------------|---------|
| `INVALID_HOST_SOURCE` | A Runtime Host source (configSource, envSource, or moduleLoader) is missing or malformed | PeyCore constructor |
| `CORE_ALREADY_STARTED` | `start()` called while the Core is already running | PeyCore.start() |

## Startup Errors

| Code | Description | Context |
|------|-------------|---------|
| `INVALID_MANIFEST` | Plugin manifest could not be read or is invalid JSON | Plugin startup step 1 |
| `INVALID_MANIFEST_STRUCTURE` | Manifest missing required fields, wrong types, or invalid name format | Plugin startup step 1b |
| `INCOMPATIBLE_ARCHITECTURE` | Plugin architecture version incompatible with Core | StartupValidator |
| `DUPLICATE_PLUGIN_NAME` | Another plugin with same name already registered | System Lifecycle (loadAllManifests) |
| `MISSING_REQUIRED_DEPENDENCY_DECLARATION` | Required dependency has no declared provider in any manifest | Two-Stage Validation (Stage 1) |
| `REQUIRED_DEPENDENCY_UNAVAILABLE` | Required dependency not prepared (removed before group commit) | Plugin Lifecycle (group commit) |
| `ADAPTER_TYPE_NOT_ALLOWED` | Non-infrastructure plugin declares adapterType | StartupValidator |
| `DUPLICATE_ADAPTER_TYPE` | Two infrastructure plugins declare same adapterType | StartupValidator (system fatal) |
| `ADAPTER_NOT_CONFIGURED` | Infrastructure plugin's adapterType not in bootstrap.json adapters | StartupValidator |
| `ENTRY_POINT_FAILED` | Plugin's prepare() or activate() threw or returned invalid value | Plugin Lifecycle |
| `SERVICE_REGISTRATION_FAILED` | Service registration failed (duplicate or undeclared) | StartupRegistry (group commit) |
| `INVALID_UI_MANIFEST` | UI manifest has forbidden fields (type, provides) | UIHandler |

## Configuration Errors

| Code | Description | Context |
|------|-------------|---------|
| `CONFIG_FILE_MISSING` | bootstrap.json not provided or not an object | ConfigLoader |
| `CONFIG_FILE_INVALID` | Required section missing from bootstrap.json | ConfigLoader |
| `INVALID_ENV_SOURCE` | envSource missing or no get() method | ConfigLoader |
| `ENV_VAR_MISSING` | `${VAR}` placeholder not found in envSource | EnvSubstitutor |
| `ENV_VAR_REQUIRED_MISSING` | Required env var (with required: true) not set | EnvSubstitutor |
| `INVALID_PLUGIN_CONFIG` | Project config for plugin is not an object | ConfigMerger |

## Event Bus Errors

| Code | Description | Context |
|------|-------------|---------|
| `INVALID_EVENT` | pluginEvent is null, not an object, or array | EventBus.publish |
| `INVALID_EVENT_TYPE` | event.type missing or empty string | EventBus.publish |
| `EVENT_NOT_DECLARED_IN_MANIFEST` | Event type not in manifest.events | EventBus.publish |

## Registry Errors

| Code | Description | Context |
|------|-------------|---------|
| `SERVICE_NOT_DECLARED_IN_DEPENDENCIES` | Plugin tried to access service not in dependencies | Registry.getForPlugin |
| `SERVICE_NOT_DECLARED_IN_MANIFEST` | Plugin tried to register service not in provides | Registry.register |
| `DUPLICATE_SERVICE` | Service name already registered | Registry.register |

## Runtime Errors

| Code | Description | Context |
|------|-------------|---------|
| `PLUGIN_CRASHED` | Plugin reported critical error via reportCriticalError | PluginLifecycle.reportCriticalError |
| `UI_STARTUP_FAILED` | UI entry point threw during startup | UIHandler.startUI |

## Error Structure

All errors follow the PeyError structure:

```javascript
{
  code: "ERROR_CODE",
  message: "Human-readable description",
  source: "plugin.name",
  type: "startup" | "operational" | "critical",
  timestamp: "2024-01-01T00:00:00.000Z",
  detail: { /* optional, no sensitive data */ }
}
```

## Error Types

| Type | When | Handled By |
|------|------|------------|
| `startup` | During plugin loading | Core |
| `operational` | During normal operation | Plugin itself |
| `critical` | Plugin completely disabled | Core (via reportCriticalError) |

## Security Notes

- Error messages are for humans, codes are for systems
- No sensitive data in any error field (not even `detail`)
- Raw Error objects never leave local error-handling path
- Security events logged separately in Core internal log