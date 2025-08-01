import { Tool } from "../..";
import { EDIT_CODE_INSTRUCTIONS } from "../../llm/defaultSystemMessages";
import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";
import { NO_PARALLEL_TOOL_CALLING_INSRUCTION } from "./searchAndReplaceInFile";

export interface EditToolArgs {
  filepath: string;
  changes: string;
}

export const editFileTool: Tool = {
  type: "function",
  displayTitle: "Edit File",
  wouldLikeTo: "edit {{{ filepath }}}",
  isCurrently: "editing {{{ filepath }}}",
  hasAlready: "edited {{{ filepath }}}",
  group: BUILT_IN_GROUP_NAME,
  readonly: false,
  isInstant: false,
  function: {
    name: BuiltInToolNames.EditExistingFile,
    description: `Use this tool to edit an existing file. If you don't know the contents of the file, read it first.\n${EDIT_CODE_INSTRUCTIONS}\n${NO_PARALLEL_TOOL_CALLING_INSRUCTION}`,
    parameters: {
      type: "object",
      required: ["filepath", "changes"],
      properties: {
        filepath: {
          type: "string",
          description:
            "The path of the file to edit, relative to the root of the workspace.",
        },
        changes: {
          type: "string",
          description:
            "Any modifications to the file, showing only needed changes. Do NOT wrap this in a codeblock or write anything besides the code changes. In larger files, use brief language-appropriate placeholders for large unmodified sections, e.g. '// ... existing code ...'",
        },
      },
    },
  },
};
