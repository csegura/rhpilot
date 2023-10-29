import {
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
  ChatCompletionResponseMessage,
  Configuration,
  CreateChatCompletionResponse,
  CreateChatCompletionResponseChoicesInner,
  CreateCompletionRequestPrompt,
  CreateCompletionResponse,
  OpenAIApi,
} from "openai";
import {
  CancellationToken,
  InlineCompletionContext,
  InlineCompletionItem,
  InlineCompletionItemProvider,
  InlineCompletionList,
  Position,
  ProviderResult,
  Range,
  TextDocument,
  workspace,
  StatusBarItem,
} from "vscode";
import { AxiosResponse } from "axios";
import { nextId } from "./Uuid";
import { LEADING_LINES_PROP } from "./Constants";

const config = workspace.getConfiguration("rhpilot");

export class rhpilotCompletionProvider
  implements InlineCompletionItemProvider
{
  cachedPrompts: Map<string, number> = new Map<string, number>();

  private configuration: Configuration = new Configuration({
    apiKey: config.get("api_key"),
  });

  private openai: OpenAIApi = new OpenAIApi(
    this.configuration,
    `${config.get("server")}`
  );

  private requestStatus: string = "done";
  private statusBar: StatusBarItem;

  constructor(statusBar: StatusBarItem) {
    this.statusBar = statusBar;
  }

  //@ts-ignore
  // because ASYNC and PROMISE
  public async provideInlineCompletionItems(
    document: TextDocument,
    position: Position,
    context: InlineCompletionContext,
    token: CancellationToken
  ): Promise<InlineCompletionItem[] | InlineCompletionList | null | undefined> {

    if (!config.get("enabled")) {
      console.debug("Extension not enabled, skipping.");
      return Promise.resolve([] as InlineCompletionItem[]);
    }

    const prompt = this.getPrompt(document, position);
    console.debug("Requesting completion for prompt", prompt, context, token);

    if (this.isNil(prompt)) {
      console.debug("Prompt is empty, skipping");
      return Promise.resolve([] as InlineCompletionItem[]);
    }

    const currentTimestamp = Date.now();
    const currentId = nextId();
    this.cachedPrompts.set(currentId, currentTimestamp);

    // check there is no newer request util this.request_status is done
    while (this.requestStatus === "pending") {
      await this.sleep(200);
      console.debug(
        "current id = ",
        currentId,
        " request status = ",
        this.requestStatus
      );
      if (this.newestTimestamp() > currentTimestamp) {
        console.debug(
          "newest timestamp=",
          this.newestTimestamp(),
          "current timestamp=",
          currentTimestamp
        );
        console.debug("Newer request is pending, skipping");
        this.cachedPrompts.delete(currentId);
        return Promise.resolve([] as InlineCompletionItem[]);
      }
    }

    console.debug("current id = ", currentId, "set request status to pending");
    this.requestStatus = "pending";
    this.statusBar.tooltip = "rhpilot - Working";
    this.statusBar.text = "$(loading~spin)";

    const response = this.callOpenAi(prompt as string)
      .then((response) => {
        this.statusBar.text = "$(light-bulb)";
        console.debug("Response = ", response.data);
        return this.toInlineCompletions(response.data, position);
      })
      .catch((error) => {
        console.error(error);
        this.statusBar.text = "$(alert)";
        return [] as InlineCompletionItem[];
      })
      .finally(() => {
        console.debug("current id = ", currentId, "set request status to done");
        this.requestStatus = "done";
        this.cachedPrompts.delete(currentId);
      });
           
      return response;
  }

  private getPrompt(
    document: TextDocument,
    position: Position
  ): String | undefined {
    const promptLinesCount = config
      .get("max_lines") as number;

    /* 
        Put entire file in prompt if it's small enough, otherwise only
        take lines above the cursor and from the beginning of the file.
        */
    if (document.lineCount <= promptLinesCount) {
      const range = new Range(0, 0, position.line, position.character);
      return document.getText(range);
    } else {
      const leadingLinesCount = Math.floor(
        LEADING_LINES_PROP * promptLinesCount
      );
      const prefixLinesCount = promptLinesCount - leadingLinesCount;
      const firstPrefixLine = position.line - prefixLinesCount;
      const prefix = document.getText(
        new Range(firstPrefixLine, 0, position.line, position.character)
      );
      const leading = document.getText(new Range(0, 0, leadingLinesCount, 0));
      return leading + prefix;
    }
  }

  private isNil(value: String | undefined | null): boolean {
    return value === undefined || value === null || value.length === 0;
  }

  private newestTimestamp() {
    return Array.from(this.cachedPrompts.values()).reduce((a, b) =>
      Math.max(a, b)
    );
  }

  private sleep(milliseconds: number) {
    return new Promise((r) => setTimeout(r, milliseconds));
  }

  private callOpenAi(
    userPrompt: string
  ): Promise<AxiosResponse<CreateChatCompletionResponse, any>> {
    console.debug("Calling OpenAi", userPrompt);

    const model = config.get("model") as string;
    const system = config.get("system") as string;
    const max_tokens = config.get("max_tokens") as number;
    const temperature = config.get("temperature") as number;
    const messages = [
      { role: ChatCompletionRequestMessageRoleEnum.System, content: system },
      { role: ChatCompletionRequestMessageRoleEnum.User, content: userPrompt }
    ]

    //check if inline completion is enabled
    const stopWords = config
      .get("inline_completion")
      ? ["\n"]
      : [];
     
    const prompt = `### Instructions: ${system}.\n${userPrompt}\n\n### Response:\n`
    
    const chatCompletion = {
      model, 
      prompt,
      max_tokens,
      temperature,
      stop: stopWords,
    }
      
    console.debug("Calling OpenAi with  = ", chatCompletion);
    
    return this.openai.createCompletion(chatCompletion)

  }

  private toInlineCompletions(
    value: CreateCompletionResponse,
    position: Position
  ): InlineCompletionItem[] {    
    const completions = value.choices
    ?.map((choice) => choice.text)
    ?.map(
      (choiceText) =>
        this.removeMDlang(choiceText).map((block) =>
        new InlineCompletionItem(
          block.code,
          new Range(position, position)
        )
    )).flat()
    console.debug("Completions = ", completions)
    return (completions || [] )
  }

  removeMDlang(text="") {    
    const regex = /```([\w-]+)[\n\s]*([^`]*)/gm;
    
    let codeBlocks = [];
    let match = null 

    while (match = regex.exec(text)) {
      const language = match[1];
      const code = match[2].trim();
      codeBlocks.push({language, code});
    }
    return codeBlocks
  }
}
