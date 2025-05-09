import { Anthropic } from "@anthropic-ai/sdk";
import {
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";

import dotenv from "dotenv";
import { logger, logPrettyJson, logToolUse } from "./logs.js";
import { OpenAI } from "openai";

dotenv.config(); // load environment variables from .env

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  logger.error("ANTHROPIC_API_KEY is not set");
  throw new Error("ANTHROPIC_API_KEY is not set");
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  logger.error("OPENAI_API_KEY is not set");
  throw new Error("OPENAI_API_KEY is not set");
}


class MCPClient {
  private mcp: Client;
  private openai: OpenAI;
  private anthropic: Anthropic;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];

  constructor() {
    // Initialize Anthropic client and MCP client
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  async connectToServer(serverScriptPath: string) {
    /**
     * Connect to an MCP server
     *
     * @param serverScriptPath - Path to the server script (.py or .js)
     */
    try {
      // Determine script type and appropriate command
      const isJs = serverScriptPath.endsWith(".js");
      const isPy = serverScriptPath.endsWith(".py");
      if (!isJs && !isPy) {
        logger.error("Server script must be a .js or .py file");
        throw new Error("Server script must be a .js or .py file");
      }
      const command = isPy
        ? process.platform === "win32"
          ? "python"
          : "python3"
        : process.execPath;

      // Initialize transport and connect to server
      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });
      logger.info(`Attempting to connect to server using script: ${serverScriptPath}`);
      this.mcp.connect(this.transport);

      // List available tools
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      logger.info(`Connected to server. Tools: ${this.tools.map(({ name }) => name).join(", ")}`);
      this.tools.forEach((tool) => {
        console.log('==========================');
        console.log(tool);
        console.log(tool.input_schema);
        console.log(tool.input_schema.properties);
        console.log(tool.input_schema.required);
      });

      console.log(
        "Connected to server with tools:",
        this.tools.map(({ name }) => name),
      );
    } catch (e) {
      logger.error(`Failed to connect to MCP server: ${e instanceof Error ? e.message : e}`);
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  async processQuery(llm: "claude" | "openai", query: string) {
    logger.info(`Received user query: ${query} (LLM: ${llm})`);
    if (llm === "claude") {
      return await this.handleClaudeQuery(query);
    } else if (llm === "openai") {
      return await this.handleOpenAIQuery(query);
    }
    throw new Error("Unknown or unimplemented LLM specified");
  }

  private async handleClaudeQuery(query: string): Promise<string> {
    const finalText: string[] = [];
    const messages: MessageParam[] = [
      { role: "user", content: query },
    ];
    let userTool = true;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      while (userTool) {
        logger.debug(`🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉 🎉🎉🎉🎉🎉🎉 🎉🎉🎉🎉🎉continue the loop🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉 🎉🎉🎉🎉🎉🎉 🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉 `);
        logPrettyJson("DEBUG", `Sending Claude API call`, messages);
        const answer = (await rl.question("About to call Claude, continue? (y/n): ")).trim().toLowerCase();
        if (answer !== "y") {
          rl.close();
          logger.info("User chose not to continue with Claude API call. Exiting Claude tool-use loop.");
          break;
        }

        const response: Anthropic.Messages.Message = await this.anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          messages,
          tools: this.tools,
        });

        const toolResults = [];
        logPrettyJson("DEBUG", "Claude response", response);
        logger.debug(`num of response content: ${response.content.length}`);
        logger.debug(`🔨🔨🔨nums of tools to use ${response.content.filter((content) => content.type === "tool_use").length}`);
        logger.debug(`🔨🔨🔨names of tools to use ${response.content.filter((content) => content.type === "tool_use").map((content) => content.name).join("🔨🔨\n")}`);
        userTool = response.content.filter((content) => content.type === "tool_use").length > 0;
        // process response
        for (const content of response.content) {
          if (content.type === "text") {
            logger.debug(`a text content`);
            logger.debug(`Claude response text: ${content.text}`);
            finalText.push(content.text);
          } else if (content.type === "tool_use") {
            logger.debug(`a tool use content ${JSON.stringify(content)}`);
            // Execute tool call
            const toolName = content.name;
            const toolArgs = content.input as { [x: string]: unknown } | undefined;
            logger.info(`Calling tool: ${toolName} with args: ${JSON.stringify(toolArgs)}`);
            logToolUse(toolName);
            try {
              const result = await this.mcp.callTool({
                name: toolName,
                arguments: toolArgs,
              });
              logger.info(`Tool ${toolName} called and returned result`);
              toolResults.push(result);
              finalText.push(`[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`);
              // Continue conversation with tool results
              messages.push({
                role: "user",
                content: result.content as string,
              });
              // );
            } catch (e) {
              logger.error(`Error during tool call: ${e instanceof Error ? e.message : e}`);
              finalText.push(`[Error calling tool ${toolName}: ${e instanceof Error ? e.message : e}]`);
            }
            // );
          }
        }
      }
    } catch (e) {
      logger.error(`Error during tool call: ${e instanceof Error ? e.message : e}`);
    }
    return finalText.join("\n");
  }

  private async handleOpenAIQuery(query: string): Promise<string> {
    // Placeholder for OpenAI logic. You can move the commented OpenAI block here if needed.
    throw new Error("OpenAI tool-use logic not implemented in this refactor.");
    //   let finalText = [];
    //   let toolResults = [];
    //   while (keepGoing) {
    //     const completion = await this.openai.chat.completions.create({
    //       model: "gpt-3.5-turbo-1106", // Use a model that supports tools (functions)
    //       messages,
    //       tools: this.tools.map(({ name, description, input_schema }) => ({
    //         type: "function",
    //         function: {
    //           name,
    //           description,
    //           parameters: input_schema,
    //         },
    //       })),
    //       tool_choice: "auto",
    //     });
    //     const choice = completion.choices[0];
    //     const msg = choice.message;
    //     if (msg.tool_calls && msg.tool_calls.length > 0) {
    //       for (const toolCall of msg.tool_calls) {
    //         const toolName = toolCall.function.name;
    //         const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
    //         logger.info(`Calling tool: ${toolName} with args: ${JSON.stringify(toolArgs)}`);
    // logToolUse(toolName);
    //         try {
    //           const result = await this.mcp.callTool({
    //             name: toolName,
    //             arguments: toolArgs,
    //           });
    //           logger.info(`Tool ${toolName} called and returned result`);
    //           toolResults.push(result);
    //           finalText.push(`[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`);
    //           // Continue conversation with tool results
    //           messages.push({
    //             role: "tool",
    //             tool_call_id: toolCall.id,
    //             content: result.content as string,
    //           });
    //         } catch (e) {
    //           logger.error(`Error during tool call: ${e instanceof Error ? e.message : e}`);
    //           finalText.push(`[Error calling tool ${toolName}: ${e instanceof Error ? e.message : e}]`);
    //         }
    //       }
    //     } else if (msg.content) {
    //       logger.debug(`OpenAI response text: ${msg.content}`);
    //       finalText.push(msg.content);
    //       keepGoing = false;
    //     } else {
    //       keepGoing = false;
    //     }
    //   }
    //   return finalText.join("\n");
    // } else {
    //   throw new Error("Unknown LLM specified");
    // }
  }

  async chatLoop() {
    /**
     * Run an interactive chat loop
     */
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let llm: "openai" | "claude" | null = null;
    try {
      logger.info("MCP Client Started!");
      console.log("\nMCP Client Started!");
      // Ask once at the beginning
      while (!llm) {
        const llmInput = (await rl.question("Which LLM? (openai/claude): ")).trim().toLowerCase();
        if (llmInput === "quit") {
          rl.close();
          process.exit(0);
        }
        if (llmInput === "openai" || llmInput === "claude") {
          llm = llmInput as "openai" | "claude";
        } else {
          console.log("Please enter 'openai' or 'claude'.");
        }
      }
      console.log("Type your queries or 'quit' to exit.");
      while (true) {
        const message = await rl.question("Query: ");
        logger.info(`User input: ${message}`);
        if (message.toLowerCase() === "quit") {
          logger.info("User exited chat loop.");
          break;
        }
        try {
          const response = await this.processQuery(llm, message);
          logger.info(`Response: ${response}`);
          console.log("\n" + response);
        } catch (e) {
          logger.error(`Error processing query: ${e instanceof Error ? e.message : e}`);
          console.log("Error processing query:", e);
        }
      }
    } finally {
      logger.info("Closing readline interface.");
      rl.close();
    }
  }

  async cleanup() {
    /**
     * Clean up resources
     */
    logger.info("Cleaning up MCP client resources.");
    await this.mcp.close();
  }
}

async function main() {
  if (process.argv.length < 3) {
    logger.warn("No server script provided as argument.");
    console.log("Usage: node build/index.js <path_to_server_script>");
    return;
  }
  const mcpClient = new MCPClient();
  try {
    //1. Connect to the server
    await mcpClient.connectToServer(process.argv[2]);
    //2. Run the chat loop
    await mcpClient.chatLoop();
  } catch (e) {
    logger.error(`Fatal error in main: ${e instanceof Error ? e.message : e}`);
    throw e;
  } finally {
    //3. Clean up resources
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();
