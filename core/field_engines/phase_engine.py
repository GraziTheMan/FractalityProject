"""
phase_engine.py

Phase-state maths for consciousness users, after the Ice XVIII (superionic ice)
analogy: users move from SOLID (fixed patterns) through LIQUID (fluid
engagement) to SUPERIONIC (structure and flow at once).

ConsciousnessUser calls into this module from _check_phase_transition() and
calculate_resonance_with(). The thresholds themselves live on
ConsciousnessUser (LIQUID_THRESHOLD / SUPERIONIC_THRESHOLD) so that the user
model stays the single source of truth for its own tuning constants.
"""

from core.users.consciousness_user import ConsciousnessUser, UserPhase

# Frequency every user starts at; phase is driven by the *gain* above this,
# not the absolute value, so a brand-new user reads as SOLID.
BASE_FREQUENCY_HZ = 432.0


def phase_potential(energy_level: float, resonance_frequency: float) -> float:
    """
    The quantity the phase thresholds are expressed in: energy times the
    frequency gained above baseline.

    Using the gain rather than the raw frequency matters. A new user sits at
    exactly BASE_FREQUENCY_HZ, so their potential is 0 and they are SOLID;
    they only liquefy once they have actually generated resonance.
    """
    frequency_gain = max(0.0, resonance_frequency - BASE_FREQUENCY_HZ)
    return max(0.0, energy_level) * frequency_gain


def calculate_phase_state(energy_level: float, resonance_frequency: float) -> UserPhase:
    """
    Map an energy/frequency pair onto a phase state.

    >>> calculate_phase_state(100.0, 432.0) is UserPhase.SOLID
    True
    """
    potential = phase_potential(energy_level, resonance_frequency)

    if potential >= ConsciousnessUser.SUPERIONIC_THRESHOLD:
        return UserPhase.SUPERIONIC
    if potential >= ConsciousnessUser.LIQUID_THRESHOLD:
        return UserPhase.LIQUID
    return UserPhase.SOLID


def calculate_resonance_score(user_a, user_b) -> float:
    """
    Resonance between two users, in 0.0 - 1.0.

    Three contributions:
      * harmonic proximity of their frequencies,
      * any resonance already exchanged between them,
      * phase compatibility (same phase resonates most readily).
    """
    if user_a is None or user_b is None:
        return 0.0
    if getattr(user_a, 'consciousness_id', None) == getattr(user_b, 'consciousness_id', None):
        return 1.0

    # --- harmonic proximity -------------------------------------------------
    freq_a = getattr(user_a, 'resonance_frequency', BASE_FREQUENCY_HZ)
    freq_b = getattr(user_b, 'resonance_frequency', BASE_FREQUENCY_HZ)

    if freq_a <= 0 or freq_b <= 0:
        harmonic = 0.0
    else:
        ratio = max(freq_a, freq_b) / min(freq_a, freq_b)
        # Distance to the nearest whole-number harmonic (1:1, 2:1, 3:1, ...)
        harmonic_distance = abs(ratio - round(ratio))
        harmonic = max(0.0, 1.0 - harmonic_distance * 4)

    # --- existing connection -----------------------------------------------
    connections_a = getattr(user_a, 'resonance_connections', {}) or {}
    connections_b = getattr(user_b, 'resonance_connections', {}) or {}
    exchanged = (
        connections_a.get(getattr(user_b, 'consciousness_id', None), 0.0)
        + connections_b.get(getattr(user_a, 'consciousness_id', None), 0.0)
    )
    # Saturating: the first exchanges matter most
    connection = 1.0 - (0.99 ** max(0.0, exchanged))

    # --- phase compatibility ------------------------------------------------
    phase_a = getattr(user_a, 'phase_state', UserPhase.SOLID)
    phase_b = getattr(user_b, 'phase_state', UserPhase.SOLID)

    if phase_a == phase_b:
        phase_match = 1.0
    elif UserPhase.SUPERIONIC in (phase_a, phase_b):
        # Superionic users couple well with anyone: they carry both
        # structure and flow
        phase_match = 0.75
    else:
        phase_match = 0.5

    score = 0.45 * harmonic + 0.35 * connection + 0.20 * phase_match
    return round(min(1.0, max(0.0, score)), 4)
