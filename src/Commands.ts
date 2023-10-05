import { ConfigurationTarget, workspace } from "vscode";

const configuration = workspace.getConfiguration();
const target = ConfigurationTarget.Global;

function setExtensionStatus(enabled: boolean) {
    console.debug("Setting rhpilot state to", enabled);
    configuration.update('rhpilot.enabled', enabled, target, false).then(console.error);
}

export type Command = { command: string, callback: (...args: any[]) => any, thisArg?: any };

export const turnOnrhpilot: Command = {
    command: "rhpilot.enable",
    callback: () => setExtensionStatus(true)
};

export const turnOffrhpilot: Command = {
    command: "rhpilot.disable",
    callback: () => setExtensionStatus(false)
};
