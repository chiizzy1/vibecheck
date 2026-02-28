"""
Caption generator tool — creates TikTok-ready captions and hashtags.
Called by the LLM at the end of a session, or auto-triggered by the results endpoint.
"""

import random
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
    matched_aesthetic = "default"
    matched_tags = AESTHETIC_HASHTAGS["default"]
    for aesthetic, tags in AESTHETIC_HASHTAGS.items():
        if aesthetic != "default" and aesthetic in vibe_lower:
            matched_aesthetic = aesthetic
            matched_tags = tags
            break

    # Build hashtag string
    all_tags = matched_tags + UNIVERSAL_TAGS
    # Deduplicate while preserving order
    seen: set = set()
    unique_tags = []
    for t in all_tags:
        if t not in seen:
            seen.add(t)
            unique_tags.append(t)

    hashtag_string = " ".join(unique_tags[:10])  # TikTok sweet spot: 8-10 tags

    # Aesthetic-aware caption openers for TikTok-style copy
    AESTHETIC_OPENERS: Dict[str, list] = {
        "dark academia":        [
            f"dark academia {video_topic} era 🕯️📚",
            f"POV: you discovered {video_topic} and now you're a different person 📖",
            f"the {video_topic} aesthetic is taking over and I'm not sorry 🕯️",
        ],
        "clean girl":           [
            f"clean girl {video_topic} check ✨",
            f"that quiet luxury {video_topic} moment we needed 🤍",
            f"POV: effortless {video_topic} energy ✨",
        ],
        "cottagecore":          [
            f"cottagecore {video_topic} and I'm at peace 🌿",
            f"soft life {video_topic} era has arrived 🍄",
        ],
        "streetwear":           [
            f"streetwear {video_topic} fit check 🔥",
            f"the drip on this {video_topic} is not up for debate 👟",
        ],
        "y2k":                  [
            f"y2k {video_topic} throwback loading… 💿",
            f"2000s called, they want their {video_topic} back 📼",
        ],
        "indie sleaze":         [
            f"indie sleaze {video_topic} nostalgia hit different 🎸",
        ],
        "coastal grandmother":  [
            f"coastal grandmother {video_topic} and thriving 🌊",
            f"quiet luxury {video_topic} moment 🤍",
        ],
    }

    GENERIC_OPENERS = [
        f"POV: {video_topic} ✨",
        f"not me trying {video_topic} and actually loving it 💀",
        f"we need to talk about {video_topic} 💬",
        f"this {video_topic} era has arrived and I'm not looking back 🔥",
        f"real ones know: {video_topic} hits different 🎬",
    ]

    openers = AESTHETIC_OPENERS.get(matched_aesthetic, GENERIC_OPENERS)
    caption_body = random.choice(openers)
    caption = f"{caption_body} {hashtag_string}"

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
