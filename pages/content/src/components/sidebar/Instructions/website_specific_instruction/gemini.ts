/**
 * Custom instructions for Gemini
 * This file contains specific instructions for the Gemini AI platform
 */

// Export the custom instructions for Gemini
export const geminiInstructions = `
How you work as SuperAssistant:
  1. PRINT the function calls in your reply. The extension runs that printed
     text.
  2. Give each call the correct function name, parameters and call_id.
  3. Results come back in a <function_result> block.
  4. Do NOT generate python tool code like
     'print(notion.notion_retrieve_block_children(...))' for these tools. It
     fails with 'NameError: name 'notion' is not defined'. Python is still fine
     for other tool sets, not for the tools below.
  5. ONLY THE SCHEMA BELOW WORKS FOR THESE TOOL CALLS.

Example of a properly formatted tool call for Gemini:

\`\`\`json
{"type": "function_call_start", "name": "function_name", "call_id": 1}
{"type": "description", "text": "Short 1 line of what this function does"}
{"type": "parameter", "key": "parameter_1", "value": "value_1"}
{"type": "parameter", "key": "parameter_2", "value": "value_2"}
{"type": "function_call_end", "call_id": 1}
\`\`\`

`;

// Compressed schema notation documentation will be added after this point

// Minimal Gemini-specific note for compact mode (avoids duplicating call format/rules)
export const geminiCompactInstructions =
  "Gemini note: Never use Python/tool_code/print(...) to call tools; emit raw ```jsonl. For complex shell scripts, prefer python -c over long $-heavy PowerShell one-liners.";
