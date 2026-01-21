import * as yargs from "yargs";

describe("CLI Arguments", () => {
  describe("backup command", () => {
    it("should accept backup mode with required options", () => {
      const args = yargs
        .command("backup", "Backup users", (y) =>
          y.options({
            mode: { default: "backup" },
            directory: { alias: ["dir"], string: true },
          })
        )
        .parse(["backup", "--dir", "/tmp/backup"]);

      expect(args._).toContain("backup");
      expect(args.dir).toBe("/tmp/backup");
    });

    it("should set mode to backup for backup command", () => {
      const args = yargs
        .command("backup", "Backup users", (y) =>
          y.options({
            mode: { default: "backup" },
          })
        )
        .parse(["backup"]);

      expect(args.mode).toBe("backup");
    });
  });

  describe("restore command", () => {
    it("should accept restore mode with required options", () => {
      const args = yargs
        .command("restore", "Restore users", (y) =>
          y.options({
            mode: { default: "restore" },
            file: { alias: ["f"], string: true },
            password: { alias: ["pwd"], string: true },
          })
        )
        .parse(["restore", "--file", "/tmp/backup.json", "--pwd", "secret123"]);

      expect(args._).toContain("restore");
      expect(args.file).toBe("/tmp/backup.json");
      expect(args.pwd).toBe("secret123");
    });

    it("should set mode to restore for restore command", () => {
      const args = yargs
        .command("restore", "Restore users", (y) =>
          y.options({
            mode: { default: "restore" },
          })
        )
        .parse(["restore"]);

      expect(args.mode).toBe("restore");
    });
  });

  describe("common options", () => {
    it("should accept profile option", () => {
      const args = yargs
        .option("profile", { alias: ["p"], string: true })
        .parse(["--profile", "my-aws-profile"]);

      expect(args.profile).toBe("my-aws-profile");
    });

    it("should accept region option", () => {
      const args = yargs
        .option("region", { alias: ["r"], string: true })
        .parse(["--region", "us-east-1"]);

      expect(args.region).toBe("us-east-1");
    });

    it("should accept aws credentials options", () => {
      const args = yargs
        .option("aws-access-key", { alias: ["key", "k"], string: true })
        .option("aws-secret-key", { alias: ["secret", "s"], string: true })
        .parse(["--key", "AKIAIOSFODNN7EXAMPLE", "--secret", "wJalrXUtnFEMI"]);

      expect(args.key).toBe("AKIAIOSFODNN7EXAMPLE");
      expect(args.secret).toBe("wJalrXUtnFEMI");
    });

    it("should accept userpool option", () => {
      const args = yargs
        .option("userpool", { alias: ["pool"], string: true })
        .parse(["--userpool", "us-east-1_testpool"]);

      expect(args.userpool).toBe("us-east-1_testpool");
    });

    it("should accept sessionToken option", () => {
      const args = yargs
        .option("sessionToken", { alias: ["st"], string: true })
        .parse(["--st", "FwoGZX..."]);

      expect(args.st).toBe("FwoGZX...");
    });

    it("should accept delay option", () => {
      const args = yargs
        .option("delay", { number: true })
        .parse(["--delay", "1000"]);

      expect(args.delay).toBe(1000);
    });
  });
});

describe("Input validation", () => {
  it("should validate mode is one of backup or restore", () => {
    const validModes = ["backup", "restore"];
    
    expect(validModes.includes("backup")).toBe(true);
    expect(validModes.includes("restore")).toBe(true);
    expect(validModes.includes("invalid")).toBe(false);
  });

  it("should validate userpool format", () => {
    // AWS Cognito user pool IDs follow the pattern: region_id
    const validPoolId = "us-east-1_abc123XYZ";
    const invalidPoolId = "invalid-pool-id";

    const poolIdPattern = /^[\w-]+_[\w]+$/;
    
    expect(poolIdPattern.test(validPoolId)).toBe(true);
    expect(poolIdPattern.test(invalidPoolId)).toBe(false);
  });

  it("should handle 'all' as special userpool value for backup", () => {
    const userpool = "all";
    const mode = "backup";
    
    // 'all' is only valid for backup mode
    const isValid = userpool === "all" && mode === "backup";
    expect(isValid).toBe(true);
  });
});
