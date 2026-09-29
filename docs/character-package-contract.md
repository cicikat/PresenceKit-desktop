# Character package contract v1 (CA-01)

Status: **contract parser implemented; runtime import and rendering planned**. A `.ptchar`
will be a ZIP containing the same tree accepted in directory mode. Neither form is
currently listed by the Room/Pet asset selector. Existing single-file GLB remains the
current supported input. `src/shared/character/manifest.ts` is the shared pure validator
for directory and ZIP entry lists; CA-07 will connect safe filesystem adapters.

## Standards decision

Use VRM 1.0 humanoid role names and coordinate conventions as the semantic reference,
and MToon 1.0 parameter names where the visual behavior matches. Use VRMA 1.0 as the
first external motion format after the runtime can retarget it. Do not require a
generic GLB to be VRM. Three.js remains the renderer. The current package has `three`
but no VRM-specific loader dependency; importing the full VRM stack is a CA-03/05/06
implementation decision after measurements. MToon outlines and some VRMA semantics
need explicit client implementation and are **planned**.

References: [VRM 1.0](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/README.md),
[MToon 1.0](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_materials_mtoon-1.0/README.md),
[VRM Animation 1.0](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/README.md).

## Manifest

Required fields: `schemaVersion`, `assetId`, `revision`, `provenance`,
`minimumRuntime`, `capabilities`, and `model`. `schemaVersion` and `minimumRuntime`
are three-component decimal versions. This parser understands major version 1 and
the target contract minimum 1.0.0; that is **not** a declaration that the application
already imports character packages. `assetId` is a stable lower-case identifier, not
a file name or backend character ID. `revision` is a lower-case 64-digit SHA-256 hex
digest of the package payload. `model.sha256` is the content digest of the GLB. CA-07
will verify actual bytes before install; this pure parser validates only shape and
references. Any model hash change invalidates local node calibration.

`provenance.author` and `provenance.license` are required nonempty strings; `source`
is optional. Asset authors must have rights to distribute every packaged file.
`capabilities` may declare `humanoid`, `expressions`, `lookAt`, `motions`, `toon`;
unknown capability names produce warnings and give no permission or functionality.
Unknown optional fields are ignored. Unknown `requiredExtensions` cause rejection.
Resources are relative package paths. The parser rejects absolute paths, traversal,
backslashes, hidden components, duplicate names ignoring case, and missing declared
files. Directory and ZIP adapters must also reject symlinks, escaped real paths,
oversized entries and digest mismatch before runtime import.

Valid shape example (placeholder digests are valid syntax only):

```json
{
  "schemaVersion": "1.0.0",
  "assetId": "sample.actor",
  "revision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "provenance": { "author": "Example", "license": "CC0-1.0" },
  "minimumRuntime": "1.0.0",
  "capabilities": ["humanoid", "expressions", "lookAt", "motions", "toon"],
  "model": { "uri": "model.glb", "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  "resources": {
    "materials": "materials/materials.json",
    "rig": "rig/humanoid.json",
    "calibration": "rig/calibration.json",
    "expressions": "expressions/expressions.json",
    "motions": "motions/motions.json"
  }
}
```

Invalid examples: `schemaVersion: "2.0.0"`, `model.uri: "../other.glb"`,
`requiredExtensions: ["arbitrary.shader"]`, or a declared file absent from the
entry list. The first pair cannot be migrated silently; unknown required behavior
must fail closed. A future 1.x optional field may be ignored by an older 1.x parser.

## Ownership and migration

Effective order: client defaults → package defaults → local asset override → ephemeral
performance command. A command never persists. Reset removes only the local override.
Local overrides are keyed by `assetId` plus model digest; `revision` identifies the
package payload. A changed digest keeps the previous override as recoverable data but
marks node/morph/material bindings stale until reviewed. Two packages with the same
`assetId` and different revision require an explicit replacement decision; an import
must never silently replace a working version. Rollback selects the prior package
revision and matching local override, if one exists.

Existing `RoomSettings.perCharacter` and `perPlacement` remain readable by their GLB
filename for legacy assets. A future legacy adapter should derive an ephemeral asset
identity from the GLB hash while continuing those filename-keyed settings; migration
to a package requires an explicit asset selection and must keep the old setting blob
for rollback. `character.json` is **unsupported today** and will not become a second
runtime truth. Its documented `boneMap`/physics/idle values require manual transfer to
the package resources or existing RoomSettings. Existing files are left untouched.

No package field grants code execution, arbitrary shader source, remote downloads,
network access, or permissions. Only user-selected local package data may be imported.

## Field consumers

| Field | Current/target consumer |
| --- | --- |
| Manifest identity, version, digests, provenance | CA-01 validator current; CA-07 importer and diagnostics planned |
| `model.uri` | CA-07 local asset loader planned; existing GLB loader remains current |
| `resources.rig` / `calibration` | CA-03 mapping and pose calibration planned |
| `resources.expressions` | CA-04 semantic expression and gaze mapping planned |
| `resources.motions` | CA-05 action library and retargeting planned |
| `resources.materials` | CA-06 Toon material binding planned |

The resource file formats are frozen in their respective implementation orders. A
producer must not set a capability or ship a resource file as a promise of effect until
that consumer is implemented and validated. A package with optional unsupported
capabilities may degrade; a package requiring an unsupported extension is rejected.
