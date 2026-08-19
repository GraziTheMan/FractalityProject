"""
Convergent emergence at the API edge.

A node has two kinds of parent: one containing scale (`parentId`) and any number of
contributing streams (`emergesFrom`). That turns the graph from a tree into a DAG,
which breaks two things the old validation relied on:

  * a cycle can now close through an edge `parentId` knows nothing about
  * depth can no longer be found by walking one chain upward

Both are checked here. The cycle tests matter most: a cycle that reaches the database
makes depth computation and camera framing non-terminating, so the client hangs rather
than showing a bad map.
"""

import pytest

from api.models import MapNode, validate_graph


def node(node_id, parent=None, emerges=(), depth=0, children=()):
    return MapNode(
        id=node_id,
        parentId=parent,
        emergesFrom=list(emerges),
        childIds=list(children),
        depth=depth,
        metadata={"label": node_id},
    )


def fractiverse():
    """The shape from the axioms: four streams converging into consciousness."""
    return [
        node("fractiverse", depth=0,
             children=["axiom-i", "axiom-ii", "axiom-iii", "axiom-iv", "consciousness"]),
        node("axiom-i", parent="fractiverse", depth=1),
        node("axiom-ii", parent="fractiverse", depth=1),
        node("axiom-iii", parent="fractiverse", depth=1),
        node("axiom-iv", parent="fractiverse", depth=1),
        node("consciousness", parent="fractiverse", depth=2,
             emerges=["axiom-i", "axiom-ii", "axiom-iii", "axiom-iv"],
             children=["qualia"]),
        node("qualia", parent="consciousness", depth=3),
    ]


# --- the shape is accepted -------------------------------------------------


def test_a_convergent_map_is_accepted():
    validate_graph(fractiverse(), root_id="fractiverse")


def test_a_node_may_emerge_from_many_and_be_contained_by_one():
    n = node("consciousness", parent="fractiverse", emerges=["a", "b", "c", "d"])
    assert n.parentId == "fractiverse"
    assert len(n.emergesFrom) == 4


def test_a_map_with_no_emergence_is_unaffected():
    """The change is additive; an existing map must validate exactly as before."""
    validate_graph(
        [node("root", children=["a"]), node("a", parent="root", depth=1)],
        root_id="root",
    )


# --- dangling references ---------------------------------------------------


def test_emerging_from_a_missing_node_is_refused():
    nodes = [node("root"), node("a", parent="root", depth=1, emerges=["ghost"])]
    with pytest.raises(ValueError, match="emerges from missing node ghost"):
        validate_graph(nodes, root_id="root")


def test_emerging_from_itself_is_refused():
    nodes = [node("root"), node("a", parent="root", depth=1, emerges=["a"])]
    with pytest.raises(ValueError, match="emerges from itself"):
        validate_graph(nodes, root_id="root")


# --- cycles ----------------------------------------------------------------


def test_a_cycle_of_emergence_edges_is_refused():
    nodes = [
        node("root", children=["a", "b"]),
        node("a", parent="root", depth=1, emerges=["b"]),
        node("b", parent="root", depth=1, emerges=["a"]),
    ]
    with pytest.raises(ValueError, match="parent cycle"):
        validate_graph(nodes, root_id="root")


def test_a_cycle_mixing_containment_and_emergence_is_refused():
    """
    The case the old check could not see, and the reason it is now a graph search.

    Walking the single parentId chain from `deep` reaches root and stops. The loop is
    deep -> (contained by) mid -> (emerges from) deep, and it only exists because the
    two relations can be traversed together.
    """
    nodes = [
        node("root", children=["mid"]),
        node("mid", parent="root", depth=1, emerges=["deep"], children=["deep"]),
        node("deep", parent="mid", depth=2),
    ]
    with pytest.raises(ValueError, match="parent cycle"):
        validate_graph(nodes, root_id="root")


def test_a_long_cycle_through_several_emergence_edges_is_refused():
    nodes = [
        node("root", children=["a", "b", "c"]),
        node("a", parent="root", depth=1, emerges=["c"]),
        node("b", parent="root", depth=1, emerges=["a"]),
        node("c", parent="root", depth=1, emerges=["b"]),
    ]
    with pytest.raises(ValueError, match="parent cycle"):
        validate_graph(nodes, root_id="root")


