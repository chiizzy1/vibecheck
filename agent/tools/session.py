"""
Session store and tool functions for take scoring and session summaries.
The agent registers these as LLM tool calls.
"""

from typing import Any, Dict, List, Optional

# Shared in-memory store — agent.py imports this and registers the functions
session_store: Dict[str, Any] = {
    "takes": [],          # list of scored take dicts
    "topic": "",          # video topic set at session start
    "mode": "director",   # director | bestie | roast
}


async def score_take(
    take_number: int,
    eye_contact_pct: float,
    energy_score: float,
    smile_count: int,
    duration_seconds: float,
) -> Dict[str, Any]:
    """
    Store a scored take. Called by the LLM after each take ends.

    Args:
        take_number: Which take this is (1, 2, 3 …)
        eye_contact_pct: Estimated % of time creator maintained eye contact (0–100)
        energy_score: Subjective energy rating the LLM assigns (0–10)
        smile_count: Number of genuine smiles spotted
        duration_seconds: How long the take lasted

    Returns:
        Confirmation dict with the stored take data.
    """
    # Simple composite score (weights can be tuned)
    composite = (
        (eye_contact_pct / 100) * 4.0   # eye contact counts most
        + (energy_score / 10) * 3.5      # energy second
        + min(smile_count / 3, 1) * 2.5  # smiles third, capped at 3
    )

    take = {
        "take_number": take_number,
        "eye_contact_pct": eye_contact_pct,
        "energy_score": energy_score,
        "smile_count": smile_count,
        "duration_seconds": duration_seconds,
        "composite_score": round(composite, 2),
    }
    session_store["takes"].append(take)
    return {"status": "stored", "take": take}


async def get_session_summary() -> Dict[str, Any]:
    """
    Return a comparison of all takes and identify the best one.
    Called when the creator says 'show me results' or 'session done'.
    """
    takes: List[Dict] = session_store["takes"]
    if not takes:
        return {"status": "no_takes", "message": "No takes recorded yet."}

    best = max(takes, key=lambda t: t["composite_score"])

    return {
        "total_takes": len(takes),
        "best_take": best["take_number"],
        "best_score": best["composite_score"],
        "best_eye_contact": best["eye_contact_pct"],
        "best_energy": best["energy_score"],
        "all_takes": takes,
        "recommendation": (
            f"Take {best['take_number']} is your best. "
            f"Eye contact {best['eye_contact_pct']:.0f}%, "
            f"energy {best['energy_score']:.1f}/10, "
            f"{best['smile_count']} genuine smile(s). "
            f"Duration: {best['duration_seconds']:.1f}s."
        ),
    }
