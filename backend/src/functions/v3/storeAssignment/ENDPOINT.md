# Store Assignment

Manually adds or removes a specific object ID assignment for an app.

---

## Add Assignment

Marks a specific ID as consumed for a given object type.

- Method: `POST`
- Route: `v3/storeAssignment/{appId}/{type}/{id}`

### Route Parameters
| Parameter | Type   | Required | Description                                           |
|-----------|--------|----------|-------------------------------------------------------|
| appId     | string | Yes      | The unique identifier of the app (GUID)               |
| type      | string | Yes      | The AL object type (e.g., `table`, `page`, `codeunit`) |
| id        | number | Yes      | The object ID to mark as consumed                     |

Valid types: `codeunit`, `enum`, `enumextension`, `page`, `pageextension`, `permissionset`, `permissionsetextension`, `query`, `report`, `reportextension`, `table`, `tableextension`, `xmlport`, and extended types like `table_50100` for fields.

### Headers
None required

### Request Body
None

### Response (200 OK)
```json
{
  "updated": true
}
```
- `updated` - True if the ID was added, false if it was already consumed

### Errors
None (invalid type/id returns validation error)

---

## Remove Assignment

Removes a specific ID from consumption for a given object type.

- Method: `POST`
- Route: `v3/storeAssignment/{appId}/{type}/{id}/delete`

### Route Parameters
| Parameter | Type   | Required | Description                                           |
|-----------|--------|----------|-------------------------------------------------------|
| appId     | string | Yes      | The unique identifier of the app (GUID)               |
| type      | string | Yes      | The AL object type (e.g., `table`, `page`, `codeunit`) |
| id        | number | Yes      | The object ID to remove from consumption              |

Valid types: `codeunit`, `enum`, `enumextension`, `page`, `pageextension`, `permissionset`, `permissionsetextension`, `query`, `report`, `reportextension`, `table`, `tableextension`, `xmlport`, and extended types like `table_50100` for fields.

### Headers
None required

### Request Body
None

### Response (200 OK)
```json
{
  "updated": true
}
```
- `updated` - True if the ID was removed, false if it wasn't in the consumption list

### Errors
None (invalid type/id returns validation error)
