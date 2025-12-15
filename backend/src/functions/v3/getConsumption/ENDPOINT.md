# Get Consumption

Retrieves all consumed object IDs for an app, organized by object type.

---

## Get Consumption Data

Returns all object ID consumptions for an app along with a total count.

- Method: `POST`
- Route: `v3/getConsumption/{appId}`

### Route Parameters
| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| appId     | string | Yes      | The unique identifier of the app (GUID)  |

### Headers
None required

### Request Body
None

### Response (200 OK)
```json
{
  "table": [50100, 50101, 50102],
  "page": [50100, 50101],
  "codeunit": [50100],
  "report": [50100, 50101],
  "_total": 8
}
```
- Object type keys (`table`, `page`, `codeunit`, etc.) - Arrays of consumed IDs for each AL object type
- `_total` - Total count of all consumed IDs across all object types

Valid object types: `codeunit`, `enum`, `enumextension`, `page`, `pageextension`, `permissionset`, `permissionsetextension`, `query`, `report`, `reportextension`, `table`, `tableextension`, `xmlport`

### Errors
| Status | Condition          | Message           |
|--------|--------------------|-------------------|
| 404    | App does not exist | "App not found"   |