def test_a_diamond_is_not_a_cycle():
    """
    The whole point of allowing a DAG. Two paths reaching the same ancestor is
    convergence, not a loop, and a checker that cannot tell them apart is useless
    here — this is the single most likely shape in a real map.
    """
    nodes = [
        node("root", children=["left", "right", "join"]),
        node("left", parent="root", depth=1),
        node("right", parent="root", depth=1),
        node("join", parent="root", depth=2, emerges=["left", "right"]),
    ]
    validate_graph(nodes, root_id="root")


def test_a_deep_chain_does_not_exhaust_the_stack():
    """Iterative on purpose: a deep chain is normal in a user-built map."""
    nodes = [node("n0", depth=0)]
    for i in range(1, 2000):
        nodes.append(node(f"n{i}", parent=f"n{i-1}", depth=i))
    validate_graph(nodes, root_id="n0")


def test_a_wide_convergence_does_not_exhaust_the_stack():
    nodes = [node("root", depth=0)]
    for i in range(500):
        nodes.append(node(f"s{i}", parent="root", depth=1))
    nodes.append(node("join", parent="root", depth=2,
                      emerges=[f"s{i}" for i in range(500)]))
    validate_graph(nodes, root_id="root")


# --- the tier rule ---------------------------------------------------------


def test_a_contributor_below_its_own_emergent_node_is_refused():
    """
    This is what makes the cone mean something: emergence must never be drawn above
    something that feeds it. A client computing depth by walking parentId alone would
    place `join` at tier 1, level with a contributor at tier 3.
    """
    nodes = [
        node("root", children=["a", "join"]),
        node("a", parent="root", depth=1, children=["deep"]),
        node("deep", parent="a", depth=2),
        node("join", parent="root", depth=1, emerges=["deep"]),
    ]
    with pytest.raises(ValueError, match="must be above its child"):
        validate_graph(nodes, root_id="root")


def test_a_contributor_level_with_its_emergent_node_is_refused():
    nodes = [
        node("root", children=["a", "join"]),
        node("a", parent="root", depth=1),
        node("join", parent="root", depth=1, emerges=["a"]),
    ]
    with pytest.raises(ValueError, match="must be above its child"):
        validate_graph(nodes, root_id="root")


def test_a_containing_parent_below_its_child_is_refused():
    """The rule applies to containment too, which was never checked before."""
    nodes = [node("root", depth=5, children=["a"]), node("a", parent="root", depth=1)]
    with pytest.raises(ValueError, match="must be above its child"):
        validate_graph(nodes, root_id="root")


def test_depths_need_not_be_maximal_only_ordered():
    """
    Ordering is checked, not the exact value.

    A map from an older client can have depths that are internally consistent but not
    yet 1 + max(parents). Refusing those would make this an upgrade barrier rather than
    a correctness check, and the client recomputes on load anyway.
    """
    nodes = [
        node("root", children=["a", "join"]),
        node("a", parent="root", depth=1),
        node("join", parent="root", depth=9, emerges=["a"]),
    ]
    validate_graph(nodes, root_id="root")


# --- storage round trip ----------------------------------------------------


def test_emergence_reaches_the_stored_parameters():
    from api.repository import _node_to_params, _row_to_node

    n = node("join", parent="root", depth=2, emerges=["a", "b"])
    params = _node_to_params(n)
    # Not a stored property: EMERGES_FROM relationships are authoritative, exactly as
    # HAS_CHILD is for containment, so a property here could disagree with them.
    assert "emergesFrom" not in params

    read = _row_to_node({"id": "join", "depth": 2, "emergesFrom": ["b", "a"]})
    # Sorted on read: collect() gives no order, and an unstable one would make an
    # unchanged map look changed every time it was read.
    assert read.emergesFrom == ["a", "b"]


def test_a_row_with_no_emergence_reads_as_empty():
    from api.repository import _row_to_node

    assert _row_to_node({"id": "a", "depth": 0}).emergesFrom == []


def test_nulls_from_an_empty_collect_are_dropped():
    from api.repository import _row_to_node

    assert _row_to_node({"id": "a", "depth": 0, "emergesFrom": [None]}).emergesFrom == []
