// lib/types.ts

/**
 * @file Shared type definitions used across the application (tool definitions, results, etc.).
 * This file ensures type consistency between the client-side logic and the model's expected output.
 */

// --- TOOL DEFINITION TYPES (Copied from tools.ts for consistency if needed) ---
export type ToolName = 'list_directory' | 'read_file' | 'write_file' | 'search_files';

export interface ToolSchema {
    description: string;
    parameters: {
        [key: string]: {
            type: 'string' | 'number' | 'boolean' | 'object';
            description: string;
            required: boolean;
        };
    };
}

// --- TOOL CALL ARGUMENT TYPES ---

/**
 * Defines the expected arguments structure for tool calls.
 * The model will pass toolName and args based on the function schemas.
 */
export interface ToolCallArgs {
    // Generic container for arguments passed to the tool
    [key: string]: any; 
}


// --- TOOL EXECUTION RESULT TYPES (Crucial for toolEngine and API communication) ---

/**
 * Represents the successful execution result of a tool.
 */
export interface ToolCallResult {
    success: boolean;
    /** The raw data returned by the tool (e.g., file content, directory array). */
    toolCallResult: any; 
    /** A human-readable summary or message of the successful action. */
    executionMessage: string;
    /** The name of the tool that was executed. */
    toolName: string;
}

/**
 * Defines the structure for an error that occurs during tool execution.
 */
export class ToolExecutionError extends Error {
    public readonly details: string;

    constructor(message: string, details: string) {
        super(message);
        this.name = 'ToolExecutionError';
        this.details = details;
        Object.setPrototypeOf(this, ToolExecutionError.prototype);
    }
}

// --- MODEL INTERACTION TYPES (Used in ChatInput/ChatMessage) ---

/**
 * Represents a structured message containing a request to use a tool.
 */
export interface ToolCallMessage {
    type: 'tool_call';
    toolName: ToolName;
    args: ToolCallArgs;
}

/**
 * Represents a final message that needs to be generated after tool output.
 */
export interface FinalResponse {
    type: 'tool_output';
    toolName: ToolName;
    result: any; // The successful output from the tool engine
    message: string; // The final, user-facing response text
}
// End of lib/types.ts

