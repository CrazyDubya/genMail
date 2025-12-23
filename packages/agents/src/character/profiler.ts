// packages/simulation/src/tick.ts

interface TickResult {
  newWorld: WorldState;
  emails: Email[];
  events: SimulatedEvent[];
  metrics: TickMetrics;
}

async function runSimulation(
  world: WorldState,
  targetEmails: number,
  timeoutMs: number
): Promise<TickResult[]> {
  const results: TickResult[] = [];
  let currentWorld = world;
  let totalEmails = 0;
  const startTime = Date.now();
  
  while (totalEmails < targetEmails && (Date.now() - startTime) < timeoutMs) {
    // Calculate optimal tick duration
    const tickDuration = calculateTickDuration(currentWorld);
    
    // Plan what happens this tick
    const events = await planTickEvents(currentWorld, tickDuration);
    
    // Generate emails from events (parallel, respecting voice bindings)
    const emails = await generateEmailsFromEvents(events, currentWorld);
    
    // Update world state
    currentWorld = updateWorldState(currentWorld, events, emails);
    
    results.push({
      newWorld: currentWorld,
      emails,
      events,
      metrics: {
        tickDuration,
        emailsGenerated: emails.length,
        tensionsResolved: countResolvedTensions(events),
        newTensions: countNewTensions(events)
      }
    });
    
    totalEmails += emails.length;
  }
  
  return results;
}
