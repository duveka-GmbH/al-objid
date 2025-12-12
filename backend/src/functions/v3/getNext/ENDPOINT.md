# Get Next

Retrieves the next available object ID for a given type within specified ranges. Optionally commits the ID to mark it as consumed.

---

## Get Next Available ID

Finds the next available object ID and optionally commits it.

- Method: `POST`
- Route: `v3/getNext/{appId}`

### Route Parameters
| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| appId     | string | Yes      | The unique identifier of the app (GUID)  |

### Headers
None required

### Request Body
```json
{
  "type": "table",
  "ranges": [
    { "from": 50100, "to": 50199 },
    { "from": 50200, "to": 50299 }
  ],
  "perRange": false,
  "require": 50150,
  "commit": true
}
```
- `type` - Required. The AL object type or extended type (e.g., `table`, `page`, `table_50100` for fields). Valid base types: `codeunit`, `enum`, `enumextension`, `page`, `pageextension`, `permissionset`, `permissionsetextension`, `query`, `report`, `reportextension`, `table`, `tableextension`, `xmlport`
- `ranges` - Required. Array of ID ranges to search within
  - `from` - Start of range (inclusive)
  - `to` - End of range (inclusive)
- `perRange` - Optional. If true, returns first available ID for each range instead of a single ID
- `require` - Optional. When used with `perRange` and `commit`, limits the commit to the range containing this ID
- `commit` - Optional. If true, commits (consumes) the returned ID. If false or omitted, only returns the next available ID without consuming it

### Response (200 OK)
```json
{
  "id": 50100,
  "updated": true,
  "available": true,
  "updateAttempts": 1,
  "hasConsumption": true
}
```
- `id` - The next available ID. When `perRange` is true, this is an array of IDs (one per range). Returns 0 (or empty array) if no IDs available
- `updated` - Whether the consumption was updated (true only when `commit` is true and ID was successfully consumed)
- `available` - Whether an ID was available in the specified ranges
- `updateAttempts` - Number of optimistic update attempts required (useful for debugging concurrency)
- `hasConsumption` - Whether the app had any existing consumption data

### Extended Types for Fields/Enum Values

The `type` parameter supports extended types for object-specific IDs:
- `table_50100` - Field IDs for table 50100
- `enum_50100` - Enum value IDs for enum 50100
- `tableextension_50100` - Field IDs for table extension 50100

When using extended types, if the parent object ID falls within the provided ranges, the system automatically includes the 1-49999 range (standard field/enum value range).

### Per-Range Mode

When `perRange` is true, the response returns an array of available IDs:
```json
{
  "id": [50100, 50200],
  "updated": true,
  "available": true,
  "updateAttempts": 1,
  "hasConsumption": true
}
```
Each element corresponds to the first available ID in each range. Empty ranges are excluded.

### Errors
| Status | Condition                              | Message                               |
|--------|----------------------------------------|---------------------------------------|
| 409    | Too many concurrent update attempts    | "Too many attempts at updating BLOB"  |
