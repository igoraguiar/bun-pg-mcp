# Comprehensive Modularization Plan for pg-mcp

## Executive Summary

The `src/index.ts` file has already been partially modularized with well-defined components for configuration management, SQL connection pooling, and database helper functions. The remaining monolithic aspects primarily involve the MCP server creation and tool registration logic. This plan outlines how to further decompose the file into focused, maintainable modules while preserving existing functionality.

## Current State Analysis

The project already has a good modular structure with:

1. `src/config.ts` - Configuration management with ConfigManager class
2. `src/sqlPool.ts` - SQL connection pooling with SqlPool class
3. `src/db/helpers.ts` - Database helper functions
4. `src/db/types.ts` - Database type definitions

The main `src/index.ts` file contains:

1. Environment loading functionality
2. A `textResult` helper function
3. A large `createMcpServer` function that:
   - Handles database configuration management
   - Creates an MCP server
   - Defines multiple tools for PostgreSQL operations
   - Handles database connection pooling
   - Manages configuration reloading

## Logical Component Groupings

### 1. Environment Management Module

**Location:** `src/environment.ts`
**Responsibilities:**

- Loading environment variables from .env files
- Environment variable parsing and validation

### 2. Result Formatting Module

**Location:** `src/resultFormatter.ts`

- Standardized result formatting for MCP tool responses
- Error handling and formatting utilities

### 3. MCP Server Core Module

**Location:** `src/server/core.ts`
**Responsibilities:**

- MCP server initialization
- Transport setup
- Core server configuration

### 4. Database Tools Module

**Location:** `src/server/tools/database.ts`
**Responsibilities:**

- All PostgreSQL database interaction tools:
  - `pg_get_server_version`
  - `pg_list_schemas`
  - `pg_list_tables`
  - `pg_describe_table`
  - `pg_execute_query`
  - `get_url`

### 5. Configuration Tools Module

**Location:** `src/server/tools/config.ts`
**Responsibilities:**

- Database configuration management tools:
  - `pg_db_list`
  - `pg_db_add`
  - `pg_db_update`
  - `pg_db_remove`
  - `pg_db_reload`

### 6. Prompt Tools Module

**Location:** `src/server/prompts.ts`
**Responsibilities:**

- Prompt generation tools:
  - `gen_types`

### 7. Utility Functions Module

**Location:** `src/utils.ts`
**Responsibilities:**

- Helper functions like `redactCredentials`
- Shared utility functions across modules

## Export/Import Relationships

```
src/index.ts
├── src/environment.ts (imports: fs, path, bun)
├── src/resultFormatter.ts (imports: @modelcontextprotocol/sdk)
├── src/server/core.ts (imports: @modelcontextprotocol/sdk, src/config, src/sqlPool)
├── src/server/tools/database.ts (imports: src/config, src/sqlPool, src/db/helpers, src/resultFormatter)
├── src/server/tools/config.ts (imports: src/config, src/sqlPool, src/resultFormatter, src/utils)
├── src/server/prompts.ts (imports: src/config, src/resultFormatter)
├── src/utils.ts (imports: url)
└── src/db/* (already modularized)
```

## Detailed Modularization Plan

### Phase 1: Environment and Utility Modules

1. **Create `src/environment.ts`**

   - Move `loadEnvFile` function
   - Add environment variable loading logic
   - Export function for use in main server

2. **Create `src/utils.ts`**

   - Move `redactCredentials` function
   - Add other shared utility functions
   - Export utilities for use across modules

3. **Create `src/resultFormatter.ts`**
   - Move `textResult` function
   - Add standardized error handling
   - Export result formatting functions

### Phase 2: Server Core Module

1. **Create `src/server/core.ts`**
   - Move core MCP server creation logic
   - Keep server initialization and transport setup
   - Export `createMcpServer` function with proper dependencies

### Phase 3: Tool Modules

1. **Create `src/server/tools/database.ts`**

   - Move all PostgreSQL database tools:
     - `pg_get_server_version`
     - `pg_list_schemas`
     - `pg_list_tables`
     - `pg_describe_table`
     - `pg_execute_query`
     - `get_url`
   - Maintain proper imports from existing db modules

2. **Create `src/server/tools/config.ts`**

   - Move all database configuration tools:
     - `pg_db_list`
     - `pg_db_add`
     - `pg_db_update`
     - `pg_db_remove`
     - `pg_db_reload`
   - Maintain proper imports and dependencies

3. **Create `src/server/prompts.ts`**
   - Move prompt generation tools:
     - `gen_types`
   - Maintain proper imports and dependencies

### Phase 4: Main Entry Point Refactor

1. **Refactor `src/index.ts`**
   - Simplify to only contain:
     - Environment loading
     - Server creation
     - Server connection
   - Import all necessary modules
   - Maintain backward compatibility

## Step-by-Step Refactoring Approach

### Step 1: Create New Module Files

1. Create `src/environment.ts` with environment loading functions
2. Create `src/utils.ts` with utility functions
3. Create `src/resultFormatter.ts` with result formatting functions

### Step 2: Extract Tool Modules

1. Create `src/server/tools/database.ts` and move database tools
2. Create `src/server/tools/config.ts` and move configuration tools
3. Create `src/server/prompts.ts` and move prompt tools

### Step 3: Extract Server Core

1. Create `src/server/core.ts` and move core server logic
2. Ensure proper dependency injection for ConfigManager and SqlPool

### Step 4: Refactor Main Entry Point

1. Simplify `src/index.ts` to only contain essential bootstrapping
2. Import and compose all modules properly
3. Maintain all existing functionality

### Step 5: Testing and Validation

1. Run existing tests to ensure no regressions
2. Test all MCP tools function correctly
3. Verify configuration management works as expected
4. Confirm auto-reload functionality remains intact

## Benefits of This Modularization

1. **Improved Maintainability**: Each module has a single responsibility
2. **Better Testability**: Smaller, focused modules are easier to test
3. **Enhanced Readability**: Code is organized by functionality
4. **Easier Extension**: New tools can be added without modifying core files
5. **Reduced Complexity**: Each file is smaller and more focused
6. **Clearer Dependencies**: Import/export relationships are explicit

## Risk Mitigation

1. **Backward Compatibility**: All existing functionality will be preserved
2. **Gradual Refactoring**: Modules can be extracted one at a time
3. **Comprehensive Testing**: Existing tests will validate no regressions
4. **Clear Documentation**: Each module will have clear purpose documentation

## Implementation Timeline

1. **Phase 1** (Environment/Utility modules): 1-2 hours
2. **Phase 2** (Tool modules): 3-4 hours
3. **Phase 3** (Server core): 2-3 hours
4. **Phase 4** (Main refactor and testing): 2-3 hours

Total estimated effort: 8-12 hours for complete modularization while maintaining full functionality.
