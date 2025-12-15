# Authorize App

Manages authorization for AL apps. Authorization protects an app from unauthorized modifications by requiring a secret key for certain operations.

---

## Check Authorization Status

Retrieves the current authorization status of an app.

- Method: `GET`
- Route: `v3/authorizeApp/{appId}`

### Route Parameters
| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| appId     | string | Yes      | The unique identifier of the app (GUID)  |

### Headers
| Header     | Type   | Required | Description                                       |
|------------|--------|----------|---------------------------------------------------|
| Ninja-Auth-Key | string | No       | If provided, response includes key validity check |

### Request Body
None

### Response (200 OK)
```json
{
  "authorized": true,
  "valid": true,
  "user": {
    "name": "john.doe",
    "email": "john.doe@example.com",
    "timestamp": 1699876543210
  }
}
```
- `authorized` - Whether the app has authorization enabled
- `valid` - Only present if Ninja-Auth-Key was provided; true if key matches
- `user` - User who authorized the app, or null if no user info was stored

### Errors
None

---

## Authorize App

Authorizes an app, generating a secret key required for future protected operations.

- Method: `POST`
- Route: `v3/authorizeApp/{appId}`

### Route Parameters
| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| appId     | string | Yes      | The unique identifier of the app (GUID)  |

### Headers
None required

### Request Body
```json
{
  "gitUser": "john.doe",
  "gitEMail": "john.doe@example.com"
}
```
- `gitUser` - Optional. Git username of the authorizing user
- `gitEMail` - Optional. Git email (only stored if gitUser is also provided)

### Response (200 OK)
```json
{
  "authKey": "a1b2c3d4e5f6..."
}
```
- `authKey` - The generated authorization key. Store this securely!

### Errors
| Status | Condition                 | Message                                                              |
|--------|---------------------------|----------------------------------------------------------------------|
| 405    | App is already authorized | "You cannot authorize app {appId} because it is already authorized." |

---

## De-authorize App

Removes authorization from an app, allowing unrestricted modifications.

- Method: `DELETE`
- Route: `v3/authorizeApp/{appId}`

### Route Parameters
| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| appId     | string | Yes      | The unique identifier of the app (GUID)  |

### Headers
| Header     | Type   | Required | Description                                            |
|------------|--------|----------|--------------------------------------------------------|
| Ninja-Auth-Key | string | Yes      | The authorization key returned when app was authorized |

### Request Body
None

### Response (200 OK)
```json
{
  "deleted": true
}
```

### Errors
| Status | Condition                 | Message                                                                                      |
|--------|---------------------------|----------------------------------------------------------------------------------------------|
| 404    | App does not exist        | "You cannot de-authorize app {appId} because it does not exist."                             |
| 405    | App is not authorized     | "You cannot de-authorize app {appId} because it is not authorized."                          |
| 401    | Invalid authorization key | "You cannot de-authorize app {appId} because you provided the incorrect authorization key."  |
| 500    | De-authorization failed   | "An error occurred while de-authorizing app {appId}. Try again later."                       |
