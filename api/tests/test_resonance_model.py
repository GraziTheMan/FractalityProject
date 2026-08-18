"""
The prediction model.

Every test here is about one property: the model must never sound more certain
than its evidence. A gauge that swings to its extreme on a reader's first tap is
worse than no gauge, because it looks like the app has decided something about
them.

The second property, asserted at the end: no other reader's ratings can influence
a prediction. That is what makes the number a statement about the reader rather
than a measure of the post's popularity, and it is a property of the model's
interface — it is only ever handed one reader's history.
"""

import pytest

from api.resonance import (
    FULL_CONFIDENCE_EVIDENCE,
    MIN_RATINGS_FOR_PREDICTION,
    SHRINKAGE,
    Affinity,
    Prediction,
    ReaderModel,
)


def history(rating, tag="fractal", author="u-a", times=1):
    return [(rating, [tag], author)] * times


ENOUGH = MIN_RATINGS_FOR_PREDICTION


# --- affinity --------------------------------------------------------------


def test_no_ratings_is_neutral_not_undefined():
    assert Affinity().value == 0.0


def test_one_strong_rating_does_not_produce_a_strong_affinity():
    """Shrinkage: 2 / (1 + 3) = 0.5, not 2."""
    assert Affinity(total=2.0, count=1).value == pytest.approx(2 / (1 + SHRINKAGE))


def test_affinity_approaches_the_true_mean_as_evidence_accumulates():
    weak = Affinity(total=2.0 * 2, count=2).value
    strong = Affinity(total=2.0 * 50, count=50).value
    assert weak < strong < 2.0
    assert strong == pytest.approx(2.0, abs=0.15)


def test_shrinkage_pulls_toward_neutral_from_both_directions():
    assert 0 < Affinity(2.0, 1).value < 2.0
    assert -2.0 < Affinity(-2.0, 1).value < 0


# --- the threshold ---------------------------------------------------------


def test_a_reader_with_no_history_gets_no_prediction():
    assert ReaderModel.empty().predict(["fractal"], "u-a") == Prediction(None, 0.0)


def test_below_the_threshold_there_is_no_prediction():
    model = ReaderModel.from_ratings(history(2, times=ENOUGH - 1))
    assert model.predict(["fractal"], "u-a").value is None


def test_at_the_threshold_a_prediction_appears():
    model = ReaderModel.from_ratings(history(2, times=ENOUGH))
    assert model.predict(["fractal"], "u-a").value is not None


def test_a_prediction_needs_something_in_common_with_the_history():
    """
    Saying "neutral" about a post with nothing in common would be a claim. None is
    the truth, and the difference matters because the UI draws one and not the other.
    """
    model = ReaderModel.from_ratings(history(2, tag="fractal", author="u-a", times=ENOUGH))
    assert model.predict(["cooking"], "u-stranger").value is None


# --- direction -------------------------------------------------------------


def test_liking_a_tag_predicts_resonance_for_that_tag():
    model = ReaderModel.from_ratings(history(2, times=ENOUGH))
    prediction = model.predict(["fractal"], "u-a")
    assert prediction.value > 0
    assert prediction.resonant is True


def test_disliking_a_tag_predicts_dissonance():
    model = ReaderModel.from_ratings(history(-2, times=ENOUGH))
    prediction = model.predict(["fractal"], "u-a")
    assert prediction.value < 0
    assert prediction.resonant is False


def test_mixed_history_lands_between_the_extremes():
    model = ReaderModel.from_ratings(
        history(2, tag="loved", times=ENOUGH) + history(-2, tag="hated", times=ENOUGH)
    )
    loved = model.predict(["loved"], None).value
    hated = model.predict(["hated"], None).value
    both = model.predict(["loved", "hated"], None).value
    assert hated < both < loved
    assert both == pytest.approx(0.0, abs=0.01)


def test_a_prediction_never_leaves_the_minus_one_to_one_range():
    # Far more evidence than the shrinkage can absorb, in both directions.
    for rating in (2, -2):
        model = ReaderModel.from_ratings(history(rating, times=500))
        value = model.predict(["fractal"], "u-a").value
        assert -1.0 <= value <= 1.0


