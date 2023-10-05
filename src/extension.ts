// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, ExtensionContext, languages, StatusBarAlignment, window, workspace} from 'vscode';
import { turnOffrhpilot, turnOnrhpilot } from './Commands';
import { rhpilotCompletionProvider } from './rhpilotCompletionProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	console.debug("Registering rhpilot provider", new Date());

	const statusBar = window.createStatusBarItem(StatusBarAlignment.Right);
	statusBar.text = "$(light-bulb)";
	statusBar.tooltip = `rhpilot - Ready`;

	const statusUpdateCallback = (callback: any, showIcon: boolean) => async () => {
		await callback();
		if (showIcon) {
			statusBar.show();
		} else {
			statusBar.hide();
		}
	};

	context.subscriptions.push(
		languages.registerInlineCompletionItemProvider(
			{ pattern: "**" }, new rhpilotCompletionProvider(statusBar)
		),

		commands.registerCommand(turnOnrhpilot.command, statusUpdateCallback(turnOnrhpilot.callback, true)),
		commands.registerCommand(turnOffrhpilot.command, statusUpdateCallback(turnOffrhpilot.callback, false)),
		statusBar
	);

	if (workspace.getConfiguration('rhpilot').get("enabled")) {
		statusBar.show();
	}
}

// this method is called when your extension is deactivated
export function deactivate() {
	console.debug("Deactivating rhpilot provider", new Date());
}