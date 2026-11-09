"""A person's own receiving account on their profile (specs/016-vietqr, US1; docs/ACCOUNTS.md P6).

The account is the person's own: no house is needed to read, save, change or remove it, and nobody
else can do any of it (FR-004, FR-007, FR-012). Answers holding it are never cached (FR-021).
The account numbers here are made up (FR-006).
"""

import pytest

from app.services import vietqr
from tests.api import error_code
from tests.conftest import bearer

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]

ROUTE = "/api/me/receiving-account"
VCB = "970436"


def save(client, bank_bin=VCB, account_number="0123 456.789", holder_name="Nguyễn Văn Minh",
         token=None):
    headers = bearer(token) if token else {}
    return client.put(ROUTE, json={"bank_bin": bank_bin, "account_number": account_number,
                                   "holder_name": holder_name}, headers=headers)


def mine(client, token=None):
    response = client.get(ROUTE, headers=bearer(token) if token else {})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()["account"]


def test_nothing_saved_reads_as_none(client):
    assert mine(client) is None


def test_saving_cleans_the_number_and_the_name(client):
    response = save(client)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    account = response.json()["account"]
    version = account.pop("version")
    assert len(version) == 12 and all(ch in "0123456789abcdef" for ch in version)
    assert account == {"bank_bin": VCB, "bank_name": "Vietcombank", "account_number": "0123456789",
                       "holder_name": "NGUYEN VAN MINH", "supported": True}
    assert mine(client)["holder_name"] == "NGUYEN VAN MINH"


def test_saving_again_replaces_it_with_a_new_version(client):
    first = save(client).json()["account"]["version"]
    second = save(client, account_number="9988776655", holder_name="Minh").json()["account"]
    assert second["version"] != first
    assert (second["account_number"], second["holder_name"]) == ("9988776655", "MINH")


@pytest.mark.parametrize("bank_bin", ["999999", "97043", "abcdef", ""])
def test_a_bank_not_in_the_list_is_refused(client, bank_bin):
    response = save(client, bank_bin=bank_bin)
    assert response.status_code == 422
    assert error_code(response) == "unknown_bank"
    assert mine(client) is None


def test_a_bank_that_takes_no_transfers_is_refused(client, monkeypatch):
    monkeypatch.setitem(vietqr.BANKS, VCB, {**vietqr.BANKS[VCB], "transfer": False})
    response = save(client)
    assert response.status_code == 422
    assert error_code(response) == "unknown_bank"


@pytest.mark.parametrize("number", ["12a45678", "12345", "1" * 20, "", "０１２３４５６"])
def test_a_bad_account_number_is_named(client, number):
    response = save(client, account_number=number)
    assert response.status_code == 422
    assert error_code(response) == "bad_account_number"


@pytest.mark.parametrize("name", ["😀", "   ", "A" * 51])
def test_a_bad_holder_name_is_named(client, name):
    response = save(client, holder_name=name)
    assert response.status_code == 422
    assert error_code(response) == "bad_holder_name"


@pytest.mark.parametrize(
    "body",
    [{"bank_bin": 970436, "account_number": "0123456789", "holder_name": "MINH"},
     {"bank_bin": VCB, "account_number": True, "holder_name": "MINH"},
     {"bank_bin": VCB, "account_number": "0123456789"},
     {"bank_bin": VCB, "account_number": "0123456789", "holder_name": "x" * 201}],
)
def test_wrong_types_and_missing_fields_are_refused(client, body):
    response = client.put(ROUTE, json=body)
    assert response.status_code == 422
    # The error never repeats what was sent (FR-006)
    assert "0123456789" not in response.text


def test_removing_it_leaves_nothing(client):
    save(client)
    assert client.delete(ROUTE).status_code == 204
    assert mine(client) is None
    assert client.delete(ROUTE).status_code == 204  # nothing to remove is fine too


def test_each_person_sees_and_changes_only_their_own(client):
    other = client.sign_up(display_name="Lan")
    save(client)
    assert mine(client, token=other) is None
    save(client, account_number="5555555555", token=other)
    assert mine(client)["account_number"] == "0123456789"
    assert client.delete(ROUTE, headers=bearer(other)).status_code == 204
    assert mine(client)["account_number"] == "0123456789"


def test_without_a_session_nothing(client):
    anonymous = client.anonymous()
    assert anonymous.get(ROUTE).status_code == 401
    assert anonymous.put(ROUTE, json={"bank_bin": VCB, "account_number": "0123456789",
                                      "holder_name": "MINH"}).status_code == 401
    assert anonymous.delete(ROUTE).status_code == 401


def test_a_bank_dropped_from_the_list_still_shows_to_its_owner(client, monkeypatch):
    save(client)
    monkeypatch.delitem(vietqr.BANKS, VCB)
    account = mine(client)
    assert (account["supported"], account["bank_name"], account["account_number"]) == (
        False, None, "0123456789"
    )
