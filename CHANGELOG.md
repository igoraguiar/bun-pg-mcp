# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-08-11

### Added

- add pg_list_trigger_functions and pg_describe_trigger_function tools
- add pg_describe_table_full tool
- extract main arg parsing to src/args.ts
- Output help in JSON format
- Pretty-print tool schema in --help output
- Show result format in tool-specific help
- Fix --help <tool> parsing for CLI mode
- Add Zod pre-validation to CLI runner
- Add global database flag and repeated args support
- Add output contract, format validation and verbose logging
- CLI tracer for pg_list_tables end-to-end
- Scaffold CLI module and mode wiring
- add --version CLI flag
- Add pgListTableReferencedBy function and integrate into createMcpServer
- Add Express server support with HTTP transport for MCP communication
- Implement database resolution logic in ConfigManager for improved database handling

### Changed

- rename pgDescribeTriggerFunction to pgDescribeFunction
- rename pg_describe_trigger_function to pg_describe_function
- filter trigger functions by return type trigger
- simplify parseArgs for CLI mode
- Extract pure handlers and registry
- rename sqlPool file to sql-pool
- extract and modularize MCP server logic
- Update reconcile method to use database URLs for new database addition

### Fixed

- fix pgDescribeFunction parameter duplication for OUT functions
- use pg_get_function_arguments for parameters to ensure correct count
- pg_list_trigger_functions returns only actual trigger functions
- alias is_deferrable as deferrable in FK enhanced query
- improve database name resolution logic to handle empty and trimmed values
- correct database pool reconciliation logic
- correct foreign key query to use proper schema references
- Update version in package.json to 1.1.0-next
- Update pg_describe_table tool to handle optional database and improve error messaging
- Coerce ttl to number in createMcpServer tool arguments
- Set default schema to "public" in pgTablesArgsSchema and pg_describe_table tool

### Tests

- add pg_describe_function regular function test
- add tests for pg_describe_table_full helpers and trigger function helpers
- add integration tests with dockerized postgres

### Documentation

- Add comprehensive AGENTS.md system prompt
- Mark CLI mode tickets as resolved
- Add CLI mode spec and tickets
- add documentation for agent skills and workflows

### Chore

- Add .ai-jail to .gitignore
- Remove ai-jail sandbox configuration file
- add initial pi-lens configuration file
- add .ai-jail configuration file
- add .pi/settings.json
- add configVersion field to lockfile

### Style

- reformat helper functions and add function test
- reformat cli test file indentation
