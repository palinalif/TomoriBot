function createScreamingRegex(trigger) {
  let pattern = "";
  for (const char of trigger) {
    if (/[a-zA-Z]/.test(char)) pattern += `${char}+`;
    else pattern += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`\\b${pattern}\\b`, "i");
}
function createDeliberateTriggerRegex(trigger) {
  let pattern = "";
  for (const char of trigger) {
    if (/[a-zA-Z]/.test(char)) pattern += `${char}+`;
    else if (/\s/.test(char)) pattern += "\\s+";
    else pattern += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`@${pattern}`, "i");
}

function getDeliberateTriggerMatch(content, trigger) {
  const fullTriggerMatch = content.match(createDeliberateTriggerRegex(trigger));
  if (fullTriggerMatch) return fullTriggerMatch;

  const firstTriggerWord = trigger.split(/\s+/)[0]?.trim() ?? trigger;
  if (!firstTriggerWord || firstTriggerWord === trigger) return null;

  const hasFullTriggerMatch = createScreamingRegex(trigger).test(content);
  if (!hasFullTriggerMatch) return null;

  return content.match(createDeliberateTriggerRegex(firstTriggerWord));
}

// Mirror TomoriBot's shared deliberate-trigger rule for a multi-word trigger.
const trigger = "Evil Lilya";
for (const content of ["@Evil Lilya", "Evil Lilya", "@Evil", "@Evil Lilya sup"]) {
  const plainRegex = createScreamingRegex(trigger);
  const matched = plainRegex.test(content);
  const deliberateMatch = getDeliberateTriggerMatch(content, trigger);
  const isDeliberate = deliberateMatch !== null;
  console.log(`content="${content}" matched=${matched} isDeliberate=${isDeliberate}`);
}

// Simulate getTriggerFirstMatchIndex(..., deliberateOnly=true) with the same helper.
console.log("\n--- Deliberate Match Index ---");
for (const content of ["@Evil Lilya", "Evil Lilya", "@Evil", "@Evil Lilya sup"]) {
  const match = getDeliberateTriggerMatch(content, trigger);
  console.log(`content="${content}" matchIndex=${match?.index ?? "INFINITY"}`);
}