def test_many_weakly_liked_tags_do_not_outweigh_one_strongly_liked_one():
    """
    The tag component is a mean, not a sum. Otherwise adding tags would be a way to
    make a post score higher, which is a lever worth pulling and therefore a lever
    someone will pull.
    """
    model = ReaderModel.from_ratings(
        history(1, tag="mild-a", times=ENOUGH)
        + history(1, tag="mild-b", times=ENOUGH)
        + history(1, tag="mild-c", times=ENOUGH)
        + history(2, tag="loved", times=ENOUGH)
    )
    many_mild = model.predict(["mild-a", "mild-b", "mild-c"], None).value
    one_loved = model.predict(["loved"], None).value
    assert one_loved > many_mild


# --- confidence ------------------------------------------------------------


def test_confidence_rises_with_evidence():
    thin = ReaderModel.from_ratings(
        history(2, tag="rare", times=1) + history(2, tag="common", times=ENOUGH)
    )
    assert thin.predict(["rare"], None).confidence < thin.predict(["common"], None).confidence


def test_confidence_is_capped_at_one():
    model = ReaderModel.from_ratings(history(2, times=int(FULL_CONFIDENCE_EVIDENCE) * 10))
    assert model.predict(["fractal"], "u-a").confidence == 1.0


def test_confidence_is_zero_whenever_there_is_no_prediction():
    model = ReaderModel.from_ratings(history(2, times=ENOUGH))
    unknown = model.predict(["nothing-in-common"], "u-nobody")
    assert unknown.value is None
    assert unknown.confidence == 0.0


# --- what counts as evidence ----------------------------------------------


def test_a_zero_rating_is_not_evidence_of_neutrality():
    """
    0 means "no opinion", which is the absence of a rating. Counting it would drag
    every affinity toward neutral in proportion to how much the reader scrolled
    past — so the more of the feed you saw, the less the model would think anything
    resonated with you.
    """
    model = ReaderModel.from_ratings(history(0, times=100))
    assert model.total_ratings == 0
    assert model.predict(["fractal"], "u-a").value is None


def test_a_repeated_tag_on_one_post_counts_once():
    model = ReaderModel.from_ratings([(2, ["fractal", "fractal", "fractal"], "u-a")] * ENOUGH)
    assert model.tags["fractal"].count == ENOUGH


def test_a_post_with_no_author_still_contributes_its_tags():
    model = ReaderModel.from_ratings([(2, ["fractal"], None)] * ENOUGH)
    assert model.predict(["fractal"], None).value > 0
    assert "" not in model.authors and None not in model.authors


def test_an_unknown_author_does_not_drag_a_tag_prediction_toward_neutral():
    """
    The weights are renormalised over the components that exist. Without that, a
    post by someone new would always read as half as resonant as the same post by a
    known author, which says something about the author and nothing about the post.
    """
    model = ReaderModel.from_ratings(history(2, tag="fractal", author="u-a", times=ENOUGH))
    known = model.predict(["fractal"], "u-a").value
    unknown = model.predict(["fractal"], "u-brand-new").value
    assert unknown == pytest.approx(known, abs=0.01)


# --- isolation -------------------------------------------------------------


def test_two_readers_of_the_same_post_get_different_answers():
    """
    The point of the whole design. If both readers got the same number it would be a
    property of the post, which is a score, which is a scoreboard.
    """
    enthusiast = ReaderModel.from_ratings(history(2, tag="fractal", times=ENOUGH))
    sceptic = ReaderModel.from_ratings(history(-2, tag="fractal", times=ENOUGH))

    assert enthusiast.predict(["fractal"], "u-a").value > 0
    assert sceptic.predict(["fractal"], "u-a").value < 0


def test_one_readers_history_cannot_reach_anothers_model():
    """
    Structural, not behavioural: a model is built from one iterable of one reader's
    ratings and holds no reference to anything shared. This asserts the absence of a
    class-level or default-argument store, which is the way that guarantee usually
    gets broken by accident.
    """
    first = ReaderModel.from_ratings(history(2, tag="fractal", times=ENOUGH))
    second = ReaderModel.from_ratings([])

    assert second.total_ratings == 0
    assert second.tags == {}
    assert second.predict(["fractal"], "u-a").value is None
    # And the first is unchanged by the second having been built.
    assert first.predict(["fractal"], "u-a").value > 0


def test_an_empty_model_is_not_shared_between_calls():
    a = ReaderModel.empty()
    b = ReaderModel.empty()
    a.tags["injected"] = Affinity(2.0, 99)
    assert "injected" not in b.tags
