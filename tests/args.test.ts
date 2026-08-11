import { test, expect, describe } from "bun:test";
import { parseMainArgs } from "../src/args";

describe("parseMainArgs", () => {
  test("defaults when no args provided", () => {
    const args = parseMainArgs([]);
    expect(args.mode).toBe("stdio");
    expect(args.httpHost).toBe("0.0.0.0");
    expect(args.httpPort).toBe("3838");
    expect(args.version).toBe(false);
  });

  test("parses mode flag", () => {
    const args = parseMainArgs(["--mode", "cli"]);
    expect(args.mode).toBe("cli");
  });

  test("parses http host and port", () => {
    const args = parseMainArgs(["--http-host", "127.0.0.1", "--http-port", "5000"]);
    expect(args.httpHost).toBe("127.0.0.1");
    expect(args.httpPort).toBe("5000");
  });

  test("parses version flag", () => {
    const args = parseMainArgs(["--version"]);
    expect(args.version).toBe(true);
  });

  test("ignores unknown flags", () => {
    const args = parseMainArgs(["--mode", "http", "--table", "foo", "--unknown"]);
    expect(args.mode).toBe("http");
    expect(args.httpHost).toBe("0.0.0.0");
  });

  test("mode accepts http", () => {
    const args = parseMainArgs(["--mode", "http", "--http-host", "0.0.0.0", "--http-port", "3838", "--version"]);
    expect(args.mode).toBe("http");
    expect(args.version).toBe(true);
  });
});
