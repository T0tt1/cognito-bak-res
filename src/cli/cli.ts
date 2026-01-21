#!/usr/bin/env node

import {
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { fromIni } from "@aws-sdk/credential-providers";
import ora from "ora";

import chalk from "chalk";
import { backupUsers, restoreUsers } from "../index";
import { options } from "./options";

const red = chalk.red;
const green = chalk.green;
const orange = chalk.keyword("orange");

(async () => {
  let spinner = ora({ spinner: "dots4", hideCursor: true });
  try {
    const {
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
      st,
    } = await options;

    // Build client configuration
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

    const cognitoISP = new CognitoIdentityProviderClient(clientConfig);

    if (mode === "backup") {
      spinner = spinner.start(orange`Backing up userpool`);
      await backupUsers(cognitoISP, userpool as string, directory as string, delay);
      spinner.succeed(green(`JSON Exported successfully to ${directory}/\n`));
    } else if (mode === "restore") {
      spinner = spinner.start(orange`Restoring userpool`);
      await restoreUsers(
        cognitoISP,
        userpool as string,
        file as string,
        password,
        passwordModulePath
      );
      spinner.succeed(green(`Users imported successfully to ${userpool}\n`));
    } else {
      spinner.fail(
        red`Mode passed is invalid, please make sure a valid command is passed here.\n`
      );
    }
  } catch (error: any) {
    spinner.fail(red(error.message));
  }
})();
