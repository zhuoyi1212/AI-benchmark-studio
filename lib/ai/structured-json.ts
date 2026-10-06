export function parseStructuredJson(content: string): unknown {
  const trimmed = content.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return JSON.parse(removeTrailingCommas(escapeStringControlCharacters(candidate)));
  }
}

function escapeStringControlCharacters(value: string) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (!inString) {
      output += character;
      if (character === '"') inString = true;
      continue;
    }
    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      output += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      output += character;
      inString = false;
      continue;
    }
    if (character === "\n") output += "\\n";
    else if (character === "\r") output += "\\r";
    else if (character === "\t") output += "\\t";
    else output += character;
  }
  return output;
}

function removeTrailingCommas(value: string) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === ",") {
      let lookahead = index + 1;
      while (lookahead < value.length && /\s/.test(value[lookahead]!)) lookahead += 1;
      if (value[lookahead] === "}" || value[lookahead] === "]") continue;
    }
    output += character;
  }
  return output;
}
