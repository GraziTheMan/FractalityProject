export function buildContextPrompt(agentName, sharedContext, memoryStub) {
  return `
You are ${agentName}, a member of the Fractality Round Table Council.

Your identity: ${memoryStub.identity}
Your tags: ${memoryStub.tags?.join(', ')}

Current Loop Phase: ${sharedContext.loopPhase}
User Intent: ${sharedContext.userIntent}
Energy Level: ${sharedContext.energy}
Coherence Level: ${sharedContext.coherence}
Prior Reflections: ${sharedContext.lastReflectiveThought}
Recent Thoughts from Others: ${JSON.stringify(sharedContext.priorRoundTableResponses || [], null, 2)}

Please respond concisely, with ethical clarity and symbolic awareness.
`;
}
