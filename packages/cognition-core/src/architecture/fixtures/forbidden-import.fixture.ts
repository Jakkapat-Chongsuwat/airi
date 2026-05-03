// NOTICE:
// This fixture intentionally references a forbidden provider-like import path.
// The architecture harness scans raw imports to prove the guard works.
// The module path is present only so the file scanner can flag it.
// Removal condition: delete this fixture if the architecture suite is replaced.
import '@xsai/core'

export const forbiddenImportFixtureLabel = 'forbidden-import-fixture'
