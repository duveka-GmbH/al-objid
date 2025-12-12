# Check App

Checks whether an app exists in the system.

---

## Check App Existence

Verifies if an app with the given ID exists.

- Method: `GET`
- Route: `v3/checkApp/{appId}`

### Route Parameters
| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| appId     | string | Yes      | The unique identifier of the app (GUID)  |

### Headers
None required

### Request Body
None

### Response (200 OK)
Empty response body. A 200 status indicates the app exists.

### Errors
| Status | Condition        | Message         |
|--------|------------------|-----------------|
| 404    | App does not exist | "App not found" |
