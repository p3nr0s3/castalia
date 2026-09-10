// lib/toolEngine.ts

/**
 * @file Centralized engine for executing tool calls.
 * This class abstracts the network interaction with the backend API route (app/api/tools/execute).
 * It ensures that tool calls are handled securely and provides a unified interface for the chat application.
 */

import { ToolCallResult, ToolCallArgs } from './types'; // Assume types are defined here
import { ToolExecutionError } from './types'; // Assume error types are defined here

const TOOL_EXECUTION_API = '/api/tools/execute';

/**
 * Executes a single tool call via the secure backend API endpoint.
 * @param toolName - The name of the tool to execute.
 * @param args - The arguments for the tool, parsed from the model's tool call.
 * @returns A promise resolving to the ToolCallResult object.
 * @throws ToolExecutionError if the API call fails or returns an error.
 */
export async function executeToolCall(toolName: string, args: Record<string, any>): Promise<ToolCallResult> {
    console.log(\[ToolEngine] Attempting to execute tool: \\);

    try {
        // 1. Construct the payload matching the structure expected by app/api/tools/execute/route.ts
        const payload = {
            toolName: toolName,
            args: args
        };

        // 2. Call the API route
        const response = await fetch(TOOL_EXECUTION_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        // 3. Handle non-200 responses (e.g., 400, 500 from the backend)
        if (!response.ok) {
            const errorBody = await response.json();
            throw new ToolExecutionError(\API call failed with status \: \\);
        }

        // 4. Parse and return the structured result
        const jsonResponse = await response.json();

        if (!jsonResponse.success) {
            throw new ToolExecutionError(jsonResponse.error || 'Tool execution failed due to unknown server error.');
        }

        // Return the successful result payload
        return {
            success: true,
            toolCallResult: jsonResponse.data, // The actual content/data returned by the tool
            executionMessage: jsonResponse.result, // The message to relay to the user
            toolName: toolName,
            // Add any necessary metadata
        };

    } catch (error) {
        // Catch network errors, serialization errors, or thrown ToolExecutionError
        if (error instanceof ToolExecutionError) {
            console.error(\[ToolEngine] Tool Error: \\);
            throw error; // Re-throw the specific tool error
        }
        console.error(\[ToolEngine] Fatal Error during execution: \\);
        throw new ToolExecutionError(\A critical error occurred while attempting to run tool '\': \\);
    }
}

/**
 * Helper function to gracefully handle and display tool failure to the user.
 * @param error - The ToolExecutionError object.
 * @returns A markdown-formatted error message for the chat output.
 */
export function formatToolError(error: ToolExecutionError): string {
    console.error(\[ToolEngine] Formatting error for user: \\);
    return (
        \\n\n?? **Tool Execution Error:**\n\n\ + 
        \Failed to complete the requested operation. Please check the input arguments and paths. Details: \ + 
        \\\\n\ + error.message + \\\\n\ + 
        *Internal Note: The underlying system reports an issue, stopping the process.*\
    );
}

/**
 * @example
 * // Assume tool call data is received from the model
 * const toolName = 'read_file';
 * const args = { path: './data/config.txt' };
 * try {
 *     const result = await executeToolCall(toolName, args);
 *     // Process success result
 * } catch (e) {
 *     // Handle error
 * }
 */
// End of lib/toolEngine.ts

