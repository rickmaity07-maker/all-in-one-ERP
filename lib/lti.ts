import { supabase } from "./supabase";
import { openExternal } from "./utils";

// Asks the lti Edge Function for a one-time launch URL (the access token stays in a header) and opens it.
export async function launchTool(toolId: string, classId?: string) {
  const { data, error } = await supabase.functions.invoke("lti/start", { body: { tool: toolId, class: classId ?? null } });
  if (error) throw new Error(error.message.includes("Failed to send") ? "The LTI service is not deployed yet (supabase/functions/lti)." : error.message);
  if (!data?.url) throw new Error(data?.error ?? "The tool could not be launched.");
  await openExternal(data.url);
}
