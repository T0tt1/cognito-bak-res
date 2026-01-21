import {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { fromIni } from "@aws-sdk/credential-providers";
import { parseKnownFiles } from "@smithy/shared-ini-file-loader";
import fuzzy from "fuzzy";
import inquirer from "inquirer";
import chalk from "chalk";
import { argv } from "./args";

// @ts-ignore - no types available
import autocompletePrompt from "inquirer-autocomplete-prompt";

inquirer.registerPrompt("autocomplete", autocompletePrompt);

const greenify = chalk.green;

const loadCredentialProfiles = async (): Promise<string[]> => {
  try {
    const profiles = await parseKnownFiles({});
    return Object.keys(profiles);
  } catch {
    return ["default"];
  }
};

const searchAWSProfile = (savedAWSProfiles: string[]) => {
  return async (_: any, input: string) => {
    input = input || "";
    const fuzzyResult = fuzzy.filter(input, savedAWSProfiles);
    return fuzzyResult.map((el) => {
      return el.original;
    });
  };
};

const searchCognitoRegion = async (_: any, input: string) => {
  input = input || "";
  const region = [
    {
      get name() {
        return greenify(this.value) + " :: US East (N. Virginia)";
      },
      value: "us-east-1",
    },
    {
      get name() {
        return greenify(this.value) + " :: US East (Ohio)";
      },
      value: "us-east-2",
    },
    {
      get name() {
        return greenify(this.value) + " :: US West (Oregon)";
      },
      value: "us-west-2",
    },
    {
      get name() {
        return greenify(this.value) + " :: Asia Pacific (Mumbai)";
      },
      value: "ap-south-1",
    },
    {
      get name() {
        return greenify(this.value) + " :: Asia Pacific (Tokyo)";
      },
      value: "ap-northeast-1",
    },
    {
      get name() {
        return greenify(this.value) + " :: Asia Pacific (Seoul)";
      },
      value: "ap-northeast-2",
    },
    {
      get name() {
        return greenify(this.value) + " :: Asia Pacific (Singapore)";
      },
      value: "ap-southeast-1",
    },
    {
      get name() {
        return greenify(this.value) + " :: Asia Pacific (Sydney)";
      },
      value: "ap-southeast-2",
    },
    {
      get name() {
        return greenify(this.value) + " :: EU (Frankfurt)";
      },
      value: "eu-central-1",
    },
    {
      get name() {
        return greenify(this.value) + " :: EU (Ireland)";
      },
      value: "eu-west-1",
    },
    {
      get name() {
        return greenify(this.value) + " :: EU (London)";
      },
      value: "eu-west-2",
    },
  ];
  const fuzzyResult = fuzzy.filter(input, region, {
    extract: (el) => el.value,
  });
  return fuzzyResult.map((el) => {
    return el.original;
  });
};

const verifyOptions = async () => {
  let mode = argv.mode as string | undefined;
  let profile = argv.profile as string;
  let region = argv.region as string | undefined;
  let key = argv.key as string | undefined;
  let secret = argv.secret as string | undefined;
  let userpool = argv.userpool as string | undefined;
  let directory = argv.directory as string | undefined;
  let file = argv.file as string | undefined;
  let password = argv.password as string | undefined;
  let passwordModulePath = argv.passwordModulePath as string | undefined;
  let delay = argv.delay as number | undefined;
  let st = argv.st as string | undefined;

  const savedAWSProfiles = await loadCredentialProfiles();

  // choose the mode if not passed through CLI or invalid is passed
  if (!mode || !["restore", "backup"].includes(mode)) {
    const modeChoice = await inquirer.prompt<{ selected: string }>({
      type: "list",
      name: "selected",
      message: "Choose the mode",
      choices: ["Backup", "Restore"],
    });

    mode = modeChoice.selected.toLowerCase();

    // choose your profile from available AWS profiles if not passed through CLI
    // only shown in case when no valid profile or no key && secret is passed.
    if (!savedAWSProfiles.includes(profile) || (!key && !secret)) {
      const awsProfileChoice = await inquirer.prompt<{ selected: string }>({
        type: "autocomplete",
        name: "selected",
        message: "Choose your AWS Profile",
        source: searchAWSProfile(savedAWSProfiles),
      } as any);

      profile = awsProfileChoice.selected;
    }
  }
  // choose your region if not passed through CLI
  if (!region) {
    const awsRegionChoice = await inquirer.prompt<{ selected: string }>({
      type: "autocomplete",
      name: "selected",
      message: "Choose your Cognito Region",
      source: searchCognitoRegion,
    } as any);

    region = awsRegionChoice.selected;
  }

  // Build client configuration for Cognito operations
  const clientConfig: any = { region };

  if (profile) {
    clientConfig.credentials = fromIni({ profile });
  } else if (key && secret) {
    clientConfig.credentials = {
      accessKeyId: key,
      secretAccessKey: secret,
      sessionToken: st || undefined,
    };
  }

  if (!userpool) {
    const cognitoISP = new CognitoIdentityProviderClient(clientConfig);
    const response = await cognitoISP.send(
      new ListUserPoolsCommand({ MaxResults: 60 })
    );
    const UserPools = response.UserPools;
    // TODO: handle data.NextToken when exceeding the MaxResult limit

    const userPoolList =
      (UserPools &&
        UserPools.map((el) => ({ name: el.Name || "", value: el.Id || "" }))) ||
      [];

    if (!userPoolList.length)
      throw Error(
        `No userpool found in this region. Are you sure the pool is in "${region}".`
      );

    if (mode === "backup")
      userPoolList.unshift({
        name: chalk.magentaBright.bold("ALL"),
        value: "all",
      });

    const searchCognitoPool = async (_: any, input: string) => {
      input = input || "";

      const fuzzyResult = fuzzy.filter(input, userPoolList, {
        extract: (el) => el.value,
      });
      return fuzzyResult.map((el) => {
        return el.original;
      });
    };

    // choose your cognito pool from the region you selected
    const cognitoPoolChoice = await inquirer.prompt<{ selected: string }>({
      type: "autocomplete",
      name: "selected",
      message: "Choose your Cognito Pool",
      source: searchCognitoPool,
      pageSize: 60,
    } as any);

    userpool = cognitoPoolChoice.selected;
  }

  if (mode === "backup" && !directory) {
    const directoryLocation = await inquirer.prompt<{ selected: string }>({
      type: "input",
      name: "selected",
      message: "Enter the backup directory path:",
      default: "./backup",
    });

    directory = directoryLocation.selected;
  }

  if (mode === "restore" && !file) {
    const fileLocation = await inquirer.prompt<{ selected: string }>({
      type: "input",
      name: "selected",
      message: "Enter the JSON backup file path:",
    });

    file = fileLocation.selected;
  }

  if (mode === "restore" && passwordModulePath) {
    try {
      const pwdModule = require(passwordModulePath);
      if (typeof pwdModule.getPwdForUsername !== "function") {
        throw Error(
          `Cannot find getPwdForUsername(username: String) in password module "${passwordModulePath}".`
        );
      }
    } catch (e) {
      throw Error(`Cannot load password module path "${passwordModulePath}".`);
    }
  }
  return {
    st,
    mode,
    profile,
    region,
    key,
    secret,
    userpool,
    directory,
    file,
    password,
    passwordModulePath,
    delay,
  };
};

export const options = verifyOptions();
