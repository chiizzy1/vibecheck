"""
Caption generator tool — creates TikTok-ready captions and hashtags.
Called by the LLM at the end of a session.
"""

import os
from typing import Dict

# Aesthetic → hashtag bundles (extend as needed)
AESTHETIC_HASHTAGS: Dict[str, list] = {
    "dark academia":    ["#darkacademia", "#aesthetic", "#studywithme", "#booktok"],
    "clean girl":       ["#cleangirl", "#minimalvibes", "#grwm", "#softlife"],
    "cottagecore":      ["#cottagecore", "#cottageaesthetic", "#naturecore", "#softvibes"],
    "streetwear":       ["#streetwear", "#streetstyle", "#hypebeast", "#outfitcheck"],
    "y2k":              ["#y2kaesthetic", "#2000s", "#nostalgia", "#vintagefashion"],
    "indie sleaze":     ["#indiesleaze", "#2010s", "#vintagegrunge", "#aesthetic"],
    "coastal grandmother": ["#coastalgrandmother", "#quietluxury", "#elegance", "#minimal"],
    "default":          ["#fyp", "#foryou", "#viral", "#trending"],
}

UNIVERSAL_TAGS = ["#fyp", "#foryoupage", "#viral", "#trending", "#contentcreator"]

# Stored so server.py /session/results can return it to the frontend
_last_caption: Dict[str, str] = {}


async def generate_caption(vibe_description: str, video_topic: str) -> Dict[str, str]:
    """
    Generate a TikTok caption and hashtag set.

    Args:
        vibe_description: What aesthetic/vibe the creator is giving
                          (e.g. 'clean girl soft lighting', 'chaotic funny storytime')
        video_topic: What the video is about (e.g. 'missing my flight', 'GRWM for work')

    Returns:
        Dict with 'caption' and 'hashtags' keys.
    """
    vibe_lower = vibe_description.lower()

    # Pick matching aesthetic hashtag bundle
    matched_tags = AESTHETIC_HASHTAGS["default"]
    for aesthetic, tags in AESTHETIC_HASHTAGS.items():
        if aesthetic in vibe_lower:
            matched_tags = tags
            break

    # Build hashtag string
    all_tags = matched_tags + UNIVERSAL_TAGS
    # Deduplicate while preserving order
    seen = set()
    unique_tags = []
    for t in all_tags:
        if t not in seen:
            seen.add(t)
            unique_tags.append(t)

    hashtag_string = " ".join(unique_tags[:10])  # TikTok sweet spot: 8-10 tags

    # Caption template (LLM will refine this in its spoken response,
    # but we return a structured starting point)
    caption = f"{video_topic} {hashtag_string}"

    result = {
        "caption": caption,
        "hashtags": hashtag_string,
        "vibe": vibe_description,
        "tip": "Post between 6–10pm local time for max reach.",
    }
    # Cache for the results endpoint
    global _last_caption
    _last_caption = result
    return result
