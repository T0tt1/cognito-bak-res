import * as fs from "fs";
import * as path from "path";
import { backupUsers, restoreUsers } from "../src/index";
import {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
  ListUsersCommand,
  AdminListGroupsForUserCommand,
  DescribeUserPoolCommand,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Mock the AWS SDK
jest.mock("@aws-sdk/client-cognito-identity-provider");

// Mock fs module
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn(),
  createReadStream: jest.fn(),
}));

// Mock JSONStream
jest.mock("JSONStream", () => ({
  stringify: jest.fn(() => ({
    pipe: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn((event: string, callback: () => void) => {
      if (event === "end") {
        callback();
      }
    }),
  })),
  parse: jest.fn(() => ({
    on: jest.fn(),
  })),
}));

// Helper to create a properly typed mock client
const createMockClient = () => {
  return {
    send: jest.fn(),
  } as unknown as jest.Mocked<CognitoIdentityProviderClient> & {
    send: jest.Mock;
  };
};

describe("backupUsers", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockWriteStream: { end: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = createMockClient();

    mockWriteStream = {
      end: jest.fn(),
    };

    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.createWriteStream as jest.Mock).mockReturnValue(mockWriteStream);
  });

  it("should backup users from a specific user pool", async () => {
    const mockUsers = [
      {
        Username: "user1",
        Attributes: [{ Name: "email", Value: "user1@example.com" }],
      },
      {
        Username: "user2",
        Attributes: [{ Name: "email", Value: "user2@example.com" }],
      },
    ];

    const mockGroups = [{ GroupName: "admin" }];

    mockClient.send
      .mockResolvedValueOnce({ Users: mockUsers, PaginationToken: undefined })
      .mockResolvedValueOnce({ Groups: mockGroups })
      .mockResolvedValueOnce({ Groups: [] });

    await backupUsers(mockClient, "us-east-1_testpool", "/tmp/backup");

    expect(mockClient.send).toHaveBeenCalledWith(expect.any(ListUsersCommand));
    expect(mockClient.send).toHaveBeenCalledWith(
      expect.any(AdminListGroupsForUserCommand)
    );
  });

  it("should backup all user pools when 'all' is specified", async () => {
    const mockUserPools = [
      { Id: "pool1", Name: "Pool 1" },
      { Id: "pool2", Name: "Pool 2" },
    ];

    mockClient.send
      .mockResolvedValueOnce({ UserPools: mockUserPools })
      .mockResolvedValueOnce({ Users: [], PaginationToken: undefined })
      .mockResolvedValueOnce({ Users: [], PaginationToken: undefined });

    await backupUsers(mockClient, "all", "/tmp/backup");

    expect(mockClient.send).toHaveBeenCalledWith(
      expect.any(ListUserPoolsCommand)
    );
  });

  it("should create directory if it does not exist", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    mockClient.send.mockResolvedValueOnce({
      Users: [],
      PaginationToken: undefined,
    });

    await backupUsers(mockClient, "us-east-1_testpool", "/tmp/newbackup");

    expect(fs.mkdirSync).toHaveBeenCalledWith("/tmp/newbackup");
  });

  it("should handle pagination correctly", async () => {
    const mockUsersPage1 = [{ Username: "user1", Attributes: [] }];
    const mockUsersPage2 = [{ Username: "user2", Attributes: [] }];

    mockClient.send
      .mockResolvedValueOnce({
        Users: mockUsersPage1,
        PaginationToken: "token123",
      })
      .mockResolvedValueOnce({ Groups: [] })
      .mockResolvedValueOnce({
        Users: mockUsersPage2,
        PaginationToken: undefined,
      })
      .mockResolvedValueOnce({ Groups: [] });

    await backupUsers(mockClient, "us-east-1_testpool", "/tmp/backup");

    // Should have made 2 ListUsersCommand calls (one for each page)
    const listUsersCalls = mockClient.send.mock.calls.filter(
      (call: any) => call[0] instanceof ListUsersCommand
    );
    expect(listUsersCalls.length).toBe(2);
  });
});

describe("restoreUsers", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockReadStream: { pipe: jest.Mock };
  let mockParser: { on: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = createMockClient();

    mockParser = {
      on: jest.fn(),
    };

    mockReadStream = {
      pipe: jest.fn(),
    };

    (fs.createReadStream as jest.Mock).mockReturnValue(mockReadStream);

    const JSONStream = require("JSONStream");
    (JSONStream.parse as jest.Mock).mockReturnValue(mockParser);
  });

  it("should reject 'all' as UserPoolId", async () => {
    await expect(
      restoreUsers(mockClient, "all", "/tmp/backup.json")
    ).rejects.toThrow("'all' is not a acceptable value for UserPoolId");
  });

  it("should describe user pool before restoring", async () => {
    mockClient.send.mockResolvedValueOnce({
      UserPool: { UsernameAttributes: [] },
    });

    await restoreUsers(mockClient, "us-east-1_testpool", "/tmp/backup.json");

    expect(mockClient.send).toHaveBeenCalledWith(
      expect.any(DescribeUserPoolCommand)
    );
  });

  it("should set up stream parsing for restore", async () => {
    mockClient.send.mockResolvedValueOnce({
      UserPool: { UsernameAttributes: [] },
    });

    await restoreUsers(mockClient, "us-east-1_testpool", "/tmp/backup.json");

    expect(fs.createReadStream).toHaveBeenCalledWith("/tmp/backup.json");
    expect(mockReadStream.pipe).toHaveBeenCalled();
  });
});

describe("Error handling", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
    consoleSpy = jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("should log errors from backup operations", async () => {
    const testError = new Error("AWS Error");
    mockClient.send.mockRejectedValueOnce(testError);

    // The function catches errors internally and logs them
    await backupUsers(mockClient, "us-east-1_testpool", "/tmp/backup");

    expect(consoleSpy).toHaveBeenCalledWith(testError);
  });

  it("should reject restore with invalid UserPoolId 'all'", async () => {
    await expect(
      restoreUsers(mockClient, "all", "/tmp/backup.json")
    ).rejects.toThrow("'all' is not a acceptable value for UserPoolId");
  });
});
