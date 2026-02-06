/**
 * Jest Setup File
 *
 * This file runs before all tests and before any modules are loaded.
 * It sets up the environment required for blob tests.
 */

// Set the Azure Storage connection string environment variable
// This must be set before @vjeko.com/azure-blob is imported
// because that library checks for this env var at module initialization time
process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true;";
