# Deploying a Self-Maintained Back End

AL Object ID Ninja uses a public API to manage object IDs. While this API is deployed on Microsoft Azure
infrastructure and uses secure HTTPS communication, you may prefer using your own Azure subscription and
your own resources.

This document explains how to deploy your own Azure Functions back end for AL Object ID Ninja.

> **Version note (v3)**: These instructions are for the **v3 back-end endpoints**. If you previously
> deployed a private back end for **v2**, keep it running and deploy this **v3 back end in parallel**—the
> AL Object ID Ninja **v3 VS Code extension is not compatible with v2 endpoints**.

## Infrastructure Description

The back end is a **single Azure Functions app** (Node.js) that stores its data in **Azure Blob Storage**.

- **Function app code**: `backend/` in this repository
- **Storage**: one Azure Storage account (Blob)

## Repository

All of AL Object ID Ninja is maintained in one monorepo:

- https://github.com/vjekob/al-objid

The Azure Functions back end is located here:

- `backend/`

## Deploying the Azure Functions app

You can deploy the Azure Functions app any way you prefer (VS Code deployment, GitHub Actions, Azure
DevOps, etc.).

> Note: This document does not provide a step-by-step guide for deploying Azure Functions. If you are not
> familiar with Azure Functions deployment, see the official documentation:
> https://docs.microsoft.com/en-us/azure/azure-functions/

There are no requirements about naming the function app. You can choose any name you want.

### Runtime Stack

When creating the Function App (or configuring your deployment template), use:

- Runtime Stack: Node.js
- Version: 20 LTS (Azure Functions v4)

### Operating System

Your choice of operating system is entirely up to you. The app can run on Windows or Linux.

## Storage

This back end requires **one Azure Storage account** for Blob storage.

## Configuring the Azure Functions app

After the function app is deployed, configure its **Application settings** (Function App → Settings →
Configuration → Application settings).

AL Object ID Ninja requires a single back-end setting:

| Setting                           | Description                                                                 |
| --------------------------------- | --------------------------------------------------------------------------- |
| `AZURE_STORAGE_CONNECTION_STRING` | Connection string for the Azure Storage account used by AL Object ID Ninja. |

## Configuring AL Object ID Ninja

Once your back end is deployed, configure AL Object ID Ninja to use your own back end:

| Setting                       | Description                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `objectIdNinja.backEndUrl`    | Host name of the Function App you deployed.                                                          |
| `objectIdNinja.backEndAPIKey` | App key used by your Function App. If your app does not use app keys, do not configure this setting. |

When configuring the host name, do not use the full URL. For example, if your function app endpoint is
`https://example.azurewebsites.net/`, set `example.azurewebsites.net` as the `objectIdNinja.backEndUrl`
configuration value.
