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


async def generate_directors_cut() -> Dict[str, Any]:
    """
    Generate a comparative 'Director's Cut' analysis of all takes.
    Identifies per-take strengths, weaknesses, and gives actionable
    advice for the next recording session.
    """
    takes: List[Dict] = session_store["takes"]
    if not takes:
        return {"status": "no_takes", "insights": [], "verdict": "No takes recorded yet."}

    if len(takes) == 1:
        t = takes[0]
        ec_note = "Great eye contact!" if t["eye_contact_pct"] >= 70 else "Try looking directly at the lens more."
        en_note = "High energy throughout." if t["energy_score"] >= 6 else "Bring more energy and movement."
        return {
            "status": "single_take",
            "insights": [
                {
                    "take": t["take_number"],
                    "strength": ec_note if t["eye_contact_pct"] >= 70 else en_note,
                    "weakness": en_note if t["energy_score"] < 6 else ec_note,
                    "score": t["composite_score"],
                }
            ],
            "verdict": (
                f"Only one take recorded. Eye contact: {t['eye_contact_pct']:.0f}%, "
                f"Energy: {t['energy_score']:.1f}/10. "
                f"Film a second take to unlock comparative analysis."
            ),
            "next_take_advice": f"{ec_note} {en_note}",
        }

    # Multi-take comparative analysis
    best = max(takes, key=lambda t: t["composite_score"])
    worst = min(takes, key=lambda t: t["composite_score"])
    best_ec = max(takes, key=lambda t: t["eye_contact_pct"])
    best_en = max(takes, key=lambda t: t["energy_score"])
    most_smiles = max(takes, key=lambda t: t["smile_count"])

    insights = []
    for t in takes:
        strengths = []
        weaknesses = []

        if t["eye_contact_pct"] >= 70:
            strengths.append(f"Strong eye contact ({t['eye_contact_pct']:.0f}%)")
        elif t["eye_contact_pct"] < 50:
            weaknesses.append(f"Low eye contact ({t['eye_contact_pct']:.0f}%)")

        if t["energy_score"] >= 6:
            strengths.append(f"High energy ({t['energy_score']:.1f}/10)")
        elif t["energy_score"] < 4:
            weaknesses.append(f"Low energy ({t['energy_score']:.1f}/10)")

        if t["smile_count"] >= 3:
            strengths.append(f"{t['smile_count']} genuine smiles")
        elif t["smile_count"] == 0:
            weaknesses.append("No smiles detected")

        insights.append({
            "take": t["take_number"],
            "score": t["composite_score"],
            "strengths": strengths,
            "weaknesses": weaknesses,
            "is_best": t["take_number"] == best["take_number"],
        })

    # Build the verdict
    parts = [f"Take {best['take_number']} is your best overall (score: {best['composite_score']:.1f}/10)."]

    if best_ec["take_number"] != best["take_number"]:
        parts.append(
            f"Take {best_ec['take_number']} had the best eye contact ({best_ec['eye_contact_pct']:.0f}%)."
        )
    if best_en["take_number"] != best["take_number"]:
        parts.append(
            f"Take {best_en['take_number']} had the highest energy ({best_en['energy_score']:.1f}/10)."
        )

    # Build next-take advice by combining the best attributes
    advice_parts = []
    if best_ec["take_number"] != best_en["take_number"]:
        advice_parts.append(
            f"Combine Take {best_ec['take_number']}'s eye contact "
            f"with Take {best_en['take_number']}'s energy for a perfect take."
        )
    if worst["eye_contact_pct"] < 50:
        advice_parts.append("Focus on looking directly at the lens, not the screen.")
    if worst["energy_score"] < 4:
        advice_parts.append("Move more, use hand gestures, and vary your vocal tone.")
    if not advice_parts:
        advice_parts.append("You're already looking great — one more take to nail the timing.")

    return {
        "status": "analyzed",
        "total_takes": len(takes),
        "insights": insights,
        "verdict": " ".join(parts),
        "next_take_advice": " ".join(advice_parts),
        "best_take": best["take_number"],
        "highlight_reel": {
            "best_eye_contact": {"take": best_ec["take_number"], "value": best_ec["eye_contact_pct"]},
            "best_energy": {"take": best_en["take_number"], "value": best_en["energy_score"]},
            "most_smiles": {"take": most_smiles["take_number"], "value": most_smiles["smile_count"]},
        },
    }
