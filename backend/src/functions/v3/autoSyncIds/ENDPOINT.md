# Auto Sync IDs

Bulk synchronization of object ID consumptions for multiple apps in a single request. Useful for syncing ID assignments from multiple AL app folders at once.

---

## Sync IDs (Full Replacement)

Replaces all existing ID consumptions for each app with the provided IDs.

- Method: `POST`
- Route: `v3/autoSyncIds`

### Route Parameters
None

### Headers
None required

### Request Body
```json
{
  "appFolders": [
    {
      "appId": "app-guid-1",
      "authKey": "authorization-key-if-app-is-authorized",
      "ids": {
        "table": [50100, 50101, 50102],
        "page": [50100, 50101],
        "codeunit": [50100]
      }
    },
    {
      "appId": "app-guid-2",
      "ids": {
        "table": [50200, 50201]
      }
    }
  ]
}
```
- `appFolders` - Array of app consumption objects
  - `appId` - Required. The unique identifier of the app (GUID)
  - `authKey` - Optional. Required if the app is authorized
  - `ids` - Required. Object mapping AL object types to arrays of consumed IDs. Valid types: `codeunit`, `enum`, `enumextension`, `page`, `pageextension`, `permissionset`, `permissionsetextension`, `query`, `report`, `reportextension`, `table`, `tableextension`, `xmlport`

### Response (200 OK)
```json
{
  "app-guid-1": {
    "table": [50100, 50101, 50102],
    "page": [50100, 50101],
    "codeunit": [50100]
  },
  "app-guid-2": {
    "table": [50200, 50201]
  }
}
```
Returns the updated consumptions for each app, keyed by app ID.

### Errors
| Status | Condition                          | Message                                  |
|--------|------------------------------------|------------------------------------------|
| 401    | Invalid authKey for authorized app | "Invalid credentials for app {appId}"    |

---

## Sync IDs (Merge)

Merges the provided IDs with existing consumptions for each app. Existing IDs are preserved.

- Method: `PATCH`
- Route: `v3/autoSyncIds`

### Route Parameters
None

### Headers
None required

### Request Body
```json
{
  "appFolders": [
    {
      "appId": "app-guid-1",
      "authKey": "authorization-key-if-app-is-authorized",
      "ids": {
        "table": [50103, 50104],
        "report": [50100]
      }
    }
  ]
}
```
- `appFolders` - Array of app consumption objects
  - `appId` - Required. The unique identifier of the app (GUID)
  - `authKey` - Optional. Required if the app is authorized
  - `ids` - Required. Object mapping AL object types to arrays of IDs to merge with existing consumptions

### Response (200 OK)
```json
{
  "app-guid-1": {
    "table": [50100, 50101, 50102, 50103, 50104],
    "page": [50100, 50101],
    "codeunit": [50100],
    "report": [50100]
  }
}
```
Returns the merged consumptions for each app. IDs are sorted and deduplicated.

### Errors
| Status | Condition                          | Message                                  |
|--------|------------------------------------|------------------------------------------|
| 401    | Invalid authKey for authorized app | "Invalid credentials for app {appId}"    |
