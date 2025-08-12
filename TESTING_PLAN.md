# Testing Plan for src/config.ts

## Overview

This document outlines the testing plan for the configuration management functions in `src/config.ts`. The file exports several functions for managing database configurations that need to be thoroughly tested.

## Exported Functions to Test

1. `loadConfig()` - Load configuration from file
2. `saveConfig(config: Config)` - Save configuration to file
3. `addDatabase(name: string, dbConfig: DbEntry)` - Add a new database configuration
4. `updateDatabase(name: string, update: Partial<DbEntry>)` - Update an existing database configuration
5. `removeDatabase(name: string)` - Remove a database configuration
6. `getConfig(name: string)` - Get a specific database configuration
7. `listDatabases()` - List all database configurations

## Test Strategy

- Use temporary files for CONFIG_PATH to avoid affecting the actual configuration
- Test both success and error cases for each function
- Ensure proper validation of input data using Zod schemas
- Test edge cases like missing files, invalid configurations, etc.

## Test File Structure

The tests will be implemented in `tests/config.test.ts` using Bun's built-in test runner.

## Detailed Test Cases

### loadConfig()

- Should create default config when file doesn't exist and POSTGRES_URL is set
- Should return null when file doesn't exist and POSTGRES_URL is not set
- Should load existing valid config
- Should throw error for invalid config format

### saveConfig()

- Should save valid config to file
- Should throw error for invalid config
- Should create directory structure if it doesn't exist

### addDatabase()

- Should add new database to config
- Should throw error if database name already exists
- Should throw error for invalid database config
- Should throw error if config file not found

### updateDatabase()

- Should update existing database config
- Should throw error if database name not found
- Should throw error for invalid updated config
- Should throw error if config file not found

### removeDatabase()

- Should remove existing database from config
- Should throw error if database name not found
- Should throw error if config file not found

### getConfig()

- Should return specific database config
- Should throw error if database name not found
- Should throw error if config file not found
- Should handle case when no databases are configured

### listDatabases()

- Should return array of all database configs
- Should return empty array when no databases configured
- Should throw error if config file not found
- Should validate each database config

## Implementation Approach

1. Create temporary directory for test config files
2. Mock CONFIG_PATH to point to temporary file
3. Clean up temporary files after each test
4. Test each function with various scenarios
