"""
Checks that the DB-gated tests call the repository correctly — WITHOUT a database.

Why this file exists. test_integration_neo4j.py is skipped whenever NEO4J_URI is
unset, which is every CI run and every machine without credentials. A skipped test
is never even parsed for correctness, so a call with the wrong number of arguments
sits there looking fine until someone runs the suite against a live AuraDB two
minutes at a time. That is exactly what happened to
`repo.delete_map(settings, SUBJECT, summary.id)`: the function takes
(settings, map_id), because ownership is enforced in the route rather than in the
repository, and the mistake surfaced only on a real run.

Nothing here touches a database. It reads the integration module as source, finds
every `repo.<name>(...)` call, and binds the arguments to the real signature with
inspect — the same check Python would do at call time, done statically.

This generalises: the DB-gated module is the only place in the suite whose call
sites are not exercised by the default run, so it is the only place where a static
check earns its keep.
"""

import ast
import inspect
import pathlib

import pytest

from api import repository as repo

MODULE = pathlib.Path(__file__).with_name("test_integration_neo4j.py")


def _repo_calls():
    """Every `repo.<attr>(...)` call in the integration module, with its line."""
    tree = ast.parse(MODULE.read_text(encoding="utf-8"), filename=str(MODULE))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if (
            isinstance(func, ast.Attribute)
            and isinstance(func.value, ast.Name)
            and func.value.id == "repo"
        ):
            yield func.attr, node


CALLS = list(_repo_calls())


def test_the_integration_module_has_call_sites_to_check():
    """
    A guard on the guard.

    If the module is renamed or the alias changes from `repo`, every check below
    would pass by finding nothing. That failure mode is silent, so it gets its own
    assertion.
    """
    assert MODULE.exists(), f"{MODULE.name} is gone; this file is checking nothing"
    assert len(CALLS) > 20, (
        f"only found {len(CALLS)} repo.* calls in {MODULE.name}, which suggests the "
        "alias or the module changed and this check is no longer looking at anything"
    )


@pytest.mark.parametrize(
    "attr,call",
    CALLS,
    ids=[f"{attr}:L{call.lineno}" for attr, call in CALLS],
)
def test_every_repository_call_matches_its_real_signature(attr, call):
    target = getattr(repo, attr, None)
    assert target is not None, (
        f"{MODULE.name}:{call.lineno} calls repo.{attr}(), which does not exist"
    )

    # Unpacking (*args / **kwargs) makes the arity unknowable statically. None is
    # used today; skipping is honest, and asserting there are none would be a rule
    # about style rather than about correctness.
    if any(isinstance(a, ast.Starred) for a in call.args) or any(
        k.arg is None for k in call.keywords
    ):
        pytest.skip("call uses unpacking; arity cannot be checked statically")

    signature = inspect.signature(target)
    positional = [object()] * len(call.args)
    keywords = {k.arg: object() for k in call.keywords}

    try:
        signature.bind(*positional, **keywords)
    except TypeError as error:
        pytest.fail(
            f"{MODULE.name}:{call.lineno} calls repo.{attr}("
            f"{len(positional)} positional"
            + (f", {sorted(keywords)}" if keywords else "")
            + f") but the signature is {attr}{signature} — {error}"
        )
