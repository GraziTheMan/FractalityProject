"""
Node content: the markdown page behind each concept.

`content` began life as free-form metadata, tolerated by NodeMetadata's
`extra: "allow"` and swept into `metadata_json`. It is now a real column. Both
directions of that change are tested here, because the failure mode of getting it
wrong is not a wrong answer — it is a TypeError on read for every map saved
before the change.
"""

import json

import pytest
from pydantic import ValidationError

from api.models import MAX_NODE_CONTENT, MapNode, NodeMetadata
from api.repository import _node_to_params, _row_to_node


PAGE = "# Duality\n\nFrom the Fractiverse flows **Duality**.\n\n- Motion\n- Stillness\n"


def node(node_id="n1", **metadata):
    return MapNode(id=node_id, metadata=NodeMetadata(**metadata))


# --- the model -------------------------------------------------------------


def test_content_defaults_to_empty():
    assert node().metadata.content == ""


def test_content_is_kept_verbatim():
    """Markdown is whitespace-significant: stripping it would change the page."""
    page = "  indented\n\n\ttab-indented\n"
    assert node(content=page).metadata.content == page


def test_content_is_separate_from_description():
    n = node(description="A one-line summary", content=PAGE)
    assert n.metadata.description == "A one-line summary"
    assert n.metadata.content == PAGE


def test_content_over_the_cap_is_refused():
    with pytest.raises(ValidationError):
        node(content="x" * (MAX_NODE_CONTENT + 1))


def test_content_at_the_cap_is_accepted():
    assert len(node(content="x" * MAX_NODE_CONTENT).metadata.content) == MAX_NODE_CONTENT


# --- storage ---------------------------------------------------------------


def test_content_is_stored_as_its_own_property():
    params = _node_to_params(node(content=PAGE))
    assert params["content"] == PAGE


def test_content_is_not_duplicated_into_metadata_json():
    """Storing it twice doubles the cost of the largest field on the node."""
    params = _node_to_params(node(content=PAGE))
    blob = json.loads(params["metadata_json"] or "{}")
    assert "content" not in blob


def test_other_metadata_still_reaches_metadata_json():
    params = _node_to_params(node(content=PAGE, colour="indigo"))
    assert json.loads(params["metadata_json"])["colour"] == "indigo"


def test_a_node_with_no_extras_stores_no_metadata_json():
    assert _node_to_params(node(content=PAGE))["metadata_json"] is None


# --- reading ---------------------------------------------------------------


def row(**overrides):
    base = {"id": "n1", "label": "Node", "depth": 0}
    base.update(overrides)
    return base


def test_content_round_trips():
    params = _node_to_params(node(content=PAGE))
    assert _row_to_node(row(**params)).metadata.content == PAGE


def test_a_row_with_no_content_reads_as_empty():
    assert _row_to_node(row()).metadata.content == ""


def test_content_stored_before_the_migration_is_still_read():
    """A map saved when content was free-form metadata must still open."""
    read = _row_to_node(row(metadata_json=json.dumps({"content": PAGE})))
    assert read.metadata.content == PAGE


def test_a_row_carrying_content_in_both_places_does_not_raise():
    """
    The bug this guards: NodeMetadata(content=..., **{"content": ...}) is a
    TypeError. A row rewritten after the migration can legitimately have the old
    key still in its blob, and opening that map must not 500.
    """
    read = _row_to_node(row(
        content=PAGE,
        metadata_json=json.dumps({"content": "the older page"}),
    ))
    assert read.metadata.content == PAGE


def test_the_column_wins_over_the_blob_only_when_it_has_something():
    read = _row_to_node(row(
        content="",
        metadata_json=json.dumps({"content": PAGE}),
    ))
    assert read.metadata.content == PAGE


def test_extras_survive_alongside_a_migrated_content():
    read = _row_to_node(row(
        metadata_json=json.dumps({"content": PAGE, "colour": "indigo"}),
    ))
    assert read.metadata.content == PAGE
    assert read.metadata.colour == "indigo"
