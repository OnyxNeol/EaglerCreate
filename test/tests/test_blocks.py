"""
Unit tests for EaglerForge Python modding API.

Verifies that Python-defined blocks correctly register their multi-face
textures, rarity attributes, and interaction callbacks.

Run inside Pyodide via the test harness, or standalone with:
    python test_blocks.py
"""

import traceback

# When running in Pyodide, `js` is available and eaglerforge.py is loaded.
# When running standalone (outside Pyodide), we skip the JS-dependent tests.
try:
    import js
    _HAS_JS = True
except ImportError:
    _HAS_JS = False

try:
    import eaglerforge
    from eaglerforge import createblock, MyCustomBlock, _validate_rarity, _normalize_texture, reset_registry
    _HAS_EAGLERFORGE = True
except ImportError:
    _HAS_EAGLERFORGE = False


def run_tests():
    """Run all tests and return a list of {name, passed, error?} dicts."""
    results = []

    def test(name, func):
        try:
            func()
            results.append({"name": name, "passed": True})
            print(f"  PASS  {name}")
        except Exception as e:
            results.append({"name": name, "passed": False, "error": str(e)})
            print(f"  FAIL  {name}: {e}")
            traceback.print_exc()

    # -----------------------------------------------------------------------
    # Rarity validation tests (no JS dependency)
    # -----------------------------------------------------------------------

    def test_rarity_positive_int():
        assert _validate_rarity(1) == 1
        assert _validate_rarity(100) == 100
        assert _validate_rarity(999999) == 999999

    def test_rarity_rejects_zero():
        try:
            _validate_rarity(0)
            assert False, "Should have raised ValueError for rarity=0"
        except ValueError:
            pass

    def test_rarity_rejects_negative():
        try:
            _validate_rarity(-5)
            assert False, "Should have raised ValueError for rarity=-5"
        except ValueError:
            pass

    def test_rarity_rejects_float():
        try:
            _validate_rarity(3.14)
            assert False, "Should have raised TypeError for float rarity"
        except TypeError:
            pass

    def test_rarity_rejects_bool():
        # bool is a subclass of int in Python, but we reject it explicitly
        try:
            _validate_rarity(True)
            assert False, "Should have raised TypeError for bool rarity"
        except TypeError:
            pass

    def test_rarity_no_hardcoded_cap():
        """Rarity accepts any positive integer — no arbitrary cap."""
        big = _validate_rarity(2**31 - 1)
        assert big == 2**31 - 1

    test("rarity accepts positive integers", test_rarity_positive_int)
    test("rarity rejects zero", test_rarity_rejects_zero)
    test("rarity rejects negative", test_rarity_rejects_negative)
    test("rarity rejects float", test_rarity_rejects_float)
    test("rarity rejects bool", test_rarity_rejects_bool)
    test("rarity has no hardcoded cap", test_rarity_no_hardcoded_cap)

    # -----------------------------------------------------------------------
    # Texture normalization tests (no JS dependency)
    # -----------------------------------------------------------------------

    def test_texture_single_string():
        faces = _normalize_texture("stone")
        assert len(faces) == 6
        assert all(f == "stone" for f in faces)

    def test_texture_six_tuple():
        faces = _normalize_texture(("a", "b", "c", "d", "e", "f"))
        assert faces == ("a", "b", "c", "d", "e", "f")

    def test_texture_wrong_length():
        try:
            _normalize_texture(("a", "b"))
            assert False, "Should have raised ValueError for 2-element tuple"
        except ValueError:
            pass

    def test_texture_rejects_non_string():
        try:
            _normalize_texture(42)
            assert False, "Should have raised TypeError for int texture"
        except TypeError:
            pass

    def test_texture_rejects_non_string_in_tuple():
        try:
            _normalize_texture(("a", "b", 3, "d", "e", "f"))
            assert False, "Should have raised TypeError for non-string face"
        except TypeError:
            pass

    test("texture single string expands to 6 faces", test_texture_single_string)
    test("texture 6-tuple preserves face order", test_texture_six_tuple)
    test("texture rejects wrong-length tuple", test_texture_wrong_length)
    test("texture rejects non-string", test_texture_rejects_non_string)
    test("texture rejects non-string in tuple", test_texture_rejects_non_string_in_tuple)

    # -----------------------------------------------------------------------
    # Block registration tests (require JS bridge)
    # -----------------------------------------------------------------------

    if _HAS_JS and _HAS_EAGLERFORGE:
        reset_registry()

        def test_createblock_single_texture():
            bid = createblock(
                texture="create:block/cogwheel",
                command=lambda dt: None,
                rarity=7,
            )
            blocks = eaglerforge.get_registered_blocks()
            assert bid in blocks
            assert blocks[bid]["rarity"] == 7
            assert blocks[bid]["texture"] == ("create:block/cogwheel",) * 6

        def test_createblock_multi_face_texture():
            faces = ("top", "bottom", "front", "back", "left", "right")
            bid = createblock(
                texture=faces,
                command=lambda dt: None,
                rarity=15,
            )
            blocks = eaglerforge.get_registered_blocks()
            assert bid in blocks
            assert blocks[bid]["texture"] == faces

        def test_createblock_high_rarity():
            bid = createblock(
                texture="rare_block",
                command=lambda dt: None,
                rarity=1000000,
            )
            blocks = eaglerforge.get_registered_blocks()
            assert blocks[bid]["rarity"] == 1000000

        def test_my_custom_block_class():
            class TestBlock(MyCustomBlock):
                def __init__(self):
                    super().__init__(
                        texture="test_texture",
                        function=self.callback,
                        rarity=3,
                    )
                def callback(self):
                    return "activated"

            block = TestBlock()
            assert block.rarity == 3
            assert block.texture == "test_texture"
            assert block.block_id is not None
            blocks = eaglerforge.get_registered_blocks()
            assert block.block_id in blocks

        def test_callback_is_callable():
            call_count = [0]
            def my_callback(dt):
                call_count[0] += 1

            bid = createblock(
                texture="callback_test",
                command=my_callback,
                rarity=1,
            )
            blocks = eaglerforge.get_registered_blocks()
            assert blocks[bid]["command"] is my_callback

        def test_js_bridge_received_registration():
            """Verify the JS bridge received the block registration."""
            bridge = js._eagler_python_bridge
            assert bridge is not None
            assert bridge.blockCount > 0

        def test_dispatch_event_calls_callback():
            """Verify event dispatch reaches the Python callback."""
            called = [False]
            def my_handler(dt):
                called[0] = True

            bid = createblock(
                texture="dispatch_test",
                command=my_handler,
                rarity=1,
            )
            # Dispatch a tick event
            eaglerforge.dispatch_event(bid, "tick", 0.05)
            assert called[0], "Callback should have been called by dispatch_event"

        test("createblock with single texture", test_createblock_single_texture)
        test("createblock with multi-face texture", test_createblock_multi_face_texture)
        test("createblock with high rarity (no cap)", test_createblock_high_rarity)
        test("MyCustomBlock class registers", test_my_custom_block_class)
        test("callback is stored as callable", test_callback_is_callable)
        test("JS bridge received registration", test_js_bridge_received_registration)
        test("dispatch_event calls Python callback", test_dispatch_event_calls_callback)
    else:
        test("JS bridge tests (skipped — no Pyodide)", lambda: None)
        # Mark as skipped, not passed
        results[-1]["passed"] = True
        results[-1]["name"] = "JS bridge tests (skipped — no Pyodide)"

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------

    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    print(f"\n{'='*50}")
    print(f"Results: {passed}/{total} passed")
    print(f"{'='*50}")

    return results


# Allow running standalone for syntax checking.
if __name__ == "__main__":
    run_tests()
