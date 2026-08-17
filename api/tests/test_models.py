"""
Graph validation tests.

These are the guard against storing a map the 3D view cannot traverse. A cycle in
particular makes depth computation and camera framing non-terminating, so it must
be rejected at the edge rather than discovered in the renderer.
"""

import pytest
from pydantic import ValidationError

from api.models import (
    MapNode,
    MindMapCreate,
    NodesReplace,
    Visibility,
    validate_graph,
)


def node(node_id, parent=None, children=(), depth=0, label=""):
    return MapNode(
        id=node_id,
        parentId=parent,
        childIds=list(children),
        depth=depth,
        metadata={"label": label or node_id},
    )


# --- node-level ------------------------------------------------------------


def test_node_defaults_match_frontend_schema():
    n = MapNode(id="a")
    dumped = n.model_dump()

    # Field-for-field parity with FractalNode.toJSON() in NodeSchema.js
    assert set(dumped) == {
        "id", "parentId", "childIds", "depth",
        "metadata", "energy", "resonance", "visual", "timestamps",
    }
    assert dumped["energy"]["ATP"] == 1.0
    assert dumped["visual"]["color"] == "#00ff00"
    assert dumped["metadata"]["type"] == "default"


def test_node_rejects_blank_id():
    with pytest.raises(ValidationError):
        MapNode(id="   ")


def test_node_rejects_self_parent():
    with pytest.raises(ValidationError, match="its own parent"):
        MapNode(id="a", parentId="a")


def test_node_rejects_self_child():
    with pytest.raises(ValidationError, match="its own child"):
        MapNode(id="a", childIds=["a"])


def test_node_metadata_allows_extra_fields():
    n = MapNode(id="a", metadata={"label": "x", "customField": 42})
    assert n.metadata.model_dump()["customField"] == 42


# --- graph-level -----------------------------------------------------------


def test_valid_tree_passes():
    nodes = [
        node("root", children=["a", "b"]),
        node("a", parent="root", depth=1),
        node("b", parent="root", depth=1),
    ]
    validate_graph(nodes, "root")  # must not raise


def test_empty_graph_is_allowed():
    validate_graph([], None)


def test_duplicate_ids_rejected():
    with pytest.raises(ValueError, match="duplicate node ids"):
        validate_graph([node("a"), node("a")], None)


def test_dangling_parent_rejected():
    with pytest.raises(ValueError, match="missing parent"):
        validate_graph([node("a", parent="ghost")], None)


def test_dangling_child_rejected():
    with pytest.raises(ValueError, match="missing child"):
        validate_graph([node("a", children=["ghost"])], None)


def test_root_must_exist():
    with pytest.raises(ValueError, match="not among the nodes"):
        validate_graph([node("a")], "root")


def test_two_node_parent_cycle_rejected():
    # a is b's parent and b is a's parent
    nodes = [node("a", parent="b"), node("b", parent="a")]
    with pytest.raises(ValueError, match="cycle"):
        validate_graph(nodes, None)


def test_three_node_parent_cycle_rejected():
    nodes = [node("a", parent="c"), node("b", parent="a"), node("c", parent="b")]
    with pytest.raises(ValueError, match="cycle"):
        validate_graph(nodes, None)


def test_deep_chain_is_not_mistaken_for_a_cycle():
    # A long but acyclic chain must pass; a naive visited-set bug would flag it
    nodes = [node("n0")]
    for i in range(1, 200):
        nodes.append(node(f"n{i}", parent=f"n{i-1}", depth=i))
    validate_graph(nodes, "n0")


def test_diamond_shape_is_allowed():
    # Two parents pointing at one child is a DAG, not a cycle. Parent pointers
    # stay single-valued, so this must not trip the cycle check.
    nodes = [
        node("root", children=["a", "b"]),
        node("a", parent="root", children=["d"], depth=1),
        node("b", parent="root", children=["d"], depth=1),
        node("d", parent="a", depth=2),
    ]
    validate_graph(nodes, "root")


# --- payload wrappers -----------------------------------------------------


def test_create_payload_validates_its_graph():
    with pytest.raises(ValidationError):
        MindMapCreate(title="bad", nodes=[node("a", parent="ghost")])


def test_create_payload_requires_a_title():
    with pytest.raises(ValidationError):
        MindMapCreate(title="")


def test_create_payload_defaults_to_private():
    payload = MindMapCreate(title="Mine")
    assert payload.visibility is Visibility.PRIVATE


def test_nodes_replace_validates_its_graph():
    with pytest.raises(ValidationError):
        NodesReplace(nodes=[node("a", children=["ghost"])])
