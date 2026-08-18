"""
Predicting what will resonate with one reader.

The feed collects a signed rating, -2..+2, from each reader on each post. Those
ratings are never aggregated into a public score. They are used for exactly one
thing: guessing how the next post will land for the person about to read it.

That distinction is the whole design. A popularity score answers "is this post
good", which is a question people compete over. This answers "is this post for
you", which is a question about the reader — so there is nothing to win, and two
readers can honestly get different answers about the same post.

Consequently the prediction for a reader is computed from that reader's OWN
ratings and nothing else. No other user's ratings enter it at any point. That is
not a privacy nicety, it is what makes the number mean what it says.

The model is deliberately simple and explainable: an affinity per tag and per
author, shrunk toward neutral by how little evidence there is. It is not
collaborative filtering and it is not a neural anything. With a handful of friends
and family there is not enough data for anything cleverer to be honest, and a
model whose output nobody can account for is a bad thing to put between people and
what they read.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .models import MAX_RATING


#: Pseudo-observations of neutrality mixed into every affinity.
#:
#: With this at 3, one +2 rating on a tag yields 0.5 rather than 2.0. Without it, a
#: single rating would produce a maximally confident affinity, and the gauge would
#: swing to its extreme on the reader's first tap — which reads as the app having
#: decided something about you on no evidence.
SHRINKAGE = 3.0

#: Ratings a reader must have given before any prediction is offered at all.
#:
#: Below this the arithmetic still produces a number, and that number is noise.
#: Showing it would be worse than showing nothing, because a confident-looking
#: gauge invites the reader to believe it.
MIN_RATINGS_FOR_PREDICTION = 8

#: How much evidence counts as full confidence. Reached quickly on purpose: this
#: scales how firmly the gauge is drawn, not whether it appears.
FULL_CONFIDENCE_EVIDENCE = 12.0

#: Tags carry more than authorship. Who wrote something matters, but a feed that
#: leans mostly on the author converges on "the people you already read", which is
#: the failure mode this is meant to avoid.
TAG_WEIGHT = 0.65
AUTHOR_WEIGHT = 0.35


@dataclass(frozen=True)
class Affinity:
    """How a reader has rated things carrying one feature.

    `total` is the sum of signed ratings, `count` how many there were. Kept as the
    pair rather than a pre-divided mean so the shrinkage can be applied here, in
    one place, instead of at each call site.
    """

    total: float = 0.0
    count: int = 0

    @property
    def value(self) -> float:
        """The shrunk mean, on the raw -2..+2 scale."""
        if self.count <= 0:
            return 0.0
        return self.total / (self.count + SHRINKAGE)


@dataclass(frozen=True)
class Prediction:
    """A guess, and how much is behind it."""

    #: -1..+1, or None when there is not enough history to say anything.
    value: Optional[float]
    #: 0..1. Zero whenever `value` is None.
    confidence: float

    @property
    def resonant(self) -> Optional[bool]:
        """Whether this is expected to resonate, or None when unknown."""
        if self.value is None:
            return None
        return self.value >= 0.0


@dataclass
class ReaderModel:
    """One reader's affinities, ready to score any number of posts."""

    tags: Dict[str, Affinity]
    authors: Dict[str, Affinity]
    total_ratings: int

    @classmethod
    def empty(cls) -> "ReaderModel":
        return cls(tags={}, authors={}, total_ratings=0)

    @classmethod
    def from_ratings(cls, ratings: Iterable[Tuple[int, Sequence[str], Optional[str]]]) -> "ReaderModel":
        """Build a model from (rating, tags, author_id) triples.

        Used by the tests and by any caller that already has the rows; the
        repository builds the same thing with a single aggregating query instead of
        pulling every rating over the wire.
        """
        tag_totals: Dict[str, List[float]] = {}
        author_totals: Dict[str, List[float]] = {}
        total = 0

        for rating, tags, author_id in ratings:
            if not rating:
                # A rating of 0 is the absence of an opinion, not evidence of a
                # neutral one. Counting it would drag every affinity toward zero in
                # proportion to how much the reader scrolled past.
                continue
            total += 1
            for tag in {t for t in tags if t}:
                bucket = tag_totals.setdefault(tag, [0.0, 0])
                bucket[0] += rating
                bucket[1] += 1
            if author_id:
                bucket = author_totals.setdefault(author_id, [0.0, 0])
                bucket[0] += rating
                bucket[1] += 1

        return cls(
            tags={k: Affinity(v[0], int(v[1])) for k, v in tag_totals.items()},
            authors={k: Affinity(v[0], int(v[1])) for k, v in author_totals.items()},
            total_ratings=total,
        )

    def predict(self, tags: Sequence[str], author_id: Optional[str]) -> Prediction:
        """What this reader is likely to make of a post with these features."""
        if self.total_ratings < MIN_RATINGS_FOR_PREDICTION:
            return Prediction(None, 0.0)

        components: List[Tuple[float, float]] = []   # (weight, value on -2..+2)
        evidence = 0.0

        known_tags = [self.tags[t] for t in {t for t in tags if t} if t in self.tags]
        if known_tags:
            # The mean across the post's tags, not the sum: a post with five tags
            # the reader likes a little is not a stronger match than one with a
            # single tag they love.
            components.append((TAG_WEIGHT, sum(a.value for a in known_tags) / len(known_tags)))
            evidence += sum(a.count for a in known_tags) / len(known_tags)

        if author_id and author_id in self.authors:
            author = self.authors[author_id]
            components.append((AUTHOR_WEIGHT, author.value))
            evidence += author.count

        if not components:
            # Nothing in common with anything the reader has rated. Saying "neutral"
            # here would be a claim; None is the truth.
            return Prediction(None, 0.0)

        # Renormalise over the components that exist, so a post by an unknown author
        # is scored on its tags alone rather than being halved toward neutral.
        weight_total = sum(w for w, _ in components)
        raw = sum(w * v for w, v in components) / weight_total

        value = max(-1.0, min(1.0, raw / MAX_RATING))
        confidence = max(0.0, min(1.0, evidence / FULL_CONFIDENCE_EVIDENCE))

        return Prediction(round(value, 4), round(confidence, 4))
