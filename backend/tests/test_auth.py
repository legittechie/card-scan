from backend.app.auth import user_id_from_supabase_user_response


def test_user_id_from_direct_supabase_user_object():
    assert (
        user_id_from_supabase_user_response(
            {"id": "4f6d9286-3a34-4582-b306-3b8809f5907f", "email": "a@b.com"}
        )
        == "4f6d9286-3a34-4582-b306-3b8809f5907f"
    )


def test_user_id_from_wrapped_supabase_user_object():
    assert (
        user_id_from_supabase_user_response(
            {"user": {"id": "4f6d9286-3a34-4582-b306-3b8809f5907f"}}
        )
        == "4f6d9286-3a34-4582-b306-3b8809f5907f"
    )


def test_user_id_missing():
    assert user_id_from_supabase_user_response({}) is None
    assert user_id_from_supabase_user_response(None) is None
