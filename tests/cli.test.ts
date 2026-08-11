import { describe, it, expect } from "bun:test";
import { parseCliArgs } from "../src/cli.js";

describe("CLI arg parser", () => {
  it("parses tool name", () => {
    const args = parseCliArgs(["--mode", "cli", "--tool", "pg_list_tables"]);
    expect(args.tool).toBe("pg_list_tables");
  });

  it("parses dynamic flags into args object", () => {
    const args = parseCliArgs(["--mode", "cli", "--tool", "pg_list_tables", "--schema", "public"]);
    expect(args.args).toEqual({ schema: "public" });
  });

  it("coerces numbers", () => {
    const args = parseCliArgs(["--mode", "cli", "--tool", "pg_db_add", "--ttl", "60000"]);
    expect(args.args.ttl).toBe(60000);
    expect(typeof args.args.ttl).toBe("number");
  });

  it("coerces booleans", () => {
    const args = parseCliArgs(["--mode", "cli", "--tool", "pg_list_tables", "--flag", "true"]);
    expect(args.args.flag).toBe(true);
  });

  it("detects general help", () => {
    const args = parseCliArgs(["--mode", "cli", "--help"]);
    expect(args.help).toBe(true);
    expect(args.tool).toBeNull();
  });

  it("detects tool-specific help", () => {
    const args = parseCliArgs(["--mode", "cli", "--help", "pg_list_tables"]);
    expect(args.helpTool).toBe("pg_list_tables");
  });

  it("parses verbose flag", () => {
    const args = parseCliArgs(["--mode", "cli", "--tool", "pg_list_tables", "--verbose"]);
    expect(args.verbose).toBe(true);
  });
});
