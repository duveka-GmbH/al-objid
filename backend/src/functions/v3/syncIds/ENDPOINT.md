# Sync IDs

Synchronizes object ID consumptions for a single app. Supports full replacement or merging with existing consumptions.

---

## Sync IDs (Full Replacement)

Replaces all existing ID consumptions for an app with the provided IDs.

- Method: `POST`
- Route: `v3/syncIds/{appId}`

### Route Parameters
| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| appId     | string | Yes      | The unique identifier of the app (GUID)  |

### Headers
| Header     | Type   | Required | Description                                       |
|------------|--------|----------|---------------------------------------------------|
| Ninja-Auth-Key | string | Conditional | Required if the app is authorized              |

### Request Body
```json
{
  "ids": {
    "table": [50100, 50101, 50102],
    "page": [50100, 50101],
    "codeunit": [50100]
  }
}
```
- `ids` - Required. Object mapping AL object types to arrays of consumed IDs

Valid types: `codeunit`, `enum`, `enumextension`, `page`, `pageextension`, `permissionset`, `permissionsetextension`, `query`, `report`, `reportextension`, `table`, `tableextension`, `xmlport`

### Response (200 OK)
```json
{
  "table": [50100, 50101, 50102],
  "page": [50100, 50101],
  "codeunit": [50100]
}
```
Returns the updated consumptions. IDs are sorted.

### Errors
| Status | Condition                 | Message                        |
|--------|---------------------------|--------------------------------|
| 401    | Invalid authorization key | "Invalid authorization key"    |

---

## Sync IDs (Merge)

Merges the provided IDs with existing consumptions for an app. Existing IDs are preserved.

- Method: `PATCH`
- Route: `v3/syncIds/{appId}`

### Route Parameters
| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| appId     | string | Yes      | The unique identifier of the app (GUID)  |

### Headers
| Header     | Type   | Required | Description                                       |
|------------|--------|----------|---------------------------------------------------|
| Ninja-Auth-Key | string | Conditional | Required if the app is authorized              |

### Request Body
```json
{
  "ids": {
    "table": [50103, 50104],
    "report": [50100]
  }
}
```
- `ids` - Required. Object mapping AL object types to arrays of IDs to merge with existing consumptions

### Response (200 OK)
```json
{
  "table": [50100, 50101, 50102, 50103, 50104],
  "page": [50100, 50101],
  "codeunit": [50100],
  "report": [50100]
}
```
Returns the merged consumptions. IDs are sorted and deduplicated.

### Errors
| Status | Condition                 | Message                        |
|--------|---------------------------|--------------------------------|
| 401    | Invalid authorization key | "Invalid authorization key"    |
