// pages/content/src/components/sidebar/Instructions/instructionPipeline.ts
import { generateInstructionsCompact } from './instructionGeneratorCompact';
import { generateInstructionsJson } from './instructionGeneratorJson';

export interface InstructionTool {
  name: string;
  schema: string;
  description: string;
}

/**
 * Single entry point used by the Instructions panel to build the initial instruction text.
 * Keeps the prompt-mode switch and the optional RTK section on the same production path.
 */
export const generateInstructionsForMode = (
  mode: 'full' | 'compact',
  tools: InstructionTool[],
  customInstructions?: string,
  customInstructionsEnabled?: boolean,
  useRtkWithWebCodex?: boolean,
): string =>
  mode === 'full'
    ? generateInstructionsJson(tools, customInstructions, customInstructionsEnabled, useRtkWithWebCodex)
    : generateInstructionsCompact(tools, customInstructions, customInstructionsEnabled, useRtkWithWebCodex);

/**
 * Maps the persisted instruction preferences exactly as the Instructions panel does, so
 * the opt-in flag travels with the same path as custom instructions and prompt mode.
 */
export const generateInstructionsForPreferences = (
  preferences: {
    promptMode: 'full' | 'compact';
    customInstructions?: string;
    customInstructionsEnabled?: boolean;
    useRtkWithWebCodex?: boolean;
  },
  tools: InstructionTool[],
): string =>
  generateInstructionsForMode(
    preferences.promptMode,
    tools,
    preferences.customInstructions,
    preferences.customInstructionsEnabled,
    preferences.useRtkWithWebCodex,
  );
