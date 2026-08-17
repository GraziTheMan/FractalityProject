// core/agent_systems/ExecutiveAgent.js
//
// The decision-making vertex of the triad. TriadicConsciousnessEngine calls
// decide() every tick with the current perception plus the ReflectiveAgent's
// assessment, and calls feedback() afterwards with the realised result.
//
// Contract required by TriadicConsciousnessEngine:
//   decide(perception, reflection) -> { action, requiresCreativity, ... }
//   feedback(decision, result)     -> void (optional)

export class ExecutiveAgent {
  constructor(options = {}) {
    // Below this coherence the system prefers consolidating over exploring
    this.coherenceFloor = options.coherenceFloor ?? 0.35;
    // Below this energy, expensive creative work is skipped
    this.energyFloor = options.energyFloor ?? 0.25;
    // Reflection trust under this threshold triggers a re-evaluation
    this.trustFloor = options.trustFloor ?? 0.3;

    this.decisionLog = [];
    this.maxLogSize = options.maxLogSize ?? 100;
  }

  /**
   * Choose the next action from the current state.
   * @param {{energy:number, coherence:number, userIntent:string}} perception
   * @param {{recentAction:*, trustScore:number, notes:string}} reflection
   */
  decide(perception = {}, reflection = {}) {
    const energy = perception.energy ?? 1;
    const coherence = perception.coherence ?? 1;
    const trust = reflection.trustScore ?? 1;

    let action;
    let rationale;
    let requiresCreativity = false;

    if (coherence < this.coherenceFloor) {
      // Fragmented state: stabilise before doing anything ambitious
      action = 'consolidate';
      rationale = `coherence ${coherence.toFixed(2)} below floor ${this.coherenceFloor}`;
    } else if (trust < this.trustFloor) {
      // Reflection distrusts the last action: re-examine rather than proceed
      action = 'reassess';
      rationale = `reflection trust ${trust.toFixed(2)} below floor ${this.trustFloor}`;
    } else if (energy < this.energyFloor) {
      // Healthy but tired: keep going cheaply
      action = 'maintain';
      rationale = `energy ${energy.toFixed(2)} below floor ${this.energyFloor}`;
    } else {
      // Resources and confidence available: explore, and allow the
      // GenerativeAgent to propose variations
      action = 'explore';
      rationale = 'energy and coherence within operating range';
      requiresCreativity = true;
    }

    const decision = {
      action,
      rationale,
      requiresCreativity,
      intent: perception.userIntent ?? null,
      basis: { energy, coherence, trust },
      timestamp: Date.now()
    };

    this._log(decision);
    return decision;
  }

  /**
   * Receive the realised result of a decision.
   * Nudges the floors so repeated low-value outcomes make the agent
   * more conservative, and good outcomes relax it again.
   */
  feedback(decision, result) {
    if (!decision) return;

    const creativity = result?.creativityScore;
    if (typeof creativity !== 'number') return;

    if (creativity < 0.25) {
      // Exploration is not paying off; raise the bar for it
      this.energyFloor = Math.min(0.6, this.energyFloor + 0.02);
    } else if (creativity > 0.75) {
      this.energyFloor = Math.max(0.1, this.energyFloor - 0.02);
    }
  }

  /**
   * Most recent decisions, newest last.
   */
  getHistory(limit = 10) {
    return this.decisionLog.slice(-limit);
  }

  _log(decision) {
    this.decisionLog.push(decision);
    if (this.decisionLog.length > this.maxLogSize) {
      this.decisionLog.shift();
    }
  }
}
